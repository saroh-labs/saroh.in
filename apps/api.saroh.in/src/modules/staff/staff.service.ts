import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { Interval } from "../bookings/availability";
import {
    overlaps,
    withinIntervals,
    workingIntervals,
} from "../bookings/availability";
import type { BookingRulesValue } from "../bookings/booking-rules";
import { loadBookingRules } from "../bookings/booking-rules";
import { businessTimezone, dateOnly } from "../bookings/staff-availability";
import { authorize } from "../organizations/organization-policy";
import type {
    AddExtraHoursDto,
    AddTimeOffDto,
    CreateStaffDto,
    StaffHoursDto,
    UpdateBookingRulesDto,
    UpdateStaffDto,
} from "./dto";
import {
    firstOverlap,
    formatMinute,
    isCalendarDate,
    rangeRefusal,
    weeklyHoursRefusal,
    weeklyMinutes,
    wholeDays,
} from "./hours";

const DAY = 86_400_000;
/** How far back a person's read carries time off and extra hours. */
const HISTORY_DAYS = 31;
/** The most kept bookings a save lists; more than this is a different talk. */
const MAX_LISTED = 200;

/** A booking named in a warning: enough to find it, nothing more. */
export interface BookingBrief {
    id: string;
    startAt: Date;
    endAt: Date;
    serviceId: string;
    serviceName: string;
    bookerName: string | null;
}

export interface StaffView {
    id: string;
    name: string;
    title: string | null;
    status: string;
    /** The team member they are, when they have an account. */
    membership: {
        id: string;
        userId: string;
        name: string | null;
        email: string;
    } | null;
    serviceIds: string[];
    hours: { dayOfWeek: number; startMinute: number; endMinute: number }[];
    /** Minutes a week the hours add up to. */
    weeklyMinutes: number;
    extraHours: {
        id: string;
        date: string;
        startMinute: number;
        endMinute: number;
    }[];
    /** Current and recent time off, with its team-only reason. */
    timeOff: {
        id: string;
        startAt: Date;
        endAt: Date;
        allDay: boolean;
        reason: string | null;
    }[];
}

/** Staff, and the zone their hours are wall-clock times in. */
export interface StaffList {
    timezone: string;
    staff: StaffView[];
}

