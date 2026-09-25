import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { IANAZone } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ActivationEvents } from "../analytics/activation-events";
import { redeemPackInTx, reversePackInTx } from "../class-packs/redeem-pack";
import { isGstRate } from "../invoices/gst";
import { allows, authorize } from "../organizations/organization-policy";
import { isValidSlotStart } from "./availability";
import type { PersonDiary } from "./booking-calendar";
import { groupDiaries } from "./booking-calendar";
import { BookingEventType } from "./booking-event-type";
import {
    holdsPlace,
    isExpiredHold,
    lockBookingInTx,
    releaseHoldInTx,
} from "./booking-hold";
import { isLateCancel, loadBookingRules } from "./booking-rules";
import type { AvailableSlot } from "./booking-slots";
import {
    loadStaffing,
    openSlots,
    parseRange,
    resolvePerson,
    toAvailabilityService,
} from "./booking-slots";
import { courseSeatsHeld } from "./course-seats";
import type {
    AvailabilityRuleDto,
    BookingOutcome,
    CreateServiceDto,
    LocationType,
    PaidWith,
    UpdateServiceDto,
} from "./dto";
import type { BookInput, ReserveBy, ReserveWith } from "./reservation";
import {
    assertPersonFreeInTx,
    loadBookableService,
    reserve,
    reserveInTx,
} from "./reservation";
import { businessZone } from "./staff-availability";
import { useMembershipInTx } from "./use-membership";

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

/**
 * Bookable Services, availability rules and the merchant's side of bookings
 * (S4-002). The customer's side — the booking page and the website's
 * services list — is {@link PublicBookingsService}; both write bookings
 * through the same reservation (`reservation.ts`).
 *
 * Everything here is tenant-scoped by `ctx.organizationId` (proven by
 * `OrganizationGuard`, never a client value) and gated by the central policy:
 * `service:read`/`service:write`, `booking:read`/`booking:write`. Cross-tenant
 * or missing ids surface as 404 (never 403), mirroring the other modules, so a
 * caller can't probe another org's resources.
 */
@Injectable()
export class BookingsService {
    constructor(@Optional() private readonly activation?: ActivationEvents) {}

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
        const { from, to } = parseRange(fromISO, toISO);
        const rules = await prisma.availabilityRule.findMany({
            where: { serviceId },
        });
        return openSlots(service, rules, from, to, staffId);
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
     * {@link PublicBookingsService.book} does and for the same reason: a reschedule and a public
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
        const availService = toAvailabilityService(service);
        // A booking with a person moves within that person's diary (U3):
        // one-to-one, to one of their free starts; a class, on the class's
        // own grid with its instructor checked for a clash.
        const staffing = booking.staffId
            ? await loadStaffing(service)
            : { people: [], perPerson: false, zone: null };
        let person: ReserveWith = { staffId: null, perPerson: false };
        if (booking.staffId && staffing.perPerson) {
            person = await resolvePerson(
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
                    await assertPersonFreeInTx(
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

    /**
     * A booking the merchant makes for someone — on the phone, at the
     * counter — rather than one the booker makes on the booking page (#384).
     *
     * The same reservation as {@link PublicBookingsService.book}, so it cannot promise what the
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

        const { service, rules } = await loadBookableService(serviceId);
        if (service.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Service not found");
        }

        const startAt = new Date(dto.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const staffing = await loadStaffing(service);
        if (
            !staffing.perPerson &&
            !isValidSlotStart(toAvailabilityService(service), rules, startAt)
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

        const person = await resolvePerson(
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

        return reserve(
            this.activation,
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
        return reserveInTx(
            tx,
            service,
            startAt,
            endAt,
            input,
            by,
            course,
            person,
        );
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
