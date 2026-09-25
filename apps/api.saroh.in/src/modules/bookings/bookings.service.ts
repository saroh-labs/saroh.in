import {
    BadRequestException,
    ConflictException,
    GoneException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { DateTime, IANAZone } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ActivationEvents } from "../analytics/activation-events";
import { redeemPackInTx, reversePackInTx } from "../class-packs/redeem-pack";
import { isGstRate } from "../invoices/gst";
import { hashPayToken } from "../invoices/pay-token";
import { paymentsOn } from "../invoices/payments-on";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { allows, authorize } from "../organizations/organization-policy";
import { APPOINTMENTS_OPEN, appointmentsOpen } from "./appointments-open";
import type {
    AvailabilityRuleWindow,
    AvailabilityService,
    Interval,
    Slot,
    StaffSlot,
} from "./availability";
import {
    availableSlots,
    countOverlapping,
    enumerateSlots,
    intersectIntervals,
    isPersonSlotStart,
    isValidSlotStart,
    staffSlots,
    weeklyIntervals,
    withinIntervals,
    workingIntervals,
} from "./availability";
import type { PersonDiary } from "./booking-calendar";
import { groupDiaries } from "./booking-calendar";
import type { HoldState } from "./booking-hold";
import {
    createHoldInvoiceInTx,
    holdExpiry,
    holdsPlace,
    holdState,
    isExpiredHold,
    lockBookingInTx,
    releaseHoldInTx,
    renewHoldTokenInTx,
} from "./booking-hold";
import type { BookingRulesValue } from "./booking-rules";
import {
    bookingWindowRefusal,
    isLateCancel,
    loadBookingRules,
    withinBookingWindow,
} from "./booking-rules";
import { courseSeatIntervals, courseSeatsHeld } from "./course-seats";
import type {
    AvailabilityRuleDto,
    BookingOutcome,
    CreateServiceDto,
    LocationType,
    PaidWith,
    UpdateServiceDto,
} from "./dto";
import { FixedWindowRateLimiter } from "./rate-limiter";
import {
    businessTimezone,
    businessZone,
    loadPeople,
    serviceStaff,
} from "./staff-availability";
import { useMembershipInTx } from "./use-membership";

/** The validated public booking command input (see {@link BookServiceDto}). */
export interface BookInput {
    startAt: string;
    bookerName?: string;
    bookerEmail: string;
    bookerPhone?: string;
    idempotencyKey?: string;
    /** The person asked for (U3); absent means whoever is free. */
    staffId?: string;
    /**
     * How the booking page's booker pays (U19): NOW holds the place for
     * 15 minutes (`HOLD_MINUTES`) while they pay online, DESK books it to
     * pay on the day. Absent — the one-service booking block — books as before.
     */
    pay?: "NOW" | "DESK";
}

/**
 * A free time, and — when somebody takes the service — who (U3). For a
 * one-to-one it is everyone free for that start; for a class, its
 * instructor, shown beside it.
 */
export type AvailableSlot = Slot & { staffIds?: string[] };

/** Who takes a service, as the booking page may show them: a name and an id. */
export interface PublicStaff {
    id: string;
    name: string;
}

/**
 * How a service is staffed (U3). `perPerson` is a one-to-one somebody takes:
 * each person is their own diary, so capacity is theirs rather than the
 * service's. A class keeps its own times and capacity; its people are its
 * instructors, for display and clash checks only.
 */
interface Staffing {
    people: { id: string; name: string }[];
    perPerson: boolean;
    /** The business's zone — staff hours are wall-clock times in it. */
    zone: string | null;
}

/** Who a booking is with and how it is paid, for {@link BookingsService.reserveInTx}. */
export interface ReserveWith {
    staffId: string | null;
    staffName?: string;
    perPerson: boolean;
    paidWith?: PaidWith | null;
    subscriptionId?: string | null;
    /** A pay-now hold (U19): PENDING, holding its place until then. */
    holdUntil?: Date | null;
}

/**
 * What can happen to a booking. A closed set so call sites never pass a raw,
 * typo-prone string, and so the screen can render each kind deliberately.
 */
export const BookingEventType = {
    Booked: "BOOKED",
    Rescheduled: "RESCHEDULED",
    Cancelled: "CANCELLED",
    Attended: "ATTENDED",
    NoShow: "NO_SHOW",
} as const;

export type BookingEventType =
    (typeof BookingEventType)[keyof typeof BookingEventType];

/** Exactly what {@link BookingsService.getBooking} reads, named so the
 *  controller's inferred return type stays portable. */
const bookingDetailInclude = {
    service: true,
    contact: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
        },
    },
    events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
    },
    // How it is paid, when a class pack pays for it (ADR-007). A pack taken
    // back off leaves its row with `reversedAt` set: that booking is no
    // longer paid with it. Only the pack's name — what the screen says.
    packRedemption: {
        select: {
            reversedAt: true,
            purchase: {
                select: { id: true, pack: { select: { name: true } } },
            },
        },
    },
    // Who takes it (U3) — the name the diary shows, never their hours.
    staff: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

export type BookingDetail = Prisma.BookingGetPayload<{
    include: typeof bookingDetailInclude;
}>;

/** What the bookings calendar reads per booking (see {@link DiaryRow}). */
const diarySelect = {
    id: true,
    serviceId: true,
    startAt: true,
    endAt: true,
    timezone: true,
    status: true,
    holdExpiresAt: true,
    outcome: true,
    bookerName: true,
    bookerEmail: true,
    bookerPhone: true,
    createdAt: true,
    cancelledAt: true,
    cancelledLate: true,
    paidWith: true,
    subscriptionId: true,
    service: {
        select: {
            id: true,
            name: true,
            timezone: true,
            capacity: true,
            durationMinutes: true,
            priceCents: true,
            currency: true,
        },
    },
    // Name and email only: `booking:read` is not `contact:read`.
    contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    staff: { select: { id: true, name: true } },
    packRedemption: {
        select: {
            reversedAt: true,
            purchase: { select: { pack: { select: { name: true } } } },
        },
    },
} satisfies Prisma.BookingSelect;

/** The widest range the bookings calendar reads at once: two years. */
const MAX_CALENDAR_RANGE_MS = 731 * 86_400_000;

/** The bookings calendar (U4): diaries by person over a range. */
export interface BookingsCalendar {
    from: string;
    to: string;
    /** The business's zone — where "a day" on the calendar is. */
    timezone: string;
    /** Whether prices were included for this viewer. */
    money: boolean;
    /** One per person, then Unassigned when anything has no person. */
    diaries: PersonDiary[];
}

/**
 * Bookable Services, availability and the transactional public booking command
 * (S4-002).
 *
 * Authenticated management (Service CRUD, availability rules, booking list /
 * cancel) is tenant-scoped by `ctx.organizationId` (proven by
 * `OrganizationGuard`, never a client value) and gated by the central policy:
 * `service:read`/`service:write`, `booking:read`/`booking:write`. Cross-tenant
 * or missing ids surface as 404 (never 403), mirroring the other modules, so a
 * caller can't probe another org's resources.
 *
 * The PUBLIC {@link book} command is UNAUTHENTICATED and org-agnostic: the
 * owning org is derived from the target Service, so an anonymous booker can only
 * ever create rows in the org that owns the Service. Its central guarantee —
 * "only one confirmed booking can own a capacity-one slot" — is enforced by a
 * SERIALIZABLE transaction that re-counts CONFIRMED overlaps INSIDE the tx (see
 * {@link book} for the full race argument).
 */
/** Who a reservation is made by. */
export interface ReserveBy {
    /** `Contact.source` for someone new. */
    source: string;
    /** Who made it; `null` when the booker did it themselves. */
    actorUserId: string | null;
}

/** A service as a website visitor sees it (#255). No internal fields. */
export interface PublicService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
}

/** How many days the booking page offers (U19). */
const PUBLIC_DAYS = 14;

/** A start on the booking page (U19). `placesLeft` is a class's only. */
export interface PublicStart {
    startAt: string;
    endAt: string;
    staffId: string | null;
    staffName: string | null;
    placesLeft: number | null;
}

export interface PublicDay {
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    open: boolean;
    starts: PublicStart[];
}

/** One service's next two weeks on the booking page (U19). */
export interface PublicDays {
    timezone: string;
    kind: "one" | "class";
    capacity: number;
    days: PublicDay[];
}

/** What a site's booking page opens with (U19). No internal fields. */
export interface PublicBookingPage {
    businessName: string;
    /** False when the business has Appointments switched off. */
    open: boolean;
    timezone: string;
    /** Whether pay now is on offer: Payments on and a provider connected. */
    payOnline: boolean;
    rules: BookingRulesValue;
    services: {
        id: string;
        name: string;
        description: string | null;
        durationMinutes: number;
        kind: "one" | "class";
        capacity: number;
        priceCents: number | null;
        currency: string | null;
        online: boolean;
        /** Who takes it, by display name. */
        staff: string[];
    }[];
}

/** A pay-now hold, as the booking page polls it (U19). */
export interface PublicHold {
    state: HoldState;
    holdExpiresAt: string | null;
    booking: PublicBooking;
}

/** A service's GST rate (ADR-008): one GST has, or null to clear it. */
function serviceGstRate(rate: string | null | undefined): string | null {
    if (rate === undefined || rate === null) return null;
    if (!isGstRate(rate)) {
        throw new BadRequestException({
            message: `${rate}% is not a GST rate. Use 0, 0.25, 3, 5, 12, 18, 28 or 40.`,
            details: { field: "gstRate" },
        });
    }
    return rate;
}

