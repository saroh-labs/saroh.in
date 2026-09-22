import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma, Service } from "@saroh/database";
import { Prisma as PrismaNamespace, prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    BookingEventType,
    BookingsService,
} from "../bookings/bookings.service";
import { InvoicesService } from "../invoices/invoices.service";
import { paymentsOn } from "../invoices/payments-on";
import { contactName } from "../invoices/serialize";
import { allows, authorize } from "../organizations/organization-policy";
import type {
    AddSessionDto,
    CourseInputDto,
    CourseStatus,
    EnrolDto,
    ListCoursesQueryDto,
    ListEnrollmentsQueryDto,
} from "./dto";

type Tx = Prisma.TransactionClient;

const LIST_LIMIT = 500;
const MINUTE_MS = 60_000;
/** An enrolment writes one booking per session; give a long course room. */
const TX_TIMEOUT_MS = 30_000;

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function notFound(what: string, field?: string): never {
    throw new NotFoundException(
        field
            ? { message: `${what} not found`, details: { field } }
            : `${what} not found`,
    );
}

function code(err: unknown): string | undefined {
    return (err as { code?: string }).code;
}

export interface SessionView {
    id: string;
    startAt: string;
    endAt: string;
}

export interface CourseView {
    id: string;
    service: {
        id: string;
        name: string;
        capacity: number;
        durationMinutes: number;
    };
    name: string;
    description: string | null;
    price: string;
    currency: string;
    seats: number;
    /** People on it now. */
    enrolled: number;
    seatsLeft: number;
    status: CourseStatus;
    sessions: SessionView[];
    /** Sessions still to come. */
    sessionsLeft: number;
    nextSessionAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EnrollmentView {
    id: string;
    course: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    status: "ACTIVE" | "CANCELLED";
    price: string;
    currency: string;
    /** Their sessions still to come that are booked. */
    upcoming: number;
    cancelledAt: string | null;
    /** The invoice for it; null with Payments off, or to a role without invoices. */
    invoiceId: string | null;
    createdAt: string;
}

export interface CourseDetail extends CourseView {
    enrollments: EnrollmentView[];
}

const COURSE_SELECT = {
    id: true,
    name: true,
    description: true,
    price: true,
    currency: true,
    seats: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    service: {
        select: {
            id: true,
            name: true,
            capacity: true,
            durationMinutes: true,
        },
    },
    sessions: {
        orderBy: { startAt: "asc" },
        select: { id: true, startAt: true, endAt: true },
    },
    _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
} satisfies Prisma.CourseSelect;

type CourseRow = Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>;

const ENROLLMENT_SELECT = {
    id: true,
    status: true,
    price: true,
    currency: true,
    cancelledAt: true,
    createdAt: true,
    course: { select: { id: true, name: true } },
    contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    invoices: {
        where: { status: { not: "VOID" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
    },
} satisfies Prisma.CourseEnrollmentSelect;

type EnrollmentRow = Prisma.CourseEnrollmentGetPayload<{
    select: typeof ENROLLMENT_SELECT;
}>;

/**
 * Courses: a named run of dated sessions on one service, with seats and a
 * price (ADR-007). Enrolling someone books every session still to come and,
 * with Payments on, invoices them — all in one transaction, so a full
 * session leaves nothing half-made. Sessions are real bookings on the
 * course's service, so they sit on the schedule with everything else.
 *
 * Each write that books takes a lock on the course row and runs
 * Serializable, like the booking page: two enrolments race for the last
 * seat through the lock, and an enrolment and a public booking race for a
 * session's time through Postgres.
 */
@Injectable()
export class CoursesService {
    constructor(
        private readonly bookings: BookingsService,
        private readonly invoices: InvoicesService,
    ) {}

    // — Courses ———————————————————————————————————————————————————

    async list(
        ctx: OrganizationContext,
        query: ListCoursesQueryDto,
    ): Promise<CourseView[]> {
        authorize(ctx, "course:read");
        const rows = await prisma.course.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.status ? { status: query.status } : {}),
                ...(query.serviceId ? { serviceId: query.serviceId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: COURSE_SELECT,
        });
        const now = new Date();
        return rows.map((r) => courseView(r, now));
    }

    async get(ctx: OrganizationContext, id: string): Promise<CourseDetail> {
        authorize(ctx, "course:read");
        const row = await this.readCourse(ctx.organizationId, id);
        const enrollments = await prisma.courseEnrollment.findMany({
            where: { organizationId: ctx.organizationId, courseId: id },
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            select: ENROLLMENT_SELECT,
        });
        const upcoming = await this.upcomingByEnrollment(
            enrollments.map((e) => e.id),
        );
        return {
            ...courseView(row, new Date()),
            enrollments: enrollments.map((e) =>
                enrollmentView(ctx, e, upcoming.get(e.id) ?? 0),
            ),
        };
    }

    async create(
        ctx: OrganizationContext,
        dto: CourseInputDto,
    ): Promise<CourseDetail> {
        authorize(ctx, "course:write");
        const { organizationId } = ctx;
        if (!dto.serviceId) fieldError("Choose the service", "serviceId");
        if (!dto.name) fieldError("Give the course a name", "name");
        if (dto.price === undefined) fieldError("Give it a price", "price");
        if (dto.seats === undefined) fieldError("Say how many seats", "seats");

        const service = await this.requireService(
            organizationId,
            dto.serviceId,
        );
        assertSeatsFit(dto.seats, service.capacity);
        const currency = dto.currency ?? service.currency;
        if (!currency) fieldError("Choose a currency", "currency");
        const sessions = sessionTimes(dto.sessions ?? [], service);
        const status = dto.status ?? "DRAFT";
        if (status === "OPEN" && sessions.length === 0) {
            fieldError("Add a session before opening the course", "status");
        }
        if (status === "ARCHIVED") {
            fieldError("A new course cannot start archived", "status");
        }

        const created = await prisma.course.create({
            data: {
                organizationId,
                serviceId: service.id,
                name: dto.name,
                description: dto.description ?? null,
                price: dto.price,
                currency,
                seats: dto.seats,
                status,
                sessions: {
                    create: sessions.map((s) => ({ organizationId, ...s })),
                },
            },
            select: { id: true },
        });
        return this.get(ctx, created.id);
    }

    /**
     * Change a course. Its service is fixed; seats stay within the
     * service's capacity and above the people already on it; opening needs a
     * session; archiving needs nobody still to come.
     */
    async update(
        ctx: OrganizationContext,
        id: string,
        dto: CourseInputDto,
    ): Promise<CourseDetail> {
        authorize(ctx, "course:write");
        const { organizationId } = ctx;
        if (dto.sessions !== undefined) {
            fieldError(
                "Add and remove sessions one at a time, so everyone on the course is booked",
                "sessions",
            );
        }
        await prisma.$transaction(async (tx) => {
            await lockCourse(tx, organizationId, id);
            const course = await tx.course.findFirst({
                where: { id, organizationId },
                select: {
                    serviceId: true,
                    status: true,
                    service: { select: { capacity: true } },
                    _count: {
                        select: {
                            sessions: true,
                            enrollments: { where: { status: "ACTIVE" } },
                        },
                    },
                },
            });
            if (!course) notFound("Course");
            if (
                dto.serviceId !== undefined &&
                dto.serviceId !== course.serviceId
            ) {
                fieldError(
                    "A course stays on the service it was made for. Make a new course for another service.",
                    "serviceId",
                );
            }
            if (dto.seats !== undefined) {
                assertSeatsFit(dto.seats, course.service.capacity);
                const on = course._count.enrollments;
                if (dto.seats < on) {
                    fieldError(
                        `${on} ${on === 1 ? "person is" : "people are"} on this course, so it needs at least ${on} ${on === 1 ? "seat" : "seats"}.`,
                        "seats",
                    );
                }
            }
            if (dto.status !== undefined && dto.status !== course.status) {
                if (dto.status === "OPEN" && course._count.sessions === 0) {
                    fieldError(
                        "Add a session before opening the course",
                        "status",
                    );
                }
                if (dto.status === "ARCHIVED") {
                    const still = await tx.booking.count({
                        where: {
                            status: "CONFIRMED",
                            startAt: { gt: new Date() },
                            courseEnrollment: {
                                courseId: id,
                                status: "ACTIVE",
                            },
                        },
                    });
                    if (still > 0) {
                        throw new ConflictException(
                            "People are still booked on this course's sessions to come. Close it instead, or cancel their enrolments first.",
                        );
                    }
                }
            }
            await tx.course.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(dto.description !== undefined
                        ? {
                              description:
                                  dto.description === ""
                                      ? null
                                      : dto.description,
                          }
                        : {}),
                    ...(dto.price !== undefined ? { price: dto.price } : {}),
                    ...(dto.currency !== undefined
                        ? { currency: dto.currency }
                        : {}),
                    ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
                    ...(dto.status !== undefined ? { status: dto.status } : {}),
                },
            });
        });
        return this.get(ctx, id);
    }

    // — Sessions ——————————————————————————————————————————————————

    /**
     * Add a session. Everyone on the course is booked into it in the same
     * transaction; if the time cannot take them all, nothing is added.
     */
    async addSession(
        ctx: OrganizationContext,
        courseId: string,
        dto: AddSessionDto,
    ): Promise<CourseDetail> {
        authorize(ctx, "course:write");
        const { organizationId } = ctx;
        const startAt = new Date(dto.startAt);
        if (startAt <= new Date()) {
            fieldError("A new session has to be in the future", "startAt");
        }
        await this.serializable(async (tx) => {
            await lockCourse(tx, organizationId, courseId);
            const course = await tx.course.findFirst({
                where: { id: courseId, organizationId },
                select: {
                    id: true,
                    status: true,
                    service: true,
                    sessions: { select: { startAt: true } },
                },
            });
            if (!course) notFound("Course");
            if (course.status === "ARCHIVED") {
                throw new ConflictException(
                    "This course is archived. Restore it before adding sessions.",
                );
            }
            if (
                course.sessions.some(
                    (s) => s.startAt.getTime() === startAt.getTime(),
                )
            ) {
                fieldError("The course already has a session then", "startAt");
            }
            const session = {
                startAt,
                endAt: new Date(
                    startAt.getTime() +
                        course.service.durationMinutes * MINUTE_MS,
                ),
            };
            await tx.courseSession.create({
                data: { organizationId, courseId, ...session },
            });
            const enrolled = await tx.courseEnrollment.findMany({
                where: { courseId, status: "ACTIVE" },
                select: {
                    id: true,
                    contact: {
                        select: {
                            email: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                        },
                    },
                },
            });
            for (const e of enrolled) {
                await this.bookSession(
                    tx,
                    ctx,
                    course.service,
                    courseId,
                    e,
                    session,
                    "That time cannot take everyone on the course. Raise the service's capacity or pick another time.",
                );
            }
        }, "That changed while you were adding the session. Try again.");
        return this.get(ctx, courseId);
    }

    /** Remove a session nobody is booked on. */
    async removeSession(
        ctx: OrganizationContext,
        courseId: string,
        sessionId: string,
    ): Promise<CourseDetail> {
        authorize(ctx, "course:write");
        const { organizationId } = ctx;
        await prisma.$transaction(async (tx) => {
            await lockCourse(tx, organizationId, courseId);
            const session = await tx.courseSession.findFirst({
                where: { id: sessionId, courseId, organizationId },
                select: { id: true, startAt: true },
            });
            if (!session) notFound("Session");
            const booked = await tx.booking.count({
                where: {
                    status: "CONFIRMED",
                    startAt: session.startAt,
                    courseEnrollment: { courseId },
                },
            });
            if (booked > 0) {
                throw new ConflictException(
                    `${booked} ${booked === 1 ? "person is" : "people are"} booked on this session. Cancel their bookings first.`,
                );
            }
            await tx.courseSession.delete({ where: { id: session.id } });
        });
        return this.get(ctx, courseId);
    }

    // — Enrolments ————————————————————————————————————————————————

    async listEnrollments(
        ctx: OrganizationContext,
        query: ListEnrollmentsQueryDto,
    ): Promise<EnrollmentView[]> {
        authorize(ctx, "course:read");
        const rows = await prisma.courseEnrollment.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.contactId ? { contactId: query.contactId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: ENROLLMENT_SELECT,
        });
        const upcoming = await this.upcomingByEnrollment(rows.map((r) => r.id));
        return rows.map((r) => enrollmentView(ctx, r, upcoming.get(r.id) ?? 0));
    }

    /**
     * Put someone on a course: book every session still to come and, with
     * Payments on, invoice them — or nothing at all.
     */
    async enrol(
        ctx: OrganizationContext,
        courseId: string,
        dto: EnrolDto,
    ): Promise<EnrollmentView> {
        authorize(ctx, "course:write");
        const { organizationId } = ctx;
        const contact = await prisma.contact.findFirst({
            where: { id: dto.contactId, organizationId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
            },
        });
        if (!contact) notFound("Contact", "contactId");

        const enrollmentId = await this.serializable(async (tx) => {
            await lockCourse(tx, organizationId, courseId);
            const course = await tx.course.findFirst({
                where: { id: courseId, organizationId },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    currency: true,
                    seats: true,
                    status: true,
                    service: true,
                    sessions: {
                        where: { startAt: { gt: new Date() } },
                        orderBy: { startAt: "asc" },
                        select: { startAt: true, endAt: true },
                    },
                    _count: {
                        select: {
                            enrollments: { where: { status: "ACTIVE" } },
                        },
                    },
                },
            });
            if (!course) notFound("Course");
            if (course.status !== "OPEN") {
                throw new ConflictException(
                    course.status === "DRAFT"
                        ? "This course is not open yet. Open it to take enrolments."
                        : "This course is not taking enrolments.",
                );
            }
            if (course.sessions.length === 0) {
                throw new ConflictException(
                    "All of this course's sessions have passed.",
                );
            }
            const already = await tx.courseEnrollment.count({
                where: { courseId, contactId: contact.id, status: "ACTIVE" },
            });
            if (already > 0) {
                throw new ConflictException("They are already on this course.");
            }
            if (course._count.enrollments >= course.seats) {
                throw new ConflictException("The course is full.");
            }

            const price = dto.price ?? toMoneyString(course.price);
            const enrollment = await tx.courseEnrollment.create({
                data: {
                    organizationId,
                    courseId,
                    contactId: contact.id,
                    status: "ACTIVE",
                    price,
                    currency: course.currency,
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            for (const session of course.sessions) {
                await this.bookSession(
                    tx,
                    ctx,
                    course.service,
                    courseId,
                    { id: enrollment.id, contact },
                    session,
                    "One of the course's sessions has no room left. Raise the service's capacity, or move that session.",
                );
            }
            if (await paymentsOn(tx, organizationId)) {
                const n = course.sessions.length;
                await this.invoices.issueInTx(tx, organizationId, {
                    contactId: contact.id,
                    currency: course.currency,
                    lines: [
                        {
                            description: `${course.name} · ${n} ${n === 1 ? "session" : "sessions"}`,
                            quantity: 1,
                            unitPrice: price,
                        },
                    ],
                    source: "COURSE",
                    courseEnrollmentId: enrollment.id,
                    createdByUserId: ctx.userId,
                });
            }
            return enrollment.id;
        }, "That changed while you were enrolling them. Try again.").catch(
            (err: unknown) => {
                // Two enrolments of the same person at once: the index lets one in.
                if (code(err) === "P2002") {
                    throw new ConflictException(
                        "They are already on this course.",
                    );
                }
                throw err;
            },
        );
        return this.readEnrollment(ctx, enrollmentId);
    }

    /**
     * Take someone off a course: their sessions still to come are cancelled
     * and their seat frees up. Past sessions stay as they were, and the
     * invoice stays — voiding it is a separate decision.
     */
    async cancelEnrollment(
        ctx: OrganizationContext,
        courseId: string,
        enrollmentId: string,
    ): Promise<EnrollmentView> {
        authorize(ctx, "course:write");
        const { organizationId } = ctx;
        await prisma.$transaction(async (tx) => {
            await lockCourse(tx, organizationId, courseId);
            const enrollment = await tx.courseEnrollment.findFirst({
                where: { id: enrollmentId, courseId, organizationId },
                select: { id: true, status: true },
            });
            if (!enrollment) notFound("Enrolment");
            if (enrollment.status === "CANCELLED") {
                throw new ConflictException(
                    "This enrolment is already cancelled.",
                );
            }
            const now = new Date();
            await tx.courseEnrollment.update({
                where: { id: enrollmentId },
                data: { status: "CANCELLED", cancelledAt: now },
            });
            await cancelFutureBookingsInTx(tx, {
                organizationId,
                actorUserId: ctx.userId,
                now,
                where: { courseEnrollmentId: enrollmentId },
            });
        });
        return this.readEnrollment(ctx, enrollmentId);
    }

    // — internals —————————————————————————————————————————————————

    /** Book one person onto one session, on the caller's transaction. */
    private async bookSession(
        tx: Tx,
        ctx: OrganizationContext,
        service: Service,
        courseId: string,
        enrollment: {
            id: string;
            contact: {
                email: string;
                firstName: string | null;
                lastName: string | null;
                phone: string | null;
            };
        },
        session: { startAt: Date; endAt: Date },
        whenFull: string,
    ): Promise<void> {
        const { contact } = enrollment;
        const name = [contact.firstName, contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        try {
            await this.bookings.reserveInTx(
                tx,
                service,
                session.startAt,
                session.endAt,
                {
                    startAt: session.startAt.toISOString(),
                    bookerEmail: contact.email,
                    bookerName: name || undefined,
                    bookerPhone: contact.phone ?? undefined,
                },
                { source: `course:${courseId}`, actorUserId: ctx.userId },
                { courseId, enrollmentId: enrollment.id },
            );
        } catch (err) {
            // The booking core says "slot"; here it is a session of a course.
            if (err instanceof ConflictException) {
                throw new ConflictException(whenFull);
            }
            throw err;
        }
    }

    /**
     * Run Serializable, trying once more when Postgres aborts it for a race,
     * so the answer reflects what is true now; a second loss is a plain 409.
     */
    private async serializable<T>(
        fn: (tx: Tx) => Promise<T>,
        onRace: string,
    ): Promise<T> {
        const run = () =>
            prisma.$transaction(fn, {
                isolationLevel:
                    PrismaNamespace.TransactionIsolationLevel.Serializable,
                timeout: TX_TIMEOUT_MS,
            });
        try {
            try {
                return await run();
            } catch (err) {
                if (code(err) !== "P2034") throw err;
                return await run();
            }
        } catch (err) {
            if (code(err) === "P2034") throw new ConflictException(onRace);
            throw err;
        }
    }

    private async requireService(
        organizationId: string,
        serviceId: string,
    ): Promise<Service> {
        const service = await prisma.service.findFirst({
            where: { id: serviceId, organizationId, deletedAt: null },
        });
        if (!service) notFound("Service", "serviceId");
        return service;
    }

    private async readCourse(
        organizationId: string,
        id: string,
    ): Promise<CourseRow> {
        const row = await prisma.course.findFirst({
            where: { id, organizationId },
            select: COURSE_SELECT,
        });
        if (!row) notFound("Course");
        return row;
    }

    private async readEnrollment(
        ctx: OrganizationContext,
        id: string,
    ): Promise<EnrollmentView> {
        const row = await prisma.courseEnrollment.findFirst({
            where: { id, organizationId: ctx.organizationId },
            select: ENROLLMENT_SELECT,
        });
        if (!row) notFound("Enrolment");
        const upcoming = await this.upcomingByEnrollment([id]);
        return enrollmentView(ctx, row, upcoming.get(id) ?? 0);
    }

    /** Booked sessions still to come, per enrolment. */
    private async upcomingByEnrollment(
        ids: string[],
    ): Promise<Map<string, number>> {
        const out = new Map<string, number>();
        if (ids.length === 0) return out;
        const rows = await prisma.booking.groupBy({
            by: ["courseEnrollmentId"],
            where: {
                courseEnrollmentId: { in: ids },
                status: "CONFIRMED",
                startAt: { gt: new Date() },
            },
            _count: { _all: true },
        });
        for (const r of rows) {
            if (r.courseEnrollmentId)
                out.set(r.courseEnrollmentId, r._count._all);
        }
        return out;
    }
}

// — shared with contact deletion ————————————————————————————————————

/**
 * Cancel the confirmed bookings still to come that match `where`, each with
 * its history event. Used by cancelling an enrolment and by deleting a
 * contact, who takes their course seats with them.
 */
export async function cancelFutureBookingsInTx(
    tx: Tx,
    input: {
        organizationId: string;
        actorUserId: string;
        now: Date;
        where: Prisma.BookingWhereInput;
    },
): Promise<number> {
    const future = await tx.booking.findMany({
        where: {
            ...input.where,
            organizationId: input.organizationId,
            status: "CONFIRMED",
            startAt: { gt: input.now },
        },
        select: { id: true, startAt: true },
    });
    if (future.length === 0) return 0;
    await tx.booking.updateMany({
        where: { id: { in: future.map((b) => b.id) } },
        data: { status: "CANCELLED", cancelledAt: input.now },
    });
    await tx.bookingEvent.createMany({
        data: future.map((b) => ({
            bookingId: b.id,
            organizationId: input.organizationId,
            type: BookingEventType.Cancelled,
            actorUserId: input.actorUserId,
            fromStartAt: b.startAt,
        })),
    });
    return future.length;
}

// — helpers ———————————————————————————————————————————————————————

async function lockCourse(
    tx: Tx,
    organizationId: string,
    id: string,
): Promise<void> {
    const rows = await tx.$queryRaw<
        { id: string }[]
    >`SELECT id FROM "Course" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
    if (rows.length === 0) notFound("Course");
}

function assertSeatsFit(seats: number, capacity: number): void {
    if (seats > capacity) {
        fieldError(
            `The service takes ${capacity} at a time, so the course can have at most ${capacity} ${capacity === 1 ? "seat" : "seats"}. Raise the service's capacity first.`,
            "seats",
        );
    }
}

