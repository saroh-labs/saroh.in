import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma, Service } from "@saroh/database";
import { prisma, Prisma as PrismaNamespace } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { PricedItem, PriceHistoryPage } from "../audit/price-history";
import {
    courseFacts,
    priceActor,
    readPriceHistory,
    recordPrices,
} from "../audit/price-history";
import { BookingEventType } from "../bookings/booking-event-type";
import { BookingsService } from "../bookings/bookings.service";
import { assertBusinessDetails } from "../invoices/business-details";
import {
    bpsToRate,
    isGstRate,
    notGstRateMessage,
    rateToBps,
} from "../invoices/gst";
import type {
    GstOnPrice,
    GstPriceMode,
    PriceTerms,
} from "../invoices/gst-price";
import { isGstPriceMode } from "../invoices/gst-price";
import { assertSaleRated } from "../invoices/gst-rate-required";
import type { InvoiceStanding } from "../invoices/invoice-state";
import { invoiceStanding } from "../invoices/invoice-state";
import { InvoicesService } from "../invoices/invoices.service";
import { paymentsOn } from "../invoices/payments-on";
import { loadPriceTerms } from "../invoices/price-terms";
import {
    hasRate,
    priceTermsFor,
    saleCharge,
    saleChargeInTx,
} from "../invoices/sale-price";
import { contactName } from "../invoices/serialize";
import { toCents } from "../invoices/totals";
import { allows, authorize } from "../organizations/organization-policy";
import { queueCourseNotice } from "../site-accounts/notices/course";
import type {
    AddSessionDto,
    CourseInputDto,
    CourseStatus,
    EnrolDto,
    ListCoursesQueryDto,
    ListEnrollmentsQueryDto,
} from "./dto";

type Tx = Prisma.TransactionClient;

/** What a course's price history entry is written from. */
const PRICED_COURSE = {
    id: true,
    name: true,
    price: true,
    currency: true,
    gstRate: true,
    gstPriceMode: true,
} as const;

/** A course as its price history entry names it. */
function pricedCourse(course: {
    id: string;
    name: string;
    currency: string;
}): PricedItem {
    return {
        kind: "COURSE",
        id: course.id,
        name: course.name,
        currency: course.currency,
    };
}

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
    return prismaErrorCode(err);
}

export interface SessionView {
    id: string;
    startAt: string;
    endAt: string;
}

/** A session on the course page: with how many are booked on it. */
export interface SessionDetail extends SessionView {
    booked: number;
}

export interface CourseView {
    id: string;
    service: {
        id: string;
        name: string;
        capacity: number;
        durationMinutes: number;
        /** The zone its sessions are read in. */
        timezone: string;
    };
    name: string;
    description: string | null;
    price: string;
    currency: string;
    /**
     * GST (12 Oct 2026): the rate its price carries ("18"; null: not set),
     * its SAC code, and its own way of carrying GST (null: the business's).
     */
    gstRate: string | null;
    sacCode: string | null;
    gstPriceMode: GstPriceMode | null;
    /**
     * The GST on its price as an enrolment is charged today: the typed
     * price, the GST in or on it and the amount to pay. Null when nothing
     * is said about GST (not registered, no rate, exempt): the price is
     * the amount to pay. An enrolment's `price` is the amount paid.
     */
    gst: GstOnPrice | null;
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
    invoice: {
        id: string;
        number: string | null;
        standing: InvoiceStanding;
    } | null;
    createdAt: string;
}

export interface CourseDetail extends Omit<CourseView, "sessions"> {
    sessions: SessionDetail[];
    enrollments: EnrollmentView[];
    /** Whether enrolling someone now issues an invoice (Payments is on). */
    invoicesOnEnrol: boolean;
}