@Injectable()
export class BookingsService {
    /**
     * @param rateLimiter per-instance limiter (default 5 hits / minute per
     * `${serviceId}:${ipHash}`). Injectable for tests.
     */
    constructor(
        // Not a DI provider — a per-instance default; @Optional() stops Nest
        // trying to inject it so the default (and test overrides) apply.
        @Optional()
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(),
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    /**
     * Reads and releases of a pay-now hold (#508). The page polls every four
     * seconds while its booker pays — 15 a minute — so one hold gets 40.
     * Counted per hashed IP AND token, so one payer cannot use up a limit
     * the other customers on the same network share.
     */
    private readonly holdLimiter = new FixedWindowRateLimiter(40, 60_000);

    /**
     * And a ceiling per hashed IP, whatever the token: room for ten people
     * paying at once from one network (a gym's wifi), not for a scraper. It
     * is checked first — the token is the caller's to make up, so only this
     * bounds a run of invented tokens, and the keys it leaves behind.
     */
    private readonly holdIpCeiling = new FixedWindowRateLimiter(150, 60_000);

    // ── Service CRUD ───────────────────────────────────────────────────────

    /**
     * Create a bookable Service for the org. Authorizes `service:write`,
     * validates the IANA timezone and (if given) that `siteId` belongs to the
     * org. New services are ACTIVE and immediately bookable.
     */
    async createService(
        ctx: OrganizationContext,
        dto: CreateServiceDto,
    ): Promise<Service> {
        authorize(ctx, "service:write");

        this.assertValidTimezone(dto.timezone);
        if (dto.siteId) {
            await this.requireOwnedSite(ctx, dto.siteId);
        }
        const location = resolveLocation(
            dto.locationType ?? "IN_PERSON",
            dto.meetingUrl ?? null,
        );

        return prisma.service.create({
            data: {
                organizationId: ctx.organizationId,
                siteId: dto.siteId ?? null,
                name: dto.name,
                description: dto.description ?? null,
                durationMinutes: dto.durationMinutes,
                bufferBeforeMinutes: dto.bufferBeforeMinutes ?? 0,
                bufferAfterMinutes: dto.bufferAfterMinutes ?? 0,
                capacity: dto.capacity ?? 1,
                priceCents: dto.priceCents ?? null,
                currency: dto.currency ?? null,
                gstRate: serviceGstRate(dto.gstRate),
                sacCode: dto.sacCode ?? null,
                timezone: dto.timezone,
                ...location,
                status: "ACTIVE",
            },
        });
    }

    /** List the org's services, newest first (excludes soft-deleted). `service:read`. */
    async listServices(ctx: OrganizationContext): Promise<Service[]> {
        authorize(ctx, "service:read");
        return prisma.service.findMany({
            where: { organizationId: ctx.organizationId, deletedAt: null },
            orderBy: { createdAt: "desc" },
        });
    }

    /** Get one owned service. `service:read`; cross-tenant/missing → 404. */
    async getService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<Service> {
        authorize(ctx, "service:read");
        return this.requireOwnedService(ctx, serviceId);
    }

    /**
     * Update a Service. Authorizes `service:write`, loads the org's own service
     * (404 otherwise), re-validates a new timezone. Only supplied fields change.
     */
    async updateService(
        ctx: OrganizationContext,
        serviceId: string,
        dto: UpdateServiceDto,
    ): Promise<Service> {
        authorize(ctx, "service:write");

        const service = await this.requireOwnedService(ctx, serviceId);

        if (dto.timezone !== undefined) {
            this.assertValidTimezone(dto.timezone);
        }

        const data: Prisma.ServiceUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.durationMinutes !== undefined) {
            data.durationMinutes = dto.durationMinutes;
        }
        if (dto.bufferBeforeMinutes !== undefined) {
            data.bufferBeforeMinutes = dto.bufferBeforeMinutes;
        }
        if (dto.bufferAfterMinutes !== undefined) {
            data.bufferAfterMinutes = dto.bufferAfterMinutes;
        }
        if (dto.capacity !== undefined) {
            // A course promises its seats on this service (ADR-007).
            if (dto.capacity < service.capacity) {
                const widest = await prisma.course.findFirst({
                    where: {
                        serviceId: service.id,
                        status: { not: "ARCHIVED" },
                        seats: { gt: dto.capacity },
                    },
                    orderBy: { seats: "desc" },
                    select: { name: true, seats: true },
                });
                if (widest) {
                    throw new ConflictException(
                        `${widest.name} has ${widest.seats} seats on this service. Lower its seats first, or keep the capacity at ${widest.seats} or more.`,
                    );
                }
            }
            data.capacity = dto.capacity;
        }
        if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
        if (dto.currency !== undefined) data.currency = dto.currency;
        if (dto.gstRate !== undefined)
            data.gstRate = serviceGstRate(dto.gstRate);
        if (dto.sacCode !== undefined) data.sacCode = dto.sacCode;
        if (dto.timezone !== undefined) data.timezone = dto.timezone;
        if (dto.status !== undefined) data.status = dto.status;
        if (dto.locationType !== undefined || dto.meetingUrl !== undefined) {
            Object.assign(
                data,
                resolveLocation(
                    dto.locationType ?? (service.locationType as LocationType),
                    dto.meetingUrl !== undefined
                        ? dto.meetingUrl
                        : service.meetingUrl,
                ),
            );
        }

        return prisma.service.update({ where: { id: service.id }, data });
    }