const staffInclude = (since: Date) =>
    ({
        membership: {
            select: {
                id: true,
                userId: true,
                user: { select: { name: true, email: true } },
            },
        },
        services: { select: { serviceId: true } },
        hours: {
            select: { dayOfWeek: true, startMinute: true, endMinute: true },
            orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
        extraHours: {
            where: { date: { gte: since } },
            select: {
                id: true,
                date: true,
                startMinute: true,
                endMinute: true,
            },
            orderBy: [{ date: "asc" }, { startMinute: "asc" }],
        },
        timeOff: {
            where: { endAt: { gte: since } },
            select: {
                id: true,
                startAt: true,
                endAt: true,
                allDay: true,
                reason: true,
            },
            orderBy: { startAt: "asc" },
        },
    }) satisfies Prisma.StaffMemberInclude;

type StaffRow = Prisma.StaffMemberGetPayload<{
    include: ReturnType<typeof staffInclude>;
}>;

function toView(row: StaffRow): StaffView {
    return {
        id: row.id,
        name: row.name,
        title: row.title,
        status: row.status,
        membership: row.membership
            ? {
                  id: row.membership.id,
                  userId: row.membership.userId,
                  name: row.membership.user.name,
                  email: row.membership.user.email,
              }
            : null,
        serviceIds: row.services.map((s) => s.serviceId),
        hours: row.hours,
        weeklyMinutes: weeklyMinutes(row.hours),
        extraHours: row.extraHours.map((e) => ({
            id: e.id,
            date: dateOnly(e.date),
            startMinute: e.startMinute,
            endMinute: e.endMinute,
        })),
        timeOff: row.timeOff,
    };
}

/** A field left blank is not given. */
function blankToNull(value: string | null | undefined): string | null {
    return value === undefined || value === null || value === "" ? null : value;
}

function refuse(message: string, field: string): never {
    throw new BadRequestException({ message, field });
}

/**
 * The people who take bookings, their hours, time off and one-off extra
 * hours, and the business's booking rules (U3, ADR-008).
 *
 * Reads need `service:read` — the diary's floor, so a Member sees who works
 * when (and why someone is off: the reason is team-only, not Member-proof).
 * Every write needs `service:write`; a Member is refused. Every id is the
 * organization's own or a 404.
 */
@Injectable()
export class StaffService {
    // ── People ─────────────────────────────────────────────────────────────

    async list(ctx: OrganizationContext, now = new Date()): Promise<StaffList> {
        authorize(ctx, "service:read");
        const since = new Date(now.getTime() - HISTORY_DAYS * DAY);
        const [rows, timezone] = await Promise.all([
            prisma.staffMember.findMany({
                where: { organizationId: ctx.organizationId },
                include: staffInclude(since),
                orderBy: [{ status: "asc" }, { name: "asc" }],
            }),
            businessTimezone(prisma, ctx.organizationId),
        ]);
        return { timezone, staff: rows.map(toView) };
    }

    async get(
        ctx: OrganizationContext,
        staffId: string,
        now = new Date(),
    ): Promise<StaffView> {
        authorize(ctx, "service:read");
        return this.read(ctx, staffId, now);
    }

    async create(
        ctx: OrganizationContext,
        dto: CreateStaffDto,
    ): Promise<StaffView> {
        authorize(ctx, "service:write");
        const hours = dto.hours ?? [];
        const refusal = weeklyHoursRefusal(hours);
        if (refusal) refuse(refusal.message, refusal.field);
        const serviceIds = [...new Set(dto.serviceIds ?? [])];
        await this.assertServices(ctx, serviceIds);
        if (dto.membershipId) {
            await this.assertMembership(ctx, dto.membershipId);
        }

        const created = await this.guardLink(() =>
            prisma.$transaction(async (tx) => {
                const person = await tx.staffMember.create({
                    data: {
                        organizationId: ctx.organizationId,
                        name: dto.name,
                        title: blankToNull(dto.title),
                        membershipId: dto.membershipId ?? null,
                    },
                    select: { id: true },
                });
                if (serviceIds.length > 0) {
                    await tx.staffService.createMany({
                        data: serviceIds.map((serviceId) => ({
                            organizationId: ctx.organizationId,
                            staffId: person.id,
                            serviceId,
                        })),
                    });
                }
                if (hours.length > 0) {
                    await tx.staffHours.createMany({
                        data: hours.map((h) => ({
                            organizationId: ctx.organizationId,
                            staffId: person.id,
                            dayOfWeek: h.dayOfWeek,
                            startMinute: h.startMinute,
                            endMinute: h.endMinute,
                        })),
                    });
                }
                return person;
            }),
        );
        return this.read(ctx, created.id);
    }

    async update(
        ctx: OrganizationContext,
        staffId: string,
        dto: UpdateStaffDto,
    ): Promise<StaffView> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        if (dto.membershipId) {
            await this.assertMembership(ctx, dto.membershipId, person.id);
        }
        const archiving =
            dto.status === "ARCHIVED" && person.status !== "ARCHIVED";
        await this.guardLink(() =>
            prisma.staffMember.update({
                where: { id: person.id },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(dto.title !== undefined
                        ? { title: blankToNull(dto.title) }
                        : {}),
                    ...(dto.membershipId !== undefined
                        ? { membershipId: dto.membershipId }
                        : {}),
                    ...(dto.status !== undefined
                        ? {
                              status: dto.status,
                              archivedAt: archiving
                                  ? new Date()
                                  : dto.status === "ACTIVE"
                                    ? null
                                    : undefined,
                          }
                        : {}),
                },
                select: { id: true },
            }),
        );
        return this.read(ctx, person.id);
    }

    /**
     * Take someone off the diary for new bookings. Their bookings keep them
     * (the diary still says who); their hours stay, in case they come back.
     */
    async archive(
        ctx: OrganizationContext,
        staffId: string,
    ): Promise<StaffView> {
        return this.update(ctx, staffId, { status: "ARCHIVED" });
    }

    /** Replace the services a person takes. */
    async setServices(
        ctx: OrganizationContext,
        staffId: string,
        serviceIds: string[],
    ): Promise<StaffView> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        const ids = [...new Set(serviceIds)];
        await this.assertServices(ctx, ids);
        await prisma.$transaction(async (tx) => {
            await tx.staffService.deleteMany({
                where: { staffId: person.id, serviceId: { notIn: ids } },
            });
            if (ids.length > 0) {
                await tx.staffService.createMany({
                    data: ids.map((serviceId) => ({
                        organizationId: ctx.organizationId,
                        staffId: person.id,
                        serviceId,
                    })),
                    skipDuplicates: true,
                });
            }
        });
        return this.read(ctx, person.id);
    }

    // ── Hours ──────────────────────────────────────────────────────────────

    /**
     * Replace a person's weekly hours. Bookings already made that now fall
     * outside them are KEPT, and listed so the merchant can move or keep
     * them (the Availability design's rule) — saving hours never cancels.
     */
    async replaceHours(
        ctx: OrganizationContext,
        staffId: string,
        hours: StaffHoursDto[],
        now = new Date(),
    ): Promise<{ staff: StaffView; outside: BookingBrief[] }> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        const refusal = weeklyHoursRefusal(hours);
        if (refusal) refuse(refusal.message, refusal.field);

        await prisma.$transaction(async (tx) => {
            await tx.staffHours.deleteMany({ where: { staffId: person.id } });
            if (hours.length > 0) {
                await tx.staffHours.createMany({
                    data: hours.map((h) => ({
                        organizationId: ctx.organizationId,
                        staffId: person.id,
                        dayOfWeek: h.dayOfWeek,
                        startMinute: h.startMinute,
                        endMinute: h.endMinute,
                    })),
                });
            }
        });
        const outside = await this.bookingsOutsideHours(ctx, person.id, now);
        return { staff: await this.read(ctx, person.id, now), outside };
    }

    /** Hours on one date, on top of the weekly ones. */
    async addExtraHours(
        ctx: OrganizationContext,
        staffId: string,
        dto: AddExtraHoursDto,
    ): Promise<StaffView> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        if (!isCalendarDate(dto.date)) refuse("That is not a date.", "date");
        const range = rangeRefusal(dto, dto.date, "endMinute");
        if (range) refuse(range.message, range.field);

        const date = new Date(`${dto.date}T00:00:00.000Z`);
        const sameDay = await prisma.staffExtraHours.findMany({
            where: { staffId: person.id, date },
            select: { startMinute: true, endMinute: true },
        });
        const clash = firstOverlap([...sameDay, dto]);
        if (clash) {
            refuse(
                `${person.name} already has extra hours on ${dto.date} from ${formatMinute(clash[0].startMinute)} to ${formatMinute(clash[0].endMinute)}.`,
                "startMinute",
            );
        }
        await prisma.staffExtraHours.create({
            data: {
                organizationId: ctx.organizationId,
                staffId: person.id,
                date,
                startMinute: dto.startMinute,
                endMinute: dto.endMinute,
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });
        return this.read(ctx, person.id);
    }

    async removeExtraHours(
        ctx: OrganizationContext,
        staffId: string,
        extraHoursId: string,
        now = new Date(),
    ): Promise<{ staff: StaffView; outside: BookingBrief[] }> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        const { count } = await prisma.staffExtraHours.deleteMany({
            where: {
                id: extraHoursId,
                staffId: person.id,
                organizationId: ctx.organizationId,
            },
        });
        if (count === 0) throw new NotFoundException("Extra hours not found");
        // Closing a day again can leave bookings outside the hours — kept.
        const outside = await this.bookingsOutsideHours(ctx, person.id, now);
        return { staff: await this.read(ctx, person.id, now), outside };
    }

    // ── Time off ───────────────────────────────────────────────────────────

    /**
     * Time off, by whole days or a stretch of time. Bookings it covers are
     * kept and listed — the merchant decides what to do with each.
     */
    async addTimeOff(
        ctx: OrganizationContext,
        staffId: string,
        dto: AddTimeOffDto,
        now = new Date(),
    ): Promise<{ staff: StaffView; affected: BookingBrief[] }> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);

        let span: Interval;
        let allDay: boolean;
        if (dto.fromDate) {
            if (dto.startAt || dto.endAt) {
                refuse(
                    "Give whole days or a start and end time, not both.",
                    "startAt",
                );
            }
            const toDate = dto.toDate ?? dto.fromDate;
            if (!isCalendarDate(dto.fromDate)) {
                refuse("That is not a date.", "fromDate");
            }
            if (!isCalendarDate(toDate))
                refuse("That is not a date.", "toDate");
            if (toDate < dto.fromDate) {
                refuse("The last day must be on or after the first.", "toDate");
            }
            const zone = await businessTimezone(prisma, ctx.organizationId);
            span = wholeDays(dto.fromDate, toDate, zone);
            allDay = true;
        } else if (dto.startAt && dto.endAt) {
            span = {
                startAt: new Date(dto.startAt),
                endAt: new Date(dto.endAt),
            };
            if (span.endAt <= span.startAt) {
                refuse("The end must be after the start.", "endAt");
            }
            allDay = false;
        } else {
            refuse(
                "Choose the days, or a start and end time.",
                dto.startAt ? "endAt" : "fromDate",
            );
        }
        if (span.endAt.getTime() - span.startAt.getTime() > 366 * DAY) {
            refuse("Time off can be at most a year at a time.", "toDate");
        }

        await prisma.staffTimeOff.create({
            data: {
                organizationId: ctx.organizationId,
                staffId: person.id,
                startAt: span.startAt,
                endAt: span.endAt,
                allDay,
                reason: blankToNull(dto.reason),
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });
        const affected = (
            await this.upcomingBookings(ctx, person.id, now)
        ).filter((b) => overlaps(b, span));
        return { staff: await this.read(ctx, person.id, now), affected };
    }

    async removeTimeOff(
        ctx: OrganizationContext,
        staffId: string,
        timeOffId: string,
    ): Promise<StaffView> {
        authorize(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        const { count } = await prisma.staffTimeOff.deleteMany({
            where: {
                id: timeOffId,
                staffId: person.id,
                organizationId: ctx.organizationId,
            },
        });
        if (count === 0) throw new NotFoundException("Time off not found");
        return this.read(ctx, person.id);
    }

    // ── Booking rules ──────────────────────────────────────────────────────

    async getBookingRules(
        ctx: OrganizationContext,
    ): Promise<BookingRulesValue> {
        authorize(ctx, "service:read");
        return loadBookingRules(prisma, ctx.organizationId);
    }

    /** Set the business's rules; an absent field is left, `null` clears it. */
    async updateBookingRules(
        ctx: OrganizationContext,
        dto: UpdateBookingRulesDto,
    ): Promise<BookingRulesValue> {
        authorize(ctx, "service:write");
        const data = {
            ...(dto.bookAheadDays !== undefined
                ? { bookAheadDays: dto.bookAheadDays }
                : {}),
            ...(dto.latestBookingMinutes !== undefined
                ? { latestBookingMinutes: dto.latestBookingMinutes }
                : {}),
            ...(dto.freeCancelHours !== undefined
                ? { freeCancelHours: dto.freeCancelHours }
                : {}),
        };
        const row = await prisma.bookingRules.upsert({
            where: { organizationId: ctx.organizationId },
            create: { organizationId: ctx.organizationId, ...data },
            update: data,
            select: {
                bookAheadDays: true,
                latestBookingMinutes: true,
                freeCancelHours: true,
            },
        });
        return row;
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private async read(
        ctx: OrganizationContext,
        staffId: string,
        now = new Date(),
    ): Promise<StaffView> {
        const since = new Date(now.getTime() - HISTORY_DAYS * DAY);
        const row = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            include: staffInclude(since),
        });
        if (!row) throw new NotFoundException("Staff member not found");
        return toView(row);
    }

    private async requireStaff(ctx: OrganizationContext, staffId: string) {
        const person = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            select: { id: true, name: true, status: true },
        });
        if (!person) throw new NotFoundException("Staff member not found");
        return person;
    }

    /** Every service id belongs to this business and is not deleted, or 404. */
    private async assertServices(
        ctx: OrganizationContext,
        ids: string[],
    ): Promise<void> {
        if (ids.length === 0) return;
        const found = await prisma.service.count({
            where: {
                id: { in: ids },
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
        });
        if (found !== ids.length) {
            throw new NotFoundException({
                message: "One of those services was not found",
                field: "serviceIds",
            });
        }
    }

    /**
     * The membership is this business's, and nobody else on the diary is
     * already that team member.
     */
    private async assertMembership(
        ctx: OrganizationContext,
        membershipId: string,
        staffId?: string,
    ): Promise<void> {
        const membership = await prisma.membership.findFirst({
            where: { id: membershipId, organizationId: ctx.organizationId },
            select: {
                id: true,
                staffMember: { select: { id: true, name: true } },
            },
        });
        if (!membership) {
            throw new NotFoundException({
                message: "That team member was not found",
                field: "membershipId",
            });
        }
        if (membership.staffMember && membership.staffMember.id !== staffId) {
            throw new ConflictException({
                message: `That team member is already on the diary as ${membership.staffMember.name}.`,
                field: "membershipId",
            });
        }
    }

    /** A second person linked to one member at the same moment: say so. */
    private async guardLink<T>(write: () => Promise<T>): Promise<T> {
        try {
            return await write();
        } catch (err) {
            if ((err as { code?: string }).code === "P2002") {
                throw new ConflictException({
                    message: "That team member is already on the diary.",
                    field: "membershipId",
                });
            }
            throw err;
        }
    }

    /** A person's confirmed bookings from now on, soonest first. */
    private async upcomingBookings(
        ctx: OrganizationContext,
        staffId: string,
        now: Date,
    ): Promise<BookingBrief[]> {
        const rows = await prisma.booking.findMany({
            where: {
                organizationId: ctx.organizationId,
                staffId,
                status: "CONFIRMED",
                endAt: { gt: now },
            },
            orderBy: { startAt: "asc" },
            take: MAX_LISTED * 5,
            select: {
                id: true,
                startAt: true,
                endAt: true,
                serviceId: true,
                bookerName: true,
                service: { select: { name: true } },
                contact: { select: { firstName: true, lastName: true } },
            },
        });
        return rows.map((r) => {
            const contactName = [r.contact?.firstName, r.contact?.lastName]
                .filter(Boolean)
                .join(" ")
                .trim();
            return {
                id: r.id,
                startAt: r.startAt,
                endAt: r.endAt,
                serviceId: r.serviceId,
                serviceName: r.service.name,
                bookerName: contactName || r.bookerName,
            };
        });
    }

    /**
     * Upcoming bookings of a person that their hours (weekly and extra) no
     * longer cover. Time off is its own warning and is not counted here.
     */
    private async bookingsOutsideHours(
        ctx: OrganizationContext,
        staffId: string,
        now: Date,
    ): Promise<BookingBrief[]> {
        const upcoming = await this.upcomingBookings(ctx, staffId, now);
        if (upcoming.length === 0) return [];
        const first = upcoming[0].startAt;
        const last = upcoming.reduce(
            (max, b) => (b.endAt > max ? b.endAt : max),
            upcoming[0].endAt,
        );
        const [zone, hours, extra] = await Promise.all([
            businessTimezone(prisma, ctx.organizationId),
            prisma.staffHours.findMany({
                where: { staffId },
                select: { dayOfWeek: true, startMinute: true, endMinute: true },
            }),
            prisma.staffExtraHours.findMany({
                where: {
                    staffId,
                    date: {
                        gte: new Date(first.getTime() - 2 * DAY),
                        lte: new Date(last.getTime() + 2 * DAY),
                    },
                },
                select: { date: true, startMinute: true, endMinute: true },
            }),
        ]);
        const windows = workingIntervals(
            {
                hours,
                extraHours: extra.map((e) => ({
                    date: dateOnly(e.date),
                    startMinute: e.startMinute,
                    endMinute: e.endMinute,
                })),
                timeOff: [],
            },
            zone,
            first,
            last,
        );
        return upcoming
            .filter((b) => !withinIntervals(b, windows))
            .slice(0, MAX_LISTED);
    }
}