/** Start times to sessions of the service's length, in order, no repeats. */
function sessionTimes(
    starts: string[],
    service: { durationMinutes: number },
): { startAt: Date; endAt: Date }[] {
    const seen = new Set<number>();
    const out: { startAt: Date; endAt: Date }[] = [];
    for (const iso of starts) {
        const startAt = new Date(iso);
        if (Number.isNaN(startAt.getTime())) {
            fieldError("A session time is not a date and time", "sessions");
        }
        if (seen.has(startAt.getTime())) {
            fieldError("Two sessions start at the same time", "sessions");
        }
        seen.add(startAt.getTime());
        out.push({
            startAt,
            endAt: new Date(
                startAt.getTime() + service.durationMinutes * MINUTE_MS,
            ),
        });
    }
    return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function courseView(row: CourseRow, now: Date): CourseView {
    const upcoming = row.sessions.filter((s) => s.startAt > now);
    const enrolled = row._count.enrollments;
    return {
        id: row.id,
        service: row.service,
        name: row.name,
        description: row.description,
        price: toMoneyString(row.price),
        currency: row.currency,
        seats: row.seats,
        enrolled,
        seatsLeft: Math.max(0, row.seats - enrolled),
        status: row.status as CourseStatus,
        sessions: row.sessions.map((s) => ({
            id: s.id,
            startAt: s.startAt.toISOString(),
            endAt: s.endAt.toISOString(),
        })),
        sessionsLeft: upcoming.length,
        nextSessionAt: upcoming[0]?.startAt.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/**
 * Someone who may see courses but not invoices is not handed the invoice
 * id — its page would not open for them.
 */
function enrollmentView(
    ctx: OrganizationContext,
    row: EnrollmentRow,
    upcoming: number,
): EnrollmentView {
    return {
        id: row.id,
        course: row.course,
        contact: {
            id: row.contact.id,
            name: contactName(row.contact),
            email: row.contact.email,
        },
        status: row.status as "ACTIVE" | "CANCELLED",
        price: toMoneyString(row.price),
        currency: row.currency,
        upcoming,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        invoiceId: allows(ctx, "invoice:read")
            ? (row.invoices[0]?.id ?? null)
            : null,
        createdAt: row.createdAt.toISOString(),
    };
}