    /**
     * Soft-delete a Service: set `deletedAt` + ARCHIVED so it stops accepting
     * bookings while its historical bookings survive. `service:write`;
     * cross-tenant/missing → 404.
     */
    async removeService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "service:write");

        const service = await this.requireOwnedService(ctx, serviceId);
        await prisma.service.update({
            where: { id: service.id },
            data: { deletedAt: new Date(), status: "ARCHIVED" },
        });
        return { id: service.id, deleted: true };
    }

    // ── Availability rules ─────────────────────────────────────────────────

    /** List a service's availability rules. `service:read`. */
    async listRules(ctx: OrganizationContext, serviceId: string) {
        authorize(ctx, "service:read");
        await this.requireOwnedService(ctx, serviceId);
        return prisma.availabilityRule.findMany({
            where: { serviceId, organizationId: ctx.organizationId },
            orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        });
    }

    /**
     * Replace a service's ENTIRE rule set atomically (delete-all + create-all in
     * one tx). Authorizes `service:write`; validates every rule. Empty array
     * clears availability.
     */
    async replaceRules(
        ctx: OrganizationContext,
        serviceId: string,
        rules: AvailabilityRuleDto[],
    ) {
        authorize(ctx, "service:write");
        await this.requireOwnedService(ctx, serviceId);
        rules.forEach((rule) => this.assertRuleWellFormed(rule));

        return prisma.$transaction(async (tx) => {
            await tx.availabilityRule.deleteMany({ where: { serviceId } });
            if (rules.length > 0) {
                await tx.availabilityRule.createMany({
                    data: rules.map((rule) => ({
                        organizationId: ctx.organizationId,
                        serviceId,
                        dayOfWeek: rule.dayOfWeek,
                        startMinute: rule.startMinute,
                        endMinute: rule.endMinute,
                    })),
                });
            }
            return tx.availabilityRule.findMany({
                where: { serviceId },
                orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
            });
        });
    }

    /** Add a single availability rule to a service. `service:write`. */
    async addRule(
        ctx: OrganizationContext,
        serviceId: string,
        rule: AvailabilityRuleDto,
    ) {
        authorize(ctx, "service:write");
        await this.requireOwnedService(ctx, serviceId);
        this.assertRuleWellFormed(rule);

        return prisma.availabilityRule.create({
            data: {
                organizationId: ctx.organizationId,
                serviceId,
                dayOfWeek: rule.dayOfWeek,
                startMinute: rule.startMinute,
                endMinute: rule.endMinute,
            },
        });
    }

    /** Delete one availability rule (must belong to an owned service). `service:write`. */
    async deleteRule(
        ctx: OrganizationContext,
        serviceId: string,
        ruleId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "service:write");
        await this.requireOwnedService(ctx, serviceId);

        const rule = await prisma.availabilityRule.findUnique({
            where: { id: ruleId },
        });
        if (
            rule?.serviceId !== serviceId ||
            rule.organizationId !== ctx.organizationId
        ) {
            throw new NotFoundException("Availability rule not found");
        }
        await prisma.availabilityRule.delete({ where: { id: rule.id } });
        return { id: rule.id, deleted: true };
    }

    // ── Availability (open slots) ──────────────────────────────────────────

    /**
     * Authenticated availability preview for an owned service over `[from, to)`.
     * `service:read`. Returns absolute-UTC open slots (capacity honoured).
     */
    async availability(
        ctx: OrganizationContext,
        serviceId: string,
        fromISO: string,
        toISO: string,
        staffId?: string,
    ): Promise<AvailableSlot[]> {
        authorize(ctx, "service:read");
        const service = await this.requireOwnedService(ctx, serviceId);
        const { from, to } = this.parseRange(fromISO, toISO);
        const rules = await prisma.availabilityRule.findMany({
            where: { serviceId },
        });
        return this.openSlots(service, rules, from, to, staffId);
    }

    /**
     * PUBLIC availability for a bookable service — no auth, org-agnostic. Loads
     * the ACTIVE service of an organization with Appointments on (404/410
     * otherwise) and returns open slots for the range. The org is never
     * surfaced.
     *
     * The business's booking rules apply here (U3): nothing sooner than the
     * latest-booking rule or further ahead than book-ahead is offered. People
     * appear only as opaque ids — never when or why someone is off.
     */
    async publicAvailability(
        serviceId: string,
        fromISO: string,
        toISO: string,
        staffId?: string,
        now: Date = new Date(),
    ): Promise<AvailableSlot[]> {
        const { service, rules } = await this.loadBookableService(serviceId);
        const { from, to } = this.parseRange(fromISO, toISO);
        const [slots, bookingRules] = await Promise.all([
            this.openSlots(service, rules, from, to, staffId),
            loadBookingRules(prisma, service.organizationId),
        ]);
        return slots.filter((slot) =>
            withinBookingWindow(slot.startAt, now, bookingRules),
        );
    }

    /**
     * Who takes a public service, for the booking page's "with whom" step
     * (U3): a display name and an opaque id per person, nothing else.
     */
    async publicServiceStaff(serviceId: string): Promise<PublicStaff[]> {
        await this.loadBookableService(serviceId);
        const people = await serviceStaff(prisma, serviceId);
        return people.map(({ id, name }) => ({ id, name }));
    }

    /**
     * The booking page's next two weeks for one service (U19), day by day in
     * the business's zone: whether it is open that day, and its starts.
     *
     * A one-to-one lists its free starts, each with the first person free
     * then (by name — the page shows who before the booker confirms). A class
     * (a service with more than one place) lists every session inside the
     * booking rules with its places left, full ones included, so the page can
     * say Full. A day is open when the hours alone would offer a start on it
     * — the service's rules, or its people's weekly and one-off hours — and it
     * is inside book-ahead; nothing about who is booked or off is used for
     * that, so a day someone is off reads Full, never why.
     */
    async publicDays(
        serviceId: string,
        now: Date = new Date(),
    ): Promise<PublicDays> {
        const { service, rules } = await this.loadBookableService(serviceId);
        const [bookingRules, zone, staffing] = await Promise.all([
            loadBookingRules(prisma, service.organizationId),
            businessTimezone(prisma, service.organizationId),
            this.staffing(service),
        ]);
        const first = DateTime.fromJSDate(now, { zone }).startOf("day");
        const from = first.toJSDate();
        const to = first.plus({ days: PUBLIC_DAYS }).toJSDate();
        const names = new Map(staffing.people.map((p) => [p.id, p.name]));
        const availService = this.toAvailabilityService(service);
        // Never a start that has begun; then the business's own rules.
        const bookable = (startAt: Date) =>
            startAt > now && withinBookingWindow(startAt, now, bookingRules);
        const kind: PublicDays["kind"] = service.capacity > 1 ? "class" : "one";

        // What the hours alone offer (open days), and what is free now.
        let hours: Slot[];
        let starts: PublicStart[];
        if (staffing.perPerson && staffing.zone) {
            const people = await loadPeople(
                prisma,
                staffing.people.map((p) => p.id),
                from,
                to,
            );
            hours = staffSlots(
                availService,
                rules,
                people.map((p) => ({ ...p, busy: [], timeOff: [] })),
                staffing.zone,
                from,
                to,
            );
            starts = staffSlots(
                availService,
                rules,
                people,
                staffing.zone,
                from,
                to,
            )
                .filter((slot) => bookable(slot.startAt))
                .map((slot) => {
                    const staffId = slot.staffIds[0] ?? null;
                    return {
                        startAt: slot.startAt.toISOString(),
                        endAt: slot.endAt.toISOString(),
                        staffId,
                        staffName: staffId
                            ? (names.get(staffId) ?? null)
                            : null,
                        placesLeft: null,
                    };
                });
        } else {
            hours = enumerateSlots(availService, rules, from, to);
            const busy = await this.busyOverlapping(service.id, from, to);
            const [instructor] = staffing.people as (
                Staffing["people"][number] | undefined
            )[];
            starts = hours
                .filter((slot) => bookable(slot.startAt))
                .map((slot) => {
                    const left =
                        service.capacity - countOverlapping(slot, busy);
                    return {
                        startAt: slot.startAt.toISOString(),
                        endAt: slot.endAt.toISOString(),
                        staffId: instructor?.id ?? null,
                        staffName: instructor?.name ?? null,
                        placesLeft: kind === "class" ? Math.max(0, left) : null,
                        free: left > 0,
                    };
                })
                // A one-to-one lists only what is free; a class, every session.
                .filter((start) => kind === "class" || start.free)
                .map(({ free: _free, ...start }) => start);
        }

        const aheadEnd =
            bookingRules.bookAheadDays === null
                ? null
                : now.getTime() + bookingRules.bookAheadDays * 86_400_000;
        const days: PublicDay[] = [];
        for (let i = 0; i < PUBLIC_DAYS; i += 1) {
            const day = first.plus({ days: i });
            const dayFrom = day.toMillis();
            const dayTo = day.plus({ days: 1 }).toMillis();
            const inDay = (iso: string | Date) => {
                const t = new Date(iso).getTime();
                return t >= dayFrom && t < dayTo;
            };
            days.push({
                date: day.toISODate() ?? "",
                open:
                    hours.some((slot) => inDay(slot.startAt)) &&
                    (aheadEnd === null || dayFrom <= aheadEnd),
                starts: starts.filter((start) => inDay(start.startAt)),
            });
        }
        return { timezone: zone, kind, capacity: service.capacity, days };
    }

    /**
     * What a site's booking page opens with (U19): the business, the services
     * it may offer (active, of this site or of no site, Appointments on), who
     * takes each — names only — the booking rules and whether it can take
     * payment online. A site that is not published is a 404, like its pages.
     */
    async publicBookingPage(siteId: string): Promise<PublicBookingPage> {
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                deletedAt: null,
                currentPublicationId: { not: null },
            },
            select: {
                organizationId: true,
                organization: { select: { name: true } },
            },
        });
        if (!site) throw new NotFoundException("Site not found");
        const organizationId = site.organizationId;
        const open = await appointmentsOpen(organizationId);
        const [services, rules, zone, online] = await Promise.all([
            open
                ? prisma.service.findMany({
                      where: {
                          organizationId,
                          deletedAt: null,
                          status: "ACTIVE",
                          OR: [{ siteId: null }, { siteId }],
                      },
                      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                      select: {
                          id: true,
                          name: true,
                          description: true,
                          durationMinutes: true,
                          capacity: true,
                          priceCents: true,
                          currency: true,
                          locationType: true,
                          staffServices: {
                              where: { staff: { status: "ACTIVE" } },
                              select: { staff: { select: { name: true } } },
                          },
                      },
                  })
                : Promise.resolve([]),
            loadBookingRules(prisma, organizationId),
            businessTimezone(prisma, organizationId),
            this.takesOnlinePayment(organizationId),
        ]);
        return {
            businessName: site.organization.name,
            open,
            timezone: zone,
            payOnline: online,
            rules,
            services: services.map((svc) => ({
                id: svc.id,
                name: svc.name,
                description: svc.description,
                durationMinutes: svc.durationMinutes,
                kind: svc.capacity > 1 ? "class" : "one",
                capacity: svc.capacity,
                priceCents: svc.priceCents,
                currency: svc.currency,
                online: svc.locationType === "ONLINE",
                staff: svc.staffServices
                    .map((row) => row.staff.name)
                    .sort((a, b) => a.localeCompare(b)),
            })),
        };
    }

    /**
     * A pay-now hold, by its pay token (U19): what the booking page polls
     * while the customer pays. The booking as the booker sees it, and where
     * the hold stands. An unknown or cleared token is a 404.
     */
    async publicHold(
        token: string,
        ipHash: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicHold> {
        this.takeHoldHit(token, ipHash, now);
        const booking = await this.holdBooking(token);
        return {
            state: holdState(booking, now),
            holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
            booking: toPublicBooking(booking),
        };
    }

    /**
     * Let a hold go before its time (U19): the customer chose to pay at the
     * desk instead, or the payment could not start. Only a hold still
     * PENDING is released; anything else is answered as it stands.
     */
    async releasePublicHold(
        token: string,
        ipHash: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicHold> {
        this.takeHoldHit(token, ipHash, now);
        const found = await this.holdBooking(token);
        await prisma.$transaction((tx) => releaseHoldInTx(tx, found.id, now));
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: found.id },
        });
        return {
            state: holdState(booking, now),
            holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
            booking: toPublicBooking(booking),
        };
    }

    /** One read or release of a hold against its limits; 429 past them. */
    private takeHoldHit(
        token: string,
        ipHash: string | undefined,
        now: Date,
    ): void {
        if (!ipHash) return;
        const at = now.getTime();
        // The ceiling first and on its own: a refusal there never adds a
        // per-token key.
        const allowed =
            this.holdIpCeiling.take(ipHash, at) &&
            this.holdLimiter.take(`${ipHash}:${hashPayToken(token)}`, at);
        if (!allowed) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
    }

    private async holdBooking(token: string): Promise<Booking> {
        const invoice = await prisma.invoice.findUnique({
            where: { payTokenHash: hashPayToken(token) },
            select: { source: true, booking: true },
        });
        if (invoice?.source !== "BOOKING" || !invoice.booking) {
            throw new NotFoundException("Booking not found");
        }
        return invoice.booking;
    }

    /**
     * Open slots over `[from, to)`. A one-to-one somebody takes gets them per
     * person (U3); anything else from the service's own rules and capacity,
     * exactly as before — with its instructors named when it has any.
     */
    private async openSlots(
        service: Service,
        rules: AvailabilityRuleWindow[],
        from: Date,
        to: Date,
        staffId?: string,
    ): Promise<AvailableSlot[]> {
        const staffing = await this.staffing(service);
        if (staffId && !staffing.people.some((p) => p.id === staffId)) {
            throw new BadRequestException({
                message: "That person doesn't take this service.",
                field: "staffId",
            });
        }
        const availService = this.toAvailabilityService(service);
        if (staffing.perPerson && staffing.zone) {
            const ids = staffId
                ? [staffId]
                : staffing.people.map((person) => person.id);
            const people = await loadPeople(prisma, ids, from, to);
            const slots: StaffSlot[] = staffSlots(
                availService,
                rules,
                people,
                staffing.zone,
                from,
                to,
            );
            return slots;
        }
        const busy = await this.busyOverlapping(service.id, from, to);
        const slots = availableSlots(availService, rules, from, to, busy);
        if (staffing.people.length === 0) return slots;
        const instructors = staffId
            ? [staffId]
            : staffing.people.map((person) => person.id);
        return slots.map((slot) => ({ ...slot, staffIds: instructors }));
    }

    /** How a service is staffed — see {@link Staffing}. */
    private async staffing(service: Service): Promise<Staffing> {
        const people = await serviceStaff(prisma, service.id);
        const perPerson = service.capacity === 1 && people.length > 0;
        return {
            people,
            perPerson,
            zone: perPerson
                ? await businessTimezone(prisma, service.organizationId)
                : null,
        };
    }

    /**
     * Who a booking at `startAt` is with (U3), or null for a service nobody
     * takes. A one-to-one needs the start to be one of the person's free
     * starts — the named one, or the first person free; a class is taken by
     * the named instructor or its first. A merchant is told why a named
     * person cannot (booked or not working); a public booker only that the
     * time is not available, so time off never leaves the business.
     */
    private async resolvePerson(
        service: Service,
        rules: AvailabilityRuleWindow[],
        staffing: Staffing,
        startAt: Date,
        requested: string | undefined,
        audience: "public" | "team",
        excludeBookingId?: string,
    ): Promise<ReserveWith> {
        const named = requested
            ? staffing.people.find((p) => p.id === requested)
            : undefined;
        if (requested && !named) {
            throw new BadRequestException({
                message: "That person doesn't take this service.",
                field: "staffId",
            });
        }
        if (staffing.people.length === 0) {
            return { staffId: null, perPerson: false };
        }
        if (!staffing.perPerson || !staffing.zone) {
            const instructor = named ?? staffing.people[0];
            return {
                staffId: instructor.id,
                staffName: instructor.name,
                perPerson: false,
            };
        }

        const zone = staffing.zone;
        const availService = this.toAvailabilityService(service);
        const candidates = named ? [named] : staffing.people;
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );
        const people = await loadPeople(
            prisma,
            candidates.map((p) => p.id),
            startAt,
            endAt,
            excludeBookingId,
        );
        // loadPeople answers in the order asked, so each person is the
        // candidate at the same place.
        for (const [index, person] of people.entries()) {
            if (
                isPersonSlotStart(
                    availService,
                    rules,
                    person,
                    staffing.zone,
                    startAt,
                )
            ) {
                const found = candidates[index];
                return {
                    staffId: found.id,
                    staffName: found.name,
                    perPerson: true,
                };
            }
        }

        if (named && audience === "team") {
            const person = people[0];
            const slot = { startAt, endAt };
            if (countOverlapping(slot, person.busy) > 0) {
                throw new ConflictException({
                    message: `${named.name} is already booked then.`,
                    field: "staffId",
                });
            }
            let windows = workingIntervals(
                person,
                staffing.zone,
                startAt,
                endAt,
            );
            if (rules.length > 0) {
                windows = intersectIntervals(
                    windows,
                    weeklyIntervals(rules, service.timezone, startAt, endAt),
                );
            }
            if (!withinIntervals(slot, windows)) {
                throw new BadRequestException({
                    message: `${named.name} isn't working then.`,
                    field: "staffId",
                });
            }
        }
        // A public booker whose start was a real one — inside somebody's
        // hours, but booked meanwhile, or off — hears it went, as a conflict:
        // the page then shows what is left, as it does for a full class.
        // Booked and off read alike, so time off never leaves the business.
        if (
            audience === "public" &&
            people.some((person) =>
                isPersonSlotStart(
                    availService,
                    rules,
                    { ...person, busy: [], timeOff: [] },
                    zone,
                    startAt,
                ),
            )
        ) {
            throw new ConflictException({
                message: named
                    ? `That time with ${named.name} is no longer available. Pick another time.`
                    : "That time is no longer available. Pick another time.",
                field: "startAt",
            });
        }
        throw new BadRequestException({
            message: named
                ? `That time isn't available with ${named.name}. Pick another time.`
                : "That time is not an open slot for this service",
            field: "startAt",
        });
    }

    /**
     * The public view of a merchant's chosen services, for the website's
     * services list (#255). Guardless like availability: the ids come from a
     * published section, and only fields a visitor is meant to see leave here.
     *
     * Read live, not frozen at publish, so a changed price or a deleted service
     * is right on the next page view. Filtered to what may be offered:
     * - not deleted, and ACTIVE (an archived service is not on offer);
     * - its Organization has not DISABLED Appointments. A missing module row
     *   counts as on: enforcement is still dark (#117) and the backfill may not
     *   have written one, and hiding a merchant's services over an absent row
     *   would be the wrong way to fail.
     *
     * Returned in the order asked for, which is the order the merchant set.
     * Unknown ids are dropped, never an error: the page must degrade, not 404.
     */
    async publicServices(ids: string[]): Promise<PublicService[]> {
        if (ids.length === 0) return [];
        const rows = await prisma.service.findMany({
            where: {
                id: { in: ids },
                deletedAt: null,
                status: "ACTIVE",
                // The same rule public booking closes on (#327), so a list
                // never offers a service its booking block would refuse.
                organization: APPOINTMENTS_OPEN,
            },
            select: {
                id: true,
                name: true,
                description: true,
                durationMinutes: true,
                priceCents: true,
                currency: true,
            },
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        return ids.flatMap((id) => {
            const row = byId.get(id);
            return row ? [row] : [];
        });
    }

    // ── Bookings (management) ──────────────────────────────────────────────

    /**
     * List the org's bookings (optionally for one service), newest slot first.
     * `booking:read`.
     *
     * The linked Contact travels with each row. A booking's `bookerName` is only
     * populated when someone typed one into the public form, so the management
     * screen was showing "Unknown booker" for bookings whose person the CRM knew
     * perfectly well — and Home, which does join the contact, named them on the
     * same visit. Two screens disagreeing about who a booking belongs to is
     * worse than either being sparse.
     *
     * Only the name parts and email are selected. A booking list has no business
     * carrying a contact's phone or company, and `booking:read` is not
     * `contact:read`.
     */
    async listBookings(ctx: OrganizationContext, serviceId?: string) {
        authorize(ctx, "booking:read");
        if (serviceId) {
            // Ensure the service is owned before filtering by it (404 otherwise).
            await this.requireOwnedService(ctx, serviceId);
        }
        return prisma.booking.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(serviceId ? { serviceId } : {}),
            },
            orderBy: { startAt: "desc" },
            include: {
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                // Who takes it (U3); null on bookings made before staff.
                staff: { select: { id: true, name: true } },
            },
        });
    }

    /**
     * The bookings calendar in one read (U4): every booking overlapping
     * `[from, to)`, grouped by the person who takes it, class starts gathered
     * into sessions with their places and how each was paid. Replaces the
     * app's fan-out over every service. `booking:read`.
     *
     * Every active person gets a diary, booked or not — the calendar draws a
     * column for each; with `staffId`, only theirs (another org's is a 404).
     * Prices only with `payment:read` (DEC-020): a Member sees the diary and
     * the people on it, not the money.
     */
    async calendarBookings(
        ctx: OrganizationContext,
        query: { from: string; to: string; staffId?: string },
    ): Promise<BookingsCalendar> {
        authorize(ctx, "booking:read");
        const from = new Date(query.from);
        const to = new Date(query.to);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new BadRequestException("from and to must be dates.");
        }
        if (to <= from) {
            throw new BadRequestException("to must be after from.");
        }
        if (to.getTime() - from.getTime() > MAX_CALENDAR_RANGE_MS) {
            throw new BadRequestException(
                "A bookings range can be at most two years.",
            );
        }
        const organizationId = ctx.organizationId;
        const staffId = query.staffId;
        const now = new Date();
        const [people, rows, zone] = await Promise.all([
            prisma.staffMember.findMany({
                where: staffId
                    ? { id: staffId, organizationId }
                    : { organizationId, status: "ACTIVE" },
                orderBy: [{ name: "asc" }, { id: "asc" }],
                select: { id: true, name: true, title: true },
            }),
            prisma.booking.findMany({
                where: {
                    organizationId,
                    startAt: { lt: to },
                    endAt: { gt: from },
                    ...(staffId ? { staffId } : {}),
                },
                orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
                select: diarySelect,
            }),
            businessZone(prisma, organizationId),
        ]);
        if (staffId && people.length === 0) {
            throw new NotFoundException("Staff member not found");
        }
        const money = allows(ctx, "payment:read");
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            timezone: zone.zone,
            money,
            // A pay-now hold whose time ran out holds nothing (U19), even
            // before the sweep job has cancelled it.
            diaries: groupDiaries(
                rows.map((row) =>
                    isExpiredHold(row, now)
                        ? { ...row, status: "CANCELLED" }
                        : row,
                ),
                people,
                money,
            ),
        };
    }

    /**
     * Cancel a booking: set status CANCELLED + `cancelledAt`, freeing the slot.
     * Authorizes `booking:write`; cross-tenant/missing → 404. Idempotent — an
     * already-cancelled booking is returned unchanged.
     *
     * The business's free-cancellation rule decides what happens to a class
     * that was paid for (U3): cancelled in time, a pack's class goes back;
     * inside the window it stays used and the booking says it was cancelled
     * late (a membership's class then counts against its month too). With no
     * rule, every cancel is in time — as before the rules existed.
     *
     * `returnCredit` is the business cancelling rather than the customer —
     * a whole class called off (U15). The rule protects the business from a
     * customer dropping out late; it never takes a class from someone whose
     * class was cancelled on them.
     *
     * A pay-now hold (PENDING) is released rather than cancelled (#508): its
     * draft invoice is voided with it, as when its time runs out.
     */
    async cancelBooking(
        ctx: OrganizationContext,
        bookingId: string,
        now: Date = new Date(),
        options: { returnCredit?: boolean } = {},
    ): Promise<Booking> {
        authorize(ctx, "booking:write");

        const found = await this.requireOwnedBooking(ctx, bookingId);
        if (found.status === "CANCELLED") {
            return found;
        }
        const rules = await loadBookingRules(prisma, ctx.organizationId);
        return prisma.$transaction(async (tx) => {
            // Where it stands now, under its locks — invoice before booking,
            // the webhook's order (#508) — so a second cancel, or a payment
            // landing on a hold, is seen rather than overwritten.
            await lockBookingInTx(tx, found.id);
            const booking =
                (await tx.booking.findUnique({ where: { id: found.id } })) ??
                found;
            if (booking.status === "CANCELLED") return booking;
            // A pay-now hold nobody has paid: let it go as the booker would,
            // so its draft invoice is voided and its pay link stops working.
            // A payment that lands after is recorded as owed back.
            if (booking.status === "PENDING") {
                await releaseHoldInTx(tx, booking.id, now, ctx.userId);
                return (
                    (await tx.booking.findUnique({
                        where: { id: booking.id },
                    })) ?? booking
                );
            }
            const late =
                !options.returnCredit &&
                isLateCancel(booking.startAt, now, rules);
            const cancelled = await tx.booking.update({
                where: { id: booking.id },
                data: {
                    status: "CANCELLED",
                    cancelledAt: now,
                    cancelledLate: late,
                },
            });
            // A class paid for with a pack goes back to it (ADR-007) —
            // unless it was cancelled too late to (U3).
            if (!late) await reversePackInTx(tx, booking.id);
            // The slot it was cancelled OUT of, so the history reads as a
            // sequence rather than a list of states with the times missing.
            await tx.bookingEvent.create({
                data: {
                    bookingId: booking.id,
                    organizationId: ctx.organizationId,
                    type: BookingEventType.Cancelled,
                    actorUserId: ctx.userId,
                    fromStartAt: booking.startAt,
                },
                select: { id: true },
            });
            return cancelled;
        });
    }

    /**
     * Record how an appointment went (#241). `booking:write`.
     *
     * Four rules, each of which is a decision rather than a detail:
     *
     * **Only a person sets it.** Nothing in this codebase writes an outcome
     * when a slot elapses. A booking whose time has passed is evidence of
     * nothing except that the time has passed, and auto-completing would fill
     * the ledger with attendance nobody witnessed — which is worse than an
     * empty ledger, because it reads as fact.
     *
     * **Not before it could have happened.** The desk checks someone in when
     * they walk in, so attendance may be said from an hour before the start
     * (U15, the bookings calendar); a no-show only once the start has passed,
     * since nobody has failed to turn up before then. Marking next week's
     * appointment attended is not a mistake worth supporting.
     *
     * **Never on a cancelled booking.** Cancelled-in-advance and did-not-turn-up
     * are the two most different things a merchant can be told about a
     * customer, and letting one be relabelled as the other would quietly
     * destroy that distinction.
     *
     * **Correctable.** A merchant who taps the wrong one can change it, and
     * the change is appended rather than overwritten — so the history shows
     * both what was said and what it was corrected to.
     */
    async recordOutcome(
        ctx: OrganizationContext,
        bookingId: string,
        outcome: BookingOutcome,
        now: Date = new Date(),
    ): Promise<Booking> {
        authorize(ctx, "booking:write");
        const booking = await this.requireOwnedBooking(ctx, bookingId);

        if (booking.status === "CANCELLED") {
            throw new ConflictException(
                "This booking was cancelled, which is already how it went.",
            );
        }
        const refusal = outcomeTooEarly(outcome, booking.startAt, now);
        if (refusal) throw new ConflictException(refusal);
        if (booking.outcome === outcome) {
            // Already said. Not an error, and not a second history line.
            return booking;
        }

        return prisma.$transaction(async (tx) => {
            const updated = await tx.booking.update({
                where: { id: booking.id },
                data: { outcome },
            });
            await tx.bookingEvent.create({
                data: {
                    bookingId: booking.id,
                    organizationId: ctx.organizationId,
                    type:
                        outcome === "ATTENDED"
                            ? BookingEventType.Attended
                            : BookingEventType.NoShow,
                    actorUserId: ctx.userId,
                    // The slot it is about, like CANCELLED — so a history line
                    // says which appointment, not just what was decided.
                    fromStartAt: booking.startAt,
                },
                select: { id: true },
            });
            return updated;
        });
    }

    /**
     * One booking, with everything the detail screen states (#121): the service
     * it is for, the contact it belongs to, and what has happened to it.
     *
     * `booking:read`. Cross-tenant or missing is a 404, like everywhere else.
     * The contact carries only name and email — a booking screen has no
     * business showing a contact's company, and `booking:read` is not
     * `contact:read`.
     */
    async getBooking(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<BookingDetail> {
        authorize(ctx, "booking:read");
        await this.requireOwnedBooking(ctx, bookingId);
        return prisma.booking.findUniqueOrThrow({
            where: { id: bookingId },
            include: bookingDetailInclude,
        });
    }

    /**
     * Move a booking to a different slot (#121).
     *
     * Cancelling was the only thing a merchant could do to a booking, so the
     * commonest request a customer makes — "can we move it?" — had no answer
     * in the product but to cancel and ask them to book again, losing the
     * booking and its history.
     *
     * THE NEW TIME MUST BE A REAL OPEN SLOT. It is checked with
     * `isValidSlotStart` — the same function the public form passes — so a
     * merchant cannot put a booking somewhere the service is closed, or
     * off the duration grid, and land a customer at a time nothing else in
     * the product believes in.
     *
     * Capacity is re-counted INSIDE a serializable transaction, exactly as
     * {@link book} does and for the same reason: a reschedule and a public
     * booking racing for the last seat must not both win. The count EXCLUDES
     * this booking, otherwise a capacity-one booking could never be nudged to
     * an overlapping slot — it would collide with itself.
     *
     * `Booking.snapshot` is deliberately NOT rewritten. It is the terms as they
     * were agreed at booking time; the slot inside it is the ORIGINAL one, and
     * the move is recorded as a `BookingEvent` instead.
     */
    async rescheduleBooking(
        ctx: OrganizationContext,
        bookingId: string,
        input: { startAt: string },
    ): Promise<Booking> {
        authorize(ctx, "booking:write");
        const booking = await this.requireOwnedBooking(ctx, bookingId);

        if (booking.status === "CANCELLED") {
            // Nothing to move. Reinstating a cancelled booking is a different
            // decision (the slot may be gone) and is not this.
            throw new ConflictException(
                "This booking was cancelled. Book a new time instead of moving it.",
            );
        }
        if (booking.courseEnrollmentId) {
            // A course's sessions move together, for everyone on it.
            throw new ConflictException(
                "This is a course session. Change the course's sessions instead of moving one booking.",
            );
        }

        const startAt = new Date(input.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        if (startAt.getTime() === booking.startAt.getTime()) {
            // Already there. Not an error, and not an event either — a history
            // full of "moved to the time it was already at" is noise.
            return booking;
        }

        const service = await this.requireOwnedService(ctx, booking.serviceId);
        // An archived service is retired from the menu, and its availability
        // is retired with it: the windows it still carries describe hours the
        // merchant has stopped offering, so moving a booking into one would
        // put a customer in a slot the business no longer keeps. Cancelling
        // stays available — that is how a retired service's bookings are
        // wound down. (Archiving through the dashboard also soft-deletes, so
        // that path is already a 404 above; this covers a service whose status
        // alone was set.)
        if (service.status !== "ACTIVE") {
            throw new ConflictException(
                "This service is archived, so its bookings cannot be moved. Make it active again first, or cancel the booking.",
            );
        }
        const rules = await prisma.availabilityRule.findMany({
            where: { serviceId: service.id },
        });
        const availService = this.toAvailabilityService(service);
        // A booking with a person moves within that person's diary (U3):
        // one-to-one, to one of their free starts; a class, on the class's
        // own grid with its instructor checked for a clash.
        const staffing = booking.staffId
            ? await this.staffing(service)
            : { people: [], perPerson: false, zone: null };
        let person: ReserveWith = { staffId: null, perPerson: false };
        if (booking.staffId && staffing.perPerson) {
            person = await this.resolvePerson(
                service,
                rules,
                staffing,
                startAt,
                booking.staffId,
                "team",
                booking.id,
            );
        } else {
            if (!isValidSlotStart(availService, rules, startAt)) {
                throw new BadRequestException(
                    "That is not a bookable slot for this service",
                );
            }
            if (booking.staffId) {
                const instructor = staffing.people.find(
                    (p) => p.id === booking.staffId,
                );
                person = {
                    staffId: booking.staffId,
                    staffName: instructor?.name,
                    perPerson: false,
                };
            }
        }
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );

        try {
            return await prisma.$transaction(
                async (tx) => {
                    if (!person.perPerson) {
                        const taken = await tx.booking.count({
                            where: {
                                serviceId: service.id,
                                ...holdsPlace(new Date()),
                                startAt: { lt: endAt },
                                endAt: { gt: startAt },
                                // Itself is not a competitor for its own seat.
                                id: { not: booking.id },
                            },
                        });
                        const held = await courseSeatsHeld(
                            tx,
                            service.id,
                            startAt,
                            endAt,
                        );
                        if (taken + held >= service.capacity) {
                            throw new ConflictException(
                                "That slot is fully booked",
                            );
                        }
                    }
                    await this.assertPersonFreeInTx(
                        tx,
                        person,
                        service.id,
                        startAt,
                        endAt,
                        booking.id,
                    );
                    // A class paid with a pack is only paid while the pack
                    // is good on the day (ADR-007): the same rule as spending.
                    const paid = await tx.packRedemption.findFirst({
                        where: { bookingId: booking.id, reversedAt: null },
                        select: { purchase: { select: { expiresAt: true } } },
                    });
                    if (paid && paid.purchase.expiresAt <= startAt) {
                        throw new ConflictException(
                            "The class pack that paid for this booking expires before that time. Pick an earlier time, or take the pack off the booking first.",
                        );
                    }
                    // A membership's class is one of the month it lands in
                    // (#508): moved into another month, it needs a class
                    // left there, on a membership still active. The booking
                    // itself is not counted, so a move within its month fits.
                    if (
                        booking.paidWith === "MEMBERSHIP" &&
                        booking.subscriptionId
                    ) {
                        await useMembershipInTx(tx, {
                            organizationId: ctx.organizationId,
                            bookingId: booking.id,
                            contactId: booking.contactId ?? "",
                            subscriptionId: booking.subscriptionId,
                            startAt,
                        });
                    }

                    const moved = await tx.booking.update({
                        where: { id: booking.id },
                        data: { startAt, endAt },
                    });
                    await tx.bookingEvent.create({
                        data: {
                            bookingId: booking.id,
                            organizationId: ctx.organizationId,
                            type: BookingEventType.Rescheduled,
                            actorUserId: ctx.userId,
                            fromStartAt: booking.startAt,
                            toStartAt: startAt,
                        },
                        select: { id: true },
                    });
                    // Same transactional outbox as booking: a committed move
                    // always has a queued notification job, so a failed send
                    // cannot drop it. It is NOT delivered yet: no handler is
                    // registered for booking.notify, so the worker dead-letters
                    // these jobs (see jobs/job-consumers.spec.ts), and until one
                    // is, nothing tells the booker their time moved.
                    await tx.job.create({
                        data: {
                            organizationId: ctx.organizationId,
                            type: "booking.notify",
                            payload: {
                                bookingId: booking.id,
                                serviceId: service.id,
                                contactId: booking.contactId,
                                reason: "rescheduled",
                            },
                        },
                        select: { id: true },
                    });
                    return moved;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );
        } catch (err) {
            // Lost the race with a concurrent booking for the same seat.
            if ((err as { code?: string }).code === "P2034") {
                throw new ConflictException("That slot is fully booked");
            }
            throw err;
        }
    }

    // ── PUBLIC booking command ─────────────────────────────────────────────

    /**
     * Reserve a slot on a public Service. Steps (in order):
     *  1. Load the Service (+ rules); 404 if missing/soft-deleted, 410 if not ACTIVE.
     *     The org is taken from `service.organizationId`, NEVER from the client.
     *  2. Validate `startAt` is a real, geometrically-valid open slot (aligned to
     *     a rule window + duration stepping) — 400 otherwise.
     *  3. Idempotency: an existing booking for `(serviceId, idempotencyKey)` is replayed.
     *  4. Rate-limit by `${serviceId}:${ipHash}`; 429 on exceed.
     *  5. In ONE Serializable transaction: RE-COUNT confirmed overlaps and abort
     *     (409) if `>= capacity`, else upsert the Contact, create the CONFIRMED
     *     Booking (immutable snapshot), and enqueue the `booking.notify` Job.
     *
     * WHY the serializable in-tx re-count guarantees "only one confirmed booking
     * can own a capacity-one slot":
     *  - The step-4 pre-check is best-effort — two requests can both read
     *    count = 0 before either writes, so it CANNOT be the guarantee.
     *  - Inside a `Serializable` transaction, the `booking.count(...)` predicate
     *    read is tracked by Postgres' SSI. If two concurrent transactions both
     *    read "0 confirmed overlaps" and both INSERT a CONFIRMED booking into the
     *    same slot, their read/write sets form a dangerous dependency cycle;
     *    Postgres detects it at commit and aborts one with a serialization
     *    failure (surfaced by Prisma as P2034). So at most ONE commits — the
     *    other is rolled back and mapped to 409. The re-count also directly
     *    returns 409 when a conflicting booking is already committed and visible.
     *    Buffers are part of the slot geometry, so overlap uses the [start,end]
     *    interval — a capacity-1 slot admits exactly one CONFIRMED booking.
     */
    async book(
        serviceId: string,
        input: BookInput,
        ipHash: string | undefined,
    ): Promise<Booking> {
        return (await this.bookOnline(serviceId, input, ipHash)).booking;
    }

    /**
     * {@link book}, and what the booking page needs back from it (U19): for
     * pay now, the hold's pay token — handed over once, as a pay link is.
     *
     * Pay now needs a price, Payments on and a connected provider; the amount
     * is the service's price, read here, never the client's. The booking is
     * PENDING and holds its place for 15 minutes (`HOLD_MINUTES`) with a draft
     * invoice for it (`booking-hold.ts`); the provider's webhook confirms it.
     * Pay at the desk books it CONFIRMED with nothing charged.
     */
    async bookOnline(
        serviceId: string,
        input: BookInput,
        ipHash: string | undefined,
        now: Date = new Date(),
    ): Promise<{ booking: Booking; payToken: string | null }> {
        // 1. Load the Service. Org is derived from HERE, never the client.
        const { service, rules } = await this.loadBookableService(serviceId);
        await assertOrganizationOpen(service.organizationId);

        // 2. Validate the requested instant is a real, aligned slot start —
        //    with a person when somebody takes the service (U3) — and
        //    inside the business's booking rules.
        const startAt = new Date(input.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const availService = this.toAvailabilityService(service);
        const staffing = await this.staffing(service);
        if (
            !staffing.perPerson &&
            !isValidSlotStart(availService, rules, startAt)
        ) {
            throw new BadRequestException(
                "startAt is not a bookable slot for this service",
            );
        }
        const refusal = bookingWindowRefusal(
            startAt,
            now,
            await loadBookingRules(prisma, service.organizationId),
        );
        if (refusal) throw new BadRequestException(refusal);
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );
        // Pay now is refused before anything is held: no price, or no way
        // for this business to take the money online.
        const price =
            input.pay === "NOW" ? await this.onlinePrice(service) : null;

        // 3. Rate-limit per (service, hashed IP). Cheap abuse guard. Before
        //    the replay too, so replays cannot be used to probe for keys.
        if (ipHash) {
            const allowed = this.rateLimiter.take(`${serviceId}:${ipHash}`);
            if (!allowed) {
                throw new HttpException(
                    "Too many booking attempts — please slow down and try again shortly",
                    429,
                );
            }
        }

        // 4. Idempotency pre-check — replay an existing booking unchanged, but
        //    only to the same booker: a key alone does not hand over someone
        //    else's booking (or its meeting link).
        const existing = await this.bookingByKey(serviceId, input);
        if (existing) return this.replay(existing, input, now);

        // 5. Who it is with (U3) — after the replay, so a retried request is
        //    not refused by the person its own first attempt booked.
        //    A double submit can lose here too, once its twin has committed:
        //    the person is busy with the very booking this key made.
        let person: ReserveWith;
        try {
            person = await this.resolvePerson(
                service,
                rules,
                staffing,
                startAt,
                input.staffId,
                "public",
            );
        } catch (err) {
            const twin = await this.bookingByKey(serviceId, input);
            if (twin) return this.replay(twin, input, now);
            throw err;
        }
        if (input.pay === "DESK") person.paidWith = "DESK";

        // 6. Atomic, serializable reservation (see the method doc for WHY) —
        //    with the hold's invoice in the same transaction for pay now.
        // Written inside the transaction; a holder, since a closure's write
        // is invisible to the narrowing that follows.
        // Which booking this call wrote, so an idempotency race that hands
        // back the winner's is told apart — and a token made in a
        // transaction that was then rolled back is never handed out.
        const made: { bookingId: string | null; payToken: string | null } = {
            bookingId: null,
            payToken: null,
        };
        const also = {
            onRace: "This slot is fully booked",
            inTx: async (tx: Prisma.TransactionClient, booking: Booking) => {
                made.bookingId = booking.id;
                if (!price || !booking.contactId) return;
                const hold = await createHoldInvoiceInTx(tx, {
                    organizationId: service.organizationId,
                    bookingId: booking.id,
                    contactId: booking.contactId,
                    billToName: booking.bookerName,
                    billToEmail: booking.bookerEmail ?? "",
                    service: {
                        name: service.name,
                        priceCents: price.cents,
                        currency: price.currency,
                        timezone: service.timezone,
                        gstRate: service.gstRate,
                        sacCode: service.sacCode,
                    },
                    startAt,
                });
                made.payToken = hold.payToken;
            },
        };
        if (price) person.holdUntil = holdExpiry(now);
        const booking = await this.reserve(
            service,
            startAt,
            endAt,
            input,
            { source: `booking:service:${serviceId}`, actorUserId: null },
            also,
            person,
        );
        // An idempotency race replays the winner, which made its own token.
        if (made.bookingId !== booking.id) {
            return this.replay(booking, input, now);
        }
        return { booking, payToken: made.payToken };
    }

    /** The booking an idempotency key already made for this service, if any. */
    private async bookingByKey(
        serviceId: string,
        input: BookInput,
    ): Promise<Booking | null> {
        if (!input.idempotencyKey) return null;
        return prisma.booking.findUnique({
            where: {
                serviceId_idempotencyKey: {
                    serviceId,
                    idempotencyKey: input.idempotencyKey,
                },
            },
        });
    }

    /**
     * An idempotent replay, to the same booker only. A hold still inside its
     * time gets a fresh pay token (only the first one's hash was kept).
     */
    private async replay(
        existing: Booking,
        input: BookInput,
        now: Date = new Date(),
    ): Promise<{ booking: Booking; payToken: string | null }> {
        if (
            (existing.bookerEmail ?? "").toLowerCase() !==
            input.bookerEmail.trim().toLowerCase()
        ) {
            throw new ConflictException(
                "That booking was already made. Refresh the page and book again.",
            );
        }
        if (holdState(existing, now) !== "HELD") {
            return { booking: existing, payToken: null };
        }
        const payToken = await prisma.$transaction((tx) =>
            renewHoldTokenInTx(tx, existing.id),
        );
        return { booking: existing, payToken };
    }

    /**
     * What pay now charges for a service: its price, when it has one and the
     * business can take money online (Payments on, a provider connected).
     */
    private async onlinePrice(
        service: Service,
    ): Promise<{ cents: number; currency: string }> {
        if (
            !service.priceCents ||
            service.priceCents <= 0 ||
            !service.currency
        ) {
            throw new BadRequestException({
                message:
                    "This has no price to pay online. Book it to pay at the desk.",
                field: "pay",
            });
        }
        if (!(await this.takesOnlinePayment(service.organizationId))) {
            throw new ConflictException({
                message:
                    "This business isn't taking payment online right now. Book it to pay at the desk.",
                field: "pay",
            });
        }
        return { cents: service.priceCents, currency: service.currency };
    }

    /** Payments on, and a provider connected to take the money. */
    private async takesOnlinePayment(organizationId: string): Promise<boolean> {
        const [on, provider] = await Promise.all([
            paymentsOn(prisma, organizationId),
            prisma.merchantPaymentProvider.findFirst({
                where: { organizationId, status: "CONNECTED" },
                select: { id: true },
            }),
        ]);
        return on && provider !== null;
    }

    /**
     * A booking the merchant makes for someone — on the phone, at the
     * counter — rather than one the booker makes on the booking page (#384).
     *
     * The same reservation as {@link book}, so it cannot promise what the
     * public page could not: the time must be a real open slot of an ACTIVE
     * service, and the serializable capacity re-count still decides. What
     * differs is who is acting — `booking:write`, the service must belong to
     * the caller's business, there is no IP rate limit, and the history
     * records the person who made it.
     *
     * The booker is someone already in the contacts (`contactId`, whose name
     * and email are used as they stand) or someone new (`bookerEmail`, and
     * optionally a name and phone), who becomes a contact the way a booking
     * page booker does.
     */
    async bookByHand(
        ctx: OrganizationContext,
        serviceId: string,
        dto: {
            startAt: string;
            contactId?: string;
            bookerName?: string;
            bookerEmail?: string;
            bookerPhone?: string;
            idempotencyKey?: string;
            useClassPack?: boolean;
            packPurchaseId?: string;
            staffId?: string;
            paidWith?: PaidWith;
            subscriptionId?: string;
        },
    ): Promise<Booking> {
        authorize(ctx, "booking:write");
        const withPack =
            dto.useClassPack === true ||
            !!dto.packPurchaseId ||
            dto.paidWith === "PACK";
        if (withPack && dto.paidWith && dto.paidWith !== "PACK") {
            throw new BadRequestException({
                message:
                    "A booking is paid one way. Choose a pack or another way, not both.",
                field: "paidWith",
            });
        }
        const withMembership = dto.paidWith === "MEMBERSHIP";
        if (withMembership && !dto.subscriptionId) {
            throw new BadRequestException({
                message: "Choose the membership this class comes out of.",
                field: "subscriptionId",
            });
        }
        if (!withMembership && dto.subscriptionId) {
            throw new BadRequestException({
                message:
                    "A membership pays only a booking paid with a membership.",
                field: "subscriptionId",
            });
        }
        // Spending someone's prepaid classes is its own power (ADR-007) —
        // a pack's, or a membership's month (U3).
        if (withPack) authorize(ctx, "pack:write");
        if (withMembership) authorize(ctx, "subscription:write");

        const { service, rules } = await this.loadBookableService(serviceId);
        if (service.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Service not found");
        }

        const startAt = new Date(dto.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const staffing = await this.staffing(service);
        if (
            !staffing.perPerson &&
            !isValidSlotStart(
                this.toAvailabilityService(service),
                rules,
                startAt,
            )
        ) {
            throw new BadRequestException(
                "That time is not an open slot for this service",
            );
        }
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );

        let booker: BookInput;
        if (dto.contactId) {
            const contact = await prisma.contact.findUnique({
                where: { id: dto.contactId },
            });
            if (contact?.organizationId !== ctx.organizationId) {
                throw new NotFoundException("Contact not found");
            }
            const name = [contact.firstName, contact.lastName]
                .filter(Boolean)
                .join(" ")
                .trim();
            booker = {
                startAt: dto.startAt,
                bookerEmail: contact.email,
                bookerName: name || undefined,
                bookerPhone: contact.phone ?? undefined,
            };
        } else if (dto.bookerEmail) {
            booker = {
                startAt: dto.startAt,
                bookerEmail: dto.bookerEmail,
                // A field left blank is not given, rather than "".
                bookerName: dto.bookerName?.trim() ? dto.bookerName : undefined,
                bookerPhone: dto.bookerPhone?.trim()
                    ? dto.bookerPhone
                    : undefined,
            };
        } else {
            throw new BadRequestException({
                message: "Choose someone from your contacts, or give an email.",
                field: "bookerEmail",
            });
        }

        if (dto.idempotencyKey) {
            const existing = await prisma.booking.findUnique({
                where: {
                    serviceId_idempotencyKey: {
                        serviceId,
                        idempotencyKey: dto.idempotencyKey,
                    },
                },
            });
            if (existing) return existing;
            booker.idempotencyKey = dto.idempotencyKey;
        }

        const person = await this.resolvePerson(
            service,
            rules,
            staffing,
            startAt,
            dto.staffId,
            "team",
        );
        const paidWith: PaidWith | null = withPack
            ? "PACK"
            : (dto.paidWith ?? null);

        return this.reserve(
            service,
            startAt,
            endAt,
            booker,
            { source: "manual", actorUserId: ctx.userId },
            withPack || withMembership
                ? {
                      inTx: async (tx, booking) => {
                          if (withMembership) {
                              await useMembershipInTx(tx, {
                                  organizationId: ctx.organizationId,
                                  bookingId: booking.id,
                                  contactId: booking.contactId ?? "",
                                  subscriptionId: dto.subscriptionId ?? "",
                                  startAt,
                              });
                              return;
                          }
                          await redeemPackInTx(tx, {
                              organizationId: ctx.organizationId,
                              bookingId: booking.id,
                              // The contact the booking resolved to — a pack
                              // is only ever spent by the person who holds it.
                              contactId: booking.contactId ?? "",
                              serviceId: service.id,
                              startAt,
                              purchaseId: dto.packPurchaseId,
                          });
                      },
                      // It may have been the pack's (or the month's) last
                      // class rather than the slot, so this says only that
                      // something changed.
                      onRace: "That changed while you were booking. Try again.",
                  }
                : undefined,
            {
                ...person,
                paidWith,
                subscriptionId: withMembership
                    ? (dto.subscriptionId ?? null)
                    : null,
            },
        );
    }

    /**
     * The reservation itself, shared by the booking page and a booking made
     * by hand: re-count inside a Serializable transaction, upsert the contact,
     * write the CONFIRMED booking, its first history event and the notify job.
     * See {@link book} for why the in-transaction re-count is the guarantee.
     *
     * `also.inTx` runs on the same transaction after the booking is written —
     * spending a class pack on it, for one — so a refusal there takes the
     * booking back with it, and a booking never exists half-paid. Losing a
     * race then may be about what it touched rather than the slot, so the
     * caller says what to tell the booker (`also.onRace`).
     */
    private async reserve(
        service: Service,
        startAt: Date,
        endAt: Date,
        input: BookInput,
        by: ReserveBy,
        also?: {
            inTx: (
                tx: Prisma.TransactionClient,
                booking: Booking,
            ) => Promise<void>;
            onRace: string;
        },
        person?: ReserveWith,
    ): Promise<Booking> {
        const serviceId = service.id;
        const organizationId = service.organizationId;

        let booked: Booking;
        try {
            booked = await prisma.$transaction(
                async (tx) => {
                    const booking = await this.reserveInTx(
                        tx,
                        service,
                        startAt,
                        endAt,
                        input,
                        by,
                        undefined,
                        person,
                    );
                    if (also) await also.inTx(tx, booking);
                    return booking;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );
        } catch (err) {
            const code = (err as { code?: string }).code;
            // Idempotency race: two concurrent books with the same
            // (serviceId, idempotencyKey). The loser is refused one of three
            // ways — the unique index (P2002), a serialization failure
            // (P2034, both read the slot and its person), or the capacity or
            // person gate once the winner is visible. Whichever, when the
            // key's booking now exists, replay the winner instead of erroring.
            if (
                input.idempotencyKey &&
                (code === "P2002" ||
                    code === "P2034" ||
                    err instanceof ConflictException)
            ) {
                const existing = await this.bookingByKey(serviceId, input);
                if (existing) return existing;
            }
            // Serialization failure — Postgres aborted the loser of a race.
            // On its own, the only thing two bookings contend for is the slot.
            if (code === "P2034") {
                throw new ConflictException(
                    also?.onRace ?? "This slot is fully booked",
                );
            }
            throw err;
        }

        // Instrumentation lives OUTSIDE the try, not merely after the commit.
        // Inside it, a throw from here would fall into the catch above and be
        // re-thrown as if the booking had failed — a committed booking
        // reported to the booker as an error. The catch is for database
        // outcomes only.
        //
        // Safe on every booking: the ledger keeps only the first
        // (deterministic dedupeKey), so there is no "is this their first?"
        // query and no race between two concurrent bookings.
        await this.activation?.firstBookingCreated(organizationId, booked.id);
        return booked;
    }

    /**
     * Write one booking on the caller's transaction: re-count capacity,
     * upsert the contact, create the CONFIRMED booking and its first history
     * event, and queue its notification.
     *
     * Public so a course can book every session in one transaction (ADR-007).
     * The caller owns the transaction and its isolation, and maps its errors.
     */
    async reserveInTx(
        tx: Prisma.TransactionClient,
        service: Service,
        startAt: Date,
        endAt: Date,
        input: BookInput,
        by: ReserveBy,
        course?: { courseId: string; enrollmentId: string },
        person?: ReserveWith,
    ): Promise<Booking> {
        const serviceId = service.id;
        const organizationId = service.organizationId;
        const email = input.bookerEmail.trim().toLowerCase();
        const snapshot = this.buildSnapshot(service, input, startAt, endAt);

        // Authoritative capacity gate — re-counted INSIDE the tx. A
        // one-to-one somebody takes is capacity per person (U3), checked
        // below; everything else counts the service's seats as before.
        if (!(person?.perPerson && person.staffId)) {
            const confirmed = await tx.booking.count({
                where: {
                    serviceId,
                    ...holdsPlace(new Date()),
                    startAt: { lt: endAt },
                    endAt: { gt: startAt },
                },
            });
            // Seats an open course still holds count as taken (ADR-007) —
            // other courses' seats, for a course's own booking: its unsold
            // seats are the ones it is filling.
            const held = await courseSeatsHeld(
                tx,
                serviceId,
                startAt,
                endAt,
                course?.courseId,
            );
            if (confirmed + held >= service.capacity) {
                throw new ConflictException("This slot is fully booked");
            }
        }
        if (person) {
            await this.assertPersonFreeInTx(
                tx,
                person,
                serviceId,
                startAt,
                endAt,
            );
        }

        const contact = await tx.contact.upsert({
            where: {
                organizationId_email: { organizationId, email },
            },
            update: this.contactUpdate(input),
            create: {
                organizationId,
                email,
                firstName: this.splitName(input.bookerName).first ?? null,
                lastName: this.splitName(input.bookerName).last ?? null,
                phone: input.bookerPhone ?? null,
                source: by.source,
            },
        });

        const booking = await tx.booking.create({
            data: {
                organizationId,
                serviceId,
                contactId: contact.id,
                startAt,
                endAt,
                timezone: service.timezone,
                // A pay-now booking holds its place until paid (U19).
                status: person?.holdUntil ? "PENDING" : "CONFIRMED",
                holdExpiresAt: person?.holdUntil ?? null,
                snapshot: snapshot as Prisma.InputJsonValue,
                bookerName: input.bookerName ?? null,
                bookerEmail: email,
                bookerPhone: input.bookerPhone ?? null,
                idempotencyKey: input.idempotencyKey ?? null,
                courseEnrollmentId: course?.enrollmentId ?? null,
                ...(person
                    ? {
                          staffId: person.staffId,
                          paidWith: person.paidWith ?? null,
                          subscriptionId: person.subscriptionId ?? null,
                      }
                    : {}),
            },
        });

        // Where the history starts. No `fromStartAt`: there was no before.
        // The actor is whoever made it by hand; a booker who did it
        // themselves leaves it empty.
        await tx.bookingEvent.create({
            data: {
                bookingId: booking.id,
                organizationId,
                type: BookingEventType.Booked,
                toStartAt: startAt,
                ...(by.actorUserId ? { actorUserId: by.actorUserId } : {}),
            },
            select: { id: true },
        });

        // A course session's booking is not notified: nothing sends these yet,
        // and one enrolment would queue a dead letter per session (ADR-007).
        if (course) return booking;

        // Transactional outbox: a committed booking always has a queued
        // notification job. The handler never landed: the worker dead-letters
        // booking.notify until one is registered (see
        // jobs/job-consumers.spec.ts).
        await tx.job.create({
            data: {
                organizationId,
                type: "booking.notify",
                payload: {
                    bookingId: booking.id,
                    serviceId,
                    contactId: contact.id,
                },
            },
        });

        return booking;
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /**
     * One person, one place at a time (U3): inside the booking transaction,
     * refuse when they already have a confirmed booking overlapping — on any
     * service. The person's row is locked first, so two bookings racing for
     * the same person queue on it and the second sees the first.
     *
     * For a class, the other places in the SAME session (same service, same
     * start) are not a clash — they are the class. `excludeBookingId` is a
     * booking being moved, which is not its own competitor.
     */
    private async assertPersonFreeInTx(
        tx: Prisma.TransactionClient,
        person: ReserveWith,
        serviceId: string,
        startAt: Date,
        endAt: Date,
        excludeBookingId?: string,
    ): Promise<void> {
        if (!person.staffId) return;
        await tx.$queryRaw`SELECT id FROM "StaffMember" WHERE id = ${person.staffId} FOR UPDATE`;
        const clashes = await tx.booking.count({
            where: {
                staffId: person.staffId,
                ...holdsPlace(new Date()),
                startAt: { lt: endAt },
                endAt: { gt: startAt },
                ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
                ...(person.perPerson ? {} : { NOT: { serviceId, startAt } }),
            },
        });
        if (clashes > 0) {
            throw new ConflictException({
                message: `${person.staffName ?? "That person"} is already booked then.`,
                field: "staffId",
            });
        }
    }

    /**
     * Load an ACTIVE, non-deleted bookable service + its rules, or throw
     * (404/410). A service whose organization switched Appointments off is 410
     * like an archived one: the booking would otherwise land behind a module
     * the merchant can no longer open.
     */
    private async loadBookableService(
        serviceId: string,
    ): Promise<{ service: Service; rules: AvailabilityRuleWindow[] }> {
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
            include: { availabilityRules: true },
        });
        if (service?.deletedAt !== null) {
            throw new NotFoundException("Service not found");
        }
        if (service.status !== "ACTIVE") {
            throw new GoneException("This service is not accepting bookings");
        }
        if (!(await appointmentsOpen(service.organizationId))) {
            throw new GoneException(
                "This business isn't taking online bookings right now",
            );
        }
        const { availabilityRules, ...rest } = service;
        return { service: rest, rules: availabilityRules };
    }

    /**
     * What fills a service's time over `[from, to)`: its confirmed bookings,
     * and the seats open courses still hold on their sessions (ADR-007).
     */
    private async busyOverlapping(
        serviceId: string,
        from: Date,
        to: Date,
    ): Promise<Interval[]> {
        const [confirmed, held] = await Promise.all([
            this.confirmedOverlapping(serviceId, from, to),
            courseSeatIntervals(prisma, serviceId, from, to),
        ]);
        return [...confirmed, ...held];
    }

    /**
     * Bookings taking a place over `[from, to)` for a service (for capacity
     * checks): confirmed ones, and pay-now holds still inside their time.
     */
    private async confirmedOverlapping(
        serviceId: string,
        from: Date,
        to: Date,
    ): Promise<Interval[]> {
        return prisma.booking.findMany({
            where: {
                serviceId,
                ...holdsPlace(new Date()),
                startAt: { lt: to },
                endAt: { gt: from },
            },
            select: { startAt: true, endAt: true },
        });
    }

    /** Narrow a Prisma Service to the structural subset the pure module needs. */
    private toAvailabilityService(service: Service): AvailabilityService {
        return {
            durationMinutes: service.durationMinutes,
            bufferBeforeMinutes: service.bufferBeforeMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
            capacity: service.capacity,
            timezone: service.timezone,
        };
    }

    /** The immutable snapshot of Service terms + booker frozen onto a Booking. */
    private buildSnapshot(
        service: Service,
        input: BookInput,
        startAt: Date,
        endAt: Date,
    ): Record<string, unknown> {
        return {
            service: {
                id: service.id,
                name: service.name,
                durationMinutes: service.durationMinutes,
                bufferBeforeMinutes: service.bufferBeforeMinutes,
                bufferAfterMinutes: service.bufferAfterMinutes,
                capacity: service.capacity,
                timezone: service.timezone,
                priceCents: service.priceCents,
                currency: service.currency,
                // Frozen like the rest: a link changed later reaches new
                // bookings, never the ones already made (ADR-007).
                locationType: service.locationType,
                meetingUrl: service.meetingUrl,
            },
            slot: {
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
            },
            booker: {
                name: input.bookerName ?? null,
                email: input.bookerEmail.trim().toLowerCase(),
                phone: input.bookerPhone ?? null,
            },
        };
    }

    /** Contact fields to update on a repeat booking (only supplied values). */
    private contactUpdate(input: BookInput): Prisma.ContactUpdateInput {
        const update: Prisma.ContactUpdateInput = {};
        const { first, last } = this.splitName(input.bookerName);
        if (first !== undefined) update.firstName = first;
        if (last !== undefined) update.lastName = last;
        if (input.bookerPhone !== undefined) update.phone = input.bookerPhone;
        return update;
    }

    /** Split a single "full name" into first / last parts. */
    private splitName(full: string | undefined): {
        first?: string;
        last?: string;
    } {
        if (!full) return {};
        const parts = full.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return {};
        if (parts.length === 1) return { first: parts[0] };
        return { first: parts[0], last: parts.slice(1).join(" ") };
    }

    private parseRange(
        fromISO: string,
        toISO: string,
    ): { from: Date; to: Date } {
        const from = new Date(fromISO);
        const to = new Date(toISO);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new BadRequestException("from/to must be valid ISO instants");
        }
        if (from.getTime() >= to.getTime()) {
            throw new BadRequestException("from must be before to");
        }
        return { from, to };
    }

    private assertValidTimezone(timezone: string): void {
        if (!IANAZone.isValidZone(timezone)) {
            throw new BadRequestException(
                `"${timezone}" is not a valid IANA timezone`,
            );
        }
    }

    private assertRuleWellFormed(rule: AvailabilityRuleDto): void {
        if (rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
            throw new BadRequestException("dayOfWeek must be 0–6");
        }
        if (
            rule.startMinute < 0 ||
            rule.endMinute > 1440 ||
            rule.startMinute >= rule.endMinute
        ) {
            throw new BadRequestException(
                "require 0 <= startMinute < endMinute <= 1440",
            );
        }
    }

    private async requireOwnedService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<Service> {
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
        });
        if (
            service?.organizationId !== ctx.organizationId ||
            service.deletedAt !== null
        ) {
            throw new NotFoundException("Service not found");
        }
        return service;
    }

    private async requireOwnedBooking(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<Booking> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
        });
        if (booking?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Booking not found");
        }
        return booking;
    }

    private async requireOwnedSite(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<void> {
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (site?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Site not found");
        }
    }
}