const COURSE_SELECT = {
    id: true,
    name: true,
    description: true,
    price: true,
    currency: true,
    gstRate: true,
    sacCode: true,
    gstPriceMode: true,
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
            timezone: true,
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
        select: { id: true, number: true, status: true, dueAt: true },
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
        // How the business's prices carry GST; read only when a course has
        // a rate.
        const terms = await priceTermsFor(prisma, ctx.organizationId, rows);
        const now = new Date();
        return rows.map((r) => courseView(r, now, terms));
    }

    async get(ctx: OrganizationContext, id: string): Promise<CourseDetail> {
        authorize(ctx, "course:read");
        const row = await this.readCourse(ctx.organizationId, id);
        const enrollments = await prisma.courseEnrollment.findMany({
            where: { organizationId: ctx.organizationId, courseId: id },
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            select: ENROLLMENT_SELECT,
        });
        const [upcoming, booked, invoicesOnEnrol, terms] = await Promise.all([
            this.upcomingByEnrollment(enrollments.map((e) => e.id)),
            // A course's bookings share its session's start.
            prisma.booking.groupBy({
                by: ["startAt"],
                where: {
                    status: "CONFIRMED",
                    courseEnrollment: { courseId: id },
                },
                _count: { _all: true },
            }),
            paymentsOn(prisma, ctx.organizationId),
            priceTermsFor(prisma, ctx.organizationId, [row]),
        ]);
        const bookedAt = new Map(
            booked.map((b) => [b.startAt.getTime(), b._count._all]),
        );
        const now = new Date();
        const view = courseView(row, now, terms);
        return {
            ...view,
            sessions: row.sessions.map((s) => ({
                id: s.id,
                startAt: s.startAt.toISOString(),
                endAt: s.endAt.toISOString(),
                booked: bookedAt.get(s.startAt.getTime()) ?? 0,
            })),
            enrollments: enrollments.map((e) =>
                enrollmentView(ctx, e, upcoming.get(e.id) ?? 0, now),
            ),
            invoicesOnEnrol,
        };
    }

    /**
     * What the course has cost: each change, who made it and when, newest
     * first. `course:read`, as the course's own page asks; another
     * business's course is not found.
     */
    async priceHistory(
        ctx: OrganizationContext,
        id: string,
        page: { limit?: number; cursor?: string } = {},
    ): Promise<PriceHistoryPage> {
        authorize(ctx, "course:read");
        const course = await prisma.course.findFirst({
            where: { id, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!course) notFound("Course");
        return readPriceHistory(ctx.organizationId, "COURSE", id, page);
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

        const data = {
            organizationId,
            serviceId: service.id,
            name: dto.name,
            description: dto.description ?? null,
            price: dto.price,
            currency,
            ...gstColumns(dto),
            seats: dto.seats,
            status,
            sessions: {
                create: sessions.map((s) => ({ organizationId, ...s })),
            },
        };
        // The course and its first price history entry are made together.
        const created = await prisma.$transaction(async (tx) => {
            const made = await tx.course.create({
                data,
                select: PRICED_COURSE,
            });
            await recordPrices(
                tx,
                priceActor(ctx),
                pricedCourse(made),
                null,
                courseFacts(made),
            );
            return made;
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
        const gst = gstColumns(dto);
        await prisma.$transaction(async (tx) => {
            await lockCourse(tx, organizationId, id);
            const course = await tx.course.findFirst({
                where: { id, organizationId },
                select: {
                    ...PRICED_COURSE,
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
            const saved = await tx.course.update({
                where: { id },
                select: PRICED_COURSE,
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
                    ...gst,
                },
            });
            // In the save's own transaction: nothing moved, nothing kept.
            await recordPrices(
                tx,
                priceActor(ctx),
                pricedCourse(saved),
                courseFacts(course),
                courseFacts(saved),
            );
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
        const now = new Date();
        return rows.map((r) =>
            enrollmentView(ctx, r, upcoming.get(r.id) ?? 0, now),
        );
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
        // With Payments on it issues an invoice still to be paid: the
        // business details first (DEC-068).
        if (await paymentsOn(prisma, organizationId)) {
            await assertBusinessDetails(prisma, organizationId);
        }

        const enrollmentId = await this.serializable(async (tx) => {
            await lockCourse(tx, organizationId, courseId);
            const course = await tx.course.findFirst({
                where: { id: courseId, organizationId },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    currency: true,
                    gstRate: true,
                    sacCode: true,
                    gstPriceMode: true,
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
            // With Payments on the enrolment writes a tax invoice: a
            // registered business's course with no GST rate is asked for
            // one first (409 GST_RATE_MISSING), before anything is written,
            // and the app asks in place and enrols again.
            const invoices = await paymentsOn(tx, organizationId);
            if (invoices) {
                await assertCourseRated(tx, organizationId, course, dto.price);
            }

            // What they are charged: the course's price, or the one typed
            // for them, with its GST added where the business adds it
            // (`sale-price.ts`). The enrolment keeps the amount to pay, as
            // its invoice does.
            const charge = await saleChargeInTx(
                tx,
                organizationId,
                toCents(dto.price ?? toMoneyString(course.price)),
                course,
            );
            const price = charge.pay;
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
            if (invoices) {
                const n = course.sessions.length;
                await this.invoices.issueInTx(tx, organizationId, {
                    contactId: contact.id,
                    currency: course.currency,
                    lines: [
                        {
                            description: `${course.name} · ${n} ${n === 1 ? "session" : "sessions"}`,
                            quantity: 1,
                            ...charge.line,
                        },
                    ],
                    source: "COURSE",
                    courseEnrollmentId: enrollment.id,
                    createdByUserId: ctx.userId,
                });
            }
            // They hear they're on it, with every session (U17), unless
            // the business has Course emails off.
            await queueCourseNotice(
                tx,
                organizationId,
                "COURSE_ENROLLED",
                enrollment.id,
            );
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
     * invoice stays — voiding it is a separate decision. They are told,
     * with the invoice as it stands when the email goes (U17).
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
            // They hear their place is cancelled, and where the money
            // stands (U17), unless Course emails are off.
            await queueCourseNotice(
                tx,
                organizationId,
                "COURSE_CANCELLED",
                enrollmentId,
            );
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
        return enrollmentView(ctx, row, upcoming.get(id) ?? 0, new Date());
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

/** A stored GST rate as it is written: "18", "0.25"; null when not set. */
function courseRate(rate: { toString(): string } | null): string | null {
    const bps = rateToBps(rate);
    return bps === null ? null : bpsToRate(bps);
}

/**
 * The GST columns a save names (12 Oct 2026): a rate GST has, or null to
 * clear it; the SAC code; the course's own way of carrying GST.
 */
function gstColumns(dto: CourseInputDto) {
    if (
        dto.gstRate !== undefined &&
        dto.gstRate !== null &&
        !isGstRate(dto.gstRate)
    ) {
        fieldError(notGstRateMessage(dto.gstRate), "gstRate");
    }
    return {
        ...(dto.gstRate !== undefined ? { gstRate: dto.gstRate } : {}),
        ...(dto.sacCode !== undefined ? { sacCode: dto.sacCode } : {}),
        ...(dto.gstPriceMode !== undefined
            ? { gstPriceMode: dto.gstPriceMode }
            : {}),
    };
}

/**
 * Refuse enrolling someone at the desk on a registered business's course
 * that has no GST rate (409 `GST_RATE_MISSING`, kind COURSE), unless it is
 * free of charge. A course with a rate, and any course of a business that
 * is not registered, reads nothing more.
 */
async function assertCourseRated(
    db: Pick<Tx, "businessProfile">,
    organizationId: string,
    course: {
        id: string;
        name: string;
        price: { toString(): string };
        gstRate: { toString(): string } | null;
    },
    typedPrice: string | undefined,
): Promise<void> {
    if (hasRate(course)) return;
    const terms = await loadPriceTerms(db, organizationId);
    assertSaleRated(terms.registered, {
        kind: "COURSE",
        id: course.id,
        name: course.name,
        rate: course.gstRate,
        priceCents: toCents(typedPrice ?? toMoneyString(course.price)),
    });
}

function courseView(row: CourseRow, now: Date, terms: PriceTerms): CourseView {
    const upcoming = row.sessions.filter((s) => s.startAt > now);
    const enrolled = row._count.enrollments;
    return {
        id: row.id,
        service: row.service,
        name: row.name,
        description: row.description,
        price: toMoneyString(row.price),
        currency: row.currency,
        gstRate: courseRate(row.gstRate),
        sacCode: row.sacCode,
        gstPriceMode: isGstPriceMode(row.gstPriceMode)
            ? row.gstPriceMode
            : null,
        // The sum an enrolment uses (`enrol`, `sale-price.ts`).
        gst: saleCharge(toCents(toMoneyString(row.price)), row, terms).gst,
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
    now: Date,
): EnrollmentView {
    const invoice = allows(ctx, "invoice:read") ? row.invoices[0] : undefined;
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
        invoice: invoice
            ? {
                  id: invoice.id,
                  number: invoice.number,
                  standing: invoiceStanding(invoice, now),
              }
            : null,
        createdAt: row.createdAt.toISOString(),
    };
}