/**
 * Where a service happens, checked as a pair. An online service needs an
 * https link — it is shown to everyone who books, so nothing that could run
 * script or send them somewhere unencrypted. Going back to in person drops
 * the link rather than leaving a credential lying in the row.
 */
export function resolveLocation(
    locationType: LocationType,
    meetingUrl: string | null,
): { locationType: LocationType; meetingUrl: string | null } {
    if (locationType === "IN_PERSON") {
        return { locationType, meetingUrl: null };
    }
    if (!meetingUrl) {
        throw new BadRequestException({
            message: "An online service needs a meeting link",
            details: { field: "meetingUrl" },
        });
    }
    let parsed: URL;
    try {
        parsed = new URL(meetingUrl);
    } catch {
        throw new BadRequestException({
            message: "That meeting link is not a web address",
            details: { field: "meetingUrl" },
        });
    }
    if (parsed.protocol !== "https:") {
        throw new BadRequestException({
            message: "A meeting link must start with https://",
            details: { field: "meetingUrl" },
        });
    }
    return { locationType, meetingUrl: parsed.toString() };
}

/**
 * What a public booking answers with (ADR-007): the booker's own booking and
 * nothing else — never the row, which carries the organization, the contact
 * and the IP hash. Read from the booking's frozen snapshot, so the first
 * answer and an idempotent replay are the same shape and the same link.
 */
export interface PublicBooking {
    reference: string;
    startAt: string;
    endAt: string;
    serviceName: string;
    online: boolean;
    meetingUrl: string | null;
}

export function toPublicBooking(booking: {
    id: string;
    startAt: Date;
    endAt: Date;
    snapshot: unknown;
    status?: string;
}): PublicBooking {
    const service = (
        booking.snapshot as {
            service?: {
                name?: unknown;
                locationType?: unknown;
                meetingUrl?: unknown;
            };
        } | null
    )?.service;
    const online = service?.locationType === "ONLINE";
    return {
        reference: booking.id,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        serviceName: typeof service?.name === "string" ? service.name : "",
        online,
        // Only a CONFIRMED booking holds a place in the class — a PENDING
        // pay-now hold has not paid yet, and a cancelled booking no longer
        // holds one at all — so only CONFIRMED carries the way in. `outcome`
        // (ATTENDED/NO_SHOW) never touches this: it is set after the class,
        // once the link is no longer needed either way.
        meetingUrl:
            online &&
            booking.status === "CONFIRMED" &&
            typeof service.meetingUrl === "string"
                ? service.meetingUrl
                : null,
    };
}

/** How early before the start the desk may check someone in. */
export const CHECK_IN_EARLY_MS = 60 * 60_000;

/**
 * Why an outcome cannot be said yet, or null when it can: attendance from an
 * hour before the start (someone walking in), a no-show once it has started.
 */
export function outcomeTooEarly(
    outcome: BookingOutcome,
    startAt: Date,
    now: Date,
): string | null {
    const opensAt =
        outcome === "ATTENDED"
            ? startAt.getTime() - CHECK_IN_EARLY_MS
            : startAt.getTime();
    if (now.getTime() >= opensAt) return null;
    return outcome === "ATTENDED"
        ? "Check-in opens an hour before the appointment."
        : "This appointment has not started yet.";
}
