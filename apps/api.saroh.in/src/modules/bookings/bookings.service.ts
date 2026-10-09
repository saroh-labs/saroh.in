import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { IANAZone } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ActivationEvents } from "../analytics/activation-events";
import { assertPlanTakesOnlinePayment } from "../billing/online-payments-plan";
import { redeemPackInTx } from "../class-packs/redeem-pack";
import { assertBusinessDetails } from "../invoices/business-details";
import { isGstRate } from "../invoices/gst";
import { allows } from "../organizations/organization-policy";
import { PaymentsService } from "../payments/payments.service";
import { OPENS_CHECKOUT } from "../payments/public-key";
import { isValidSlotStart } from "./availability";
import {
    CANT_USE_PACKS,
    mayTakeDeskPayment,
    requireBookingPower,
} from "./booking-access";
import type { PersonDiary } from "./booking-calendar";
import { groupDiaries } from "./booking-calendar";
import type { CancelledBooking } from "./booking-cancel";
import { cancelFoundBooking, sendCancelRefund } from "./booking-cancel";
import type { DeskPayment } from "./booking-desk-pay";
import { takeDeskPaymentInTx } from "./booking-desk-pay";
import { isExpiredHold } from "./booking-hold";
import type { WithoutIntakeNote } from "./booking-intake";
import { intakeNoteFor } from "./booking-intake";
import type { BookingMoney } from "./booking-money";
import { bookingMoney } from "./booking-money";
import { moveFoundBooking } from "./booking-move";
import { lockVisitOrderInTx, writeOutcomeInTx } from "./booking-outcome";
import { bookingPayLinkInTx } from "./booking-pay-link";
import { loadBookingRules } from "./booking-rules";
import type { AvailableSlot } from "./booking-slots";
import {
    loadStaffing,
    openSlots,
    parseRange,
    refuseIfClosed,
    resolvePerson,
    toAvailabilityService,
} from "./booking-slots";
import { assertDepositOnPlan } from "./deposit-plan";
import type { TakeDeskPaymentDto } from "./desk-pay.dto";
import {
    BOOKING_PAPER,
    BOOKING_PAPER_PAYMENTS,
    BOOKING_PAPER_SELECT,
} from "./desk-take";
import type {
    AvailabilityRuleDto,
    BookingOutcome,
    CreateServiceDto,
    LocationType,
    PaidWith,
    UpdateServiceDto,
} from "./dto";
import { openingFor, refuseOutsideOpening } from "./opening-hours";
import {
    assertOwnBooking,
    bookingStaffFor,
    ownBookingsWhere,
    ownDiaryOf,
} from "./own-diary";
import type { BookInput, ReserveBy, ReserveWith } from "./reservation";
import { loadBookableService, reserve, reserveInTx } from "./reservation";
import type { ServiceView } from "./service-fields";
import { assertDepositPriced, toServiceView } from "./service-fields";
import { businessZone } from "./staff-availability";
import type { TreatmentView } from "./treatment-view";
import { treatmentOf, treatmentOrderSelect } from "./treatment-view";
import { useMembershipInTx } from "./use-membership";
import type { BookVisitInput } from "./visits";
import {
    assertTreatmentSellable,
    bookVisit,
    isTreatment,
    startTreatmentInTx,
    treatmentEmail,
    treatmentStorefront,
} from "./visits";

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
    // The treatment it is a visit of (E10): read for `treatment`, then
    // dropped, so the answer carries the view and never the order row.
    order: { select: treatmentOrderSelect },
} satisfies Prisma.BookingInclude;

export type BookingDetail = Prisma.BookingGetPayload<{
    include: typeof bookingDetailInclude;
}>;

/**
 * One booking as staff read it: with the booker's intake note (E7) only for
 * someone who may see sensitive Needs attention (`intakeNoteFor`), and its
 * money worked out on the server (E8).
 */
export type BookingDetailView = (
    | Omit<BookingDetail, "order">
    | WithoutIntakeNote<Omit<BookingDetail, "order">>
) & { money: BookingMoney; treatment: TreatmentView | null };

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
            visits: true,
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
    // A visit of a treatment (E10): "Visit 2 of 3" and its order.
    visitNumber: true,
    order: { select: treatmentOrderSelect },
    // Taking payment at the desk (P2): what it was booked at, what pays for
    // it, and its own paper with the payments on it.
    snapshot: true,
    orderId: true,
    courseEnrollmentId: true,
    invoices: {
        where: BOOKING_PAPER,
        select: {
            ...BOOKING_PAPER_SELECT,
            paymentIntents: BOOKING_PAPER_PAYMENTS,
        },
    },
} satisfies Prisma.BookingSelect;

export type {
    CancelledBooking,
    CancelMoney,
    RefundStatus,
} from "./booking-cancel";

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
    private readonly logger = new Logger(BookingsService.name);

    constructor(
        @Optional() private readonly activation?: ActivationEvents,
        // Sends a cancel's refund after it commits (E8). Optional so the
        // specs that never refund need not build one.
        @Optional() private readonly payments?: PaymentsService,
    ) {}

    // ── Service CRUD ───────────────────────────────────────────────────────

    /**
     * Create a bookable Service for the org. Authorizes `service:write`,
     * validates the IANA timezone and (if given) that `siteId` belongs to the
     * org. New services are ACTIVE and immediately bookable.
     */
    async createService(
        ctx: OrganizationContext,
        dto: CreateServiceDto,
    ): Promise<ServiceView> {
        requireBookingPower(ctx, "service:write");

        this.assertValidTimezone(dto.timezone);
        if (dto.siteId) {
            await this.requireOwnedSite(ctx, dto.siteId);
        }
        const location = resolveLocation(
            dto.locationType ?? "IN_PERSON",
            dto.meetingUrl ?? null,
        );
        const depositMode = dto.depositMode ?? "NONE";
        assertDepositPriced(dto.priceCents ?? null, depositMode);
        // A deposit is taken online, so it comes with a plan that takes
        // money online — asked here, where it is set (`deposit-plan.ts`).
        await assertDepositOnPlan(ctx.organizationId, depositMode);
        // A treatment needs a storefront to sell from (E10, DEC-050).
        await assertTreatmentSellable(
            { organizationId: ctx.organizationId, siteId: dto.siteId ?? null },
            {
                visits: dto.visits ?? 1,
                capacity: dto.capacity ?? 1,
                wasTreatment: false,
            },
        );

        const created = await prisma.service.create({
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
                visits: dto.visits ?? 1,
                depositMode,
                showOnBookingPage: dto.showOnBookingPage ?? true,
            },
        });
        return toServiceView(created);
    }

    /** List the org's services, newest first (excludes soft-deleted). `service:read`. */
    async listServices(ctx: OrganizationContext): Promise<ServiceView[]> {
        requireBookingPower(ctx, "service:read");
        const services = await prisma.service.findMany({
            where: { organizationId: ctx.organizationId, deletedAt: null },
            orderBy: { createdAt: "desc" },
        });
        return services.map(toServiceView);
    }

    /** Get one owned service. `service:read`; cross-tenant/missing → 404. */
    async getService(
        ctx: OrganizationContext,
        serviceId: string,
    ): Promise<ServiceView> {
        requireBookingPower(ctx, "service:read");
        return toServiceView(await this.requireOwnedService(ctx, serviceId));
    }

    /**
     * Update a Service. Authorizes `service:write`, loads the org's own service
     * (404 otherwise), re-validates a new timezone. Only supplied fields change.
     */
    async updateService(
        ctx: OrganizationContext,
        serviceId: string,
        dto: UpdateServiceDto,
    ): Promise<ServiceView> {
        requireBookingPower(ctx, "service:write");

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
        if (dto.visits !== undefined || dto.capacity !== undefined) {
            // A treatment needs a storefront to sell from (E10, DEC-050).
            await assertTreatmentSellable(service, {
                visits: dto.visits ?? service.visits,
                capacity: dto.capacity ?? service.capacity,
                wasTreatment: isTreatment(service),
            });
        }
        if (dto.visits !== undefined) data.visits = dto.visits;
        if (dto.showOnBookingPage !== undefined) {
            data.showOnBookingPage = dto.showOnBookingPage;
        }
        if (dto.depositMode !== undefined || dto.priceCents !== undefined) {
            // Checked as the service will be: a price cleared under a deposit
            // is refused as surely as a deposit set on no price. (A null
            // price in the body clears it, so `??` would read it wrongly.)
            let priceAfter = service.priceCents;
            if (dto.priceCents !== undefined) priceAfter = dto.priceCents;
            assertDepositPriced(
                priceAfter,
                dto.depositMode ?? service.depositMode,
            );
            // Setting a new deposit needs online payments on the plan;
            // NONE, or the deposit it already has, never asks.
            await assertDepositOnPlan(
                ctx.organizationId,
                dto.depositMode,
                service.depositMode,
            );
            if (dto.depositMode !== undefined) {
                data.depositMode = dto.depositMode;
            }
        }

        return toServiceView(
            await prisma.service.update({ where: { id: service.id }, data }),
        );
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
        requireBookingPower(ctx, "service:write");

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
        requireBookingPower(ctx, "service:read");
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
        requireBookingPower(ctx, "service:write");
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
        requireBookingPower(ctx, "service:write");
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
        requireBookingPower(ctx, "service:write");
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
        requireBookingPower(ctx, "service:read");
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
        requireBookingPower(ctx, "booking:read");
        if (serviceId) {
            // Ensure the service is owned before filtering by it (404 otherwise).
            await this.requireOwnedService(ctx, serviceId);
        }
        // Calendar only reads its own diary (#868).
        const own = await ownDiaryOf(prisma, ctx);
        return prisma.booking.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(serviceId ? { serviceId } : {}),
                ...ownBookingsWhere(own),
            },
            // A list never carries the booker's note (E7): it is sensitive,
            // and read one booking at a time behind its gate.
            omit: { intakeNote: true },
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
     * Prices only with `payment:read`, or to someone who may take payment
     * at the desk (DEC-020, DEC-098): a Member sees the diary and the people
     * on it, not the money — only whether there is something to take.
     */
    async calendarBookings(
        ctx: OrganizationContext,
        query: { from: string; to: string; staffId?: string },
    ): Promise<BookingsCalendar> {
        requireBookingPower(ctx, "booking:read");
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
        // Calendar only reads its own diary (#868): their column and the
        // bookings that are theirs; another person's column is a 404.
        const own = await ownDiaryOf(prisma, ctx);
        if (own && query.staffId && query.staffId !== own.staffId) {
            throw new NotFoundException("Staff member not found");
        }
        const staffId = own ? (own.staffId ?? undefined) : query.staffId;
        const now = new Date();
        const [people, rows, zone] = await Promise.all([
            own && !own.staffId
                ? Promise.resolve([])
                : prisma.staffMember.findMany({
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
                    ...(own
                        ? ownBookingsWhere(own)
                        : staffId
                          ? { staffId }
                          : {}),
                },
                orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
                select: diarySelect,
            }),
            businessZone(prisma, organizationId),
        ]);
        if (staffId && people.length === 0 && !own) {
            throw new NotFoundException("Staff member not found");
        }
        // Whoever may take payment at the desk sees what they take (DEC-098):
        // the figure follows the permission, not the role's name.
        const money = allows(ctx, "payment:read") || mayTakeDeskPayment(ctx);
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
     * already-cancelled booking is returned unchanged, and refunds nothing.
     *
     * The business's free-cancellation rule decides what happens to what was
     * paid (U3, E8). The deadline is the one fixed when the booking was made
     * (`freeCancelUntil`, DEC-051), so a move never changes it. Cancelled in
     * time, a pack's class goes back, and money paid online for it — a
     * deposit or the whole price — is refunded once, if the business's
     * refund policy says so (E30, DEC-058; on unless it was turned off).
     * Inside the window the class stays used (a membership's counts against
     * its month), the money is kept, and the booking says it was cancelled
     * late. With no rule, every cancel is in time — as before the rules
     * existed. A refund is never more than what is left of what was
     * received (`reserveBookingRefundInTx`).
     *
     * `returnCredit` is the business cancelling rather than the customer —
     * a whole class called off (U15). The rule protects the business from a
     * customer dropping out late; it never takes a class from someone whose
     * class was cancelled on them. It hands back money kept by a late cancel
     * only for a caller who also holds `payment:manage`; anyone else's
     * cancel keeps it, and the answer says so. The same by-hand refund
     * hands back money an in-time cancel keeps under a no-refund policy.
     *
     * The refund is two-phase (DEC-026): under the locks (intent → invoice
     * → booking, the documented order) the booking is re-read — already
     * cancelled, nothing more happens — then cancelled with one PENDING
     * refund keyed per booking, in one transaction. The provider is called
     * after commit with the row's id as Saroh's reference; a definite no
     * marks it FAILED, no answer leaves it PENDING with the money held, and
     * the credit note follows the provider's confirmation (DEC-023). So a
     * staff cancel and a customer cancel racing each other make one cancel
     * and one refund.
     *
     * A pay-now hold (PENDING) is released rather than cancelled (#508): its
     * draft invoice is voided with it, as when its time runs out.
     */
    async cancelBooking(
        ctx: OrganizationContext,
        bookingId: string,
        now: Date = new Date(),
        options: { returnCredit?: boolean; closesClass?: boolean } = {},
    ): Promise<CancelledBooking> {
        requireBookingPower(ctx, "booking:write");
        const found = await this.requireOwnedBooking(ctx, bookingId);
        return cancelFoundBooking(
            found,
            {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                mayRefundByHand: allows(ctx, "payment:manage"),
            },
            now,
            options,
            (refundId) =>
                sendCancelRefund(
                    this.payments,
                    this.logger,
                    ctx.organizationId,
                    refundId,
                ),
        );
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
        requireBookingPower(ctx, "booking:write");
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

        // A visit of a treatment (E9) takes its order's lock first, and its
        // last visit attended fulfils the order (B14, `booking-outcome.ts`).
        return prisma.$transaction(async (tx) => {
            await lockVisitOrderInTx(tx, booking.orderId);
            return writeOutcomeInTx(tx, ctx, booking, outcome);
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
    ): Promise<BookingDetailView> {
        requireBookingPower(ctx, "booking:read");
        await this.requireOwnedBooking(ctx, bookingId, "read");
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: bookingId },
            include: bookingDetailInclude,
        });
        // What was paid at booking, what is due and any refund (E8), with
        // the business's refund policy the screen states (E30).
        const rules = await loadBookingRules(prisma, ctx.organizationId);
        const money = await bookingMoney(prisma, booking, rules);
        // A visit of a treatment (E10): which visit, and the next to book.
        const { order, ...rest } = booking;
        const treatment = treatmentOf({ ...rest, order });
        // The booker's note (E7) only behind C1's sensitive gate.
        return { ...intakeNoteFor(ctx, rest), money, treatment };
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
        requireBookingPower(ctx, "booking:write");
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
        return moveFoundBooking(
            booking,
            service,
            startAt,
            { organizationId: ctx.organizationId, userId: ctx.userId },
            { audience: "team" },
        );
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
        requireBookingPower(ctx, "booking:write");
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
        if (withPack) requireBookingPower(ctx, "pack:sell", CANT_USE_PACKS);
        if (withMembership) requireBookingPower(ctx, "subscription:write");

        const { service, rules } = await loadBookableService(serviceId);
        if (service.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Service not found");
        }
        // A treatment is sold as one order (E9, DEC-050), paid on it: never
        // with a pack or a membership, and never without a storefront.
        const treatment = isTreatment(service);
        if (treatment && (withPack || withMembership)) {
            throw new BadRequestException({
                message:
                    "A treatment is paid for on its order, not with a pack or a membership.",
                field: "paidWith",
            });
        }
        const treatmentStore = treatment
            ? await treatmentStorefront(prisma, service)
            : null;
        if (treatment && !treatmentStore) {
            throw new ConflictException({
                message: "Treatments are sold as orders. Add a location first.",
                details: { reason: "no-storefront" },
            });
        }

        const startAt = new Date(dto.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );
        await refuseIfClosed(ctx.organizationId, startAt, endAt);
        // By hand it is in person unless the service is online (DEC-087).
        const opening = await openingFor(service, undefined);
        refuseOutsideOpening(opening, { startAt, endAt });
        const staffing = await loadStaffing(service);
        if (
            !staffing.perPerson &&
            !isValidSlotStart(toAvailabilityService(service), rules, startAt)
        ) {
            throw new BadRequestException(
                "That time is not an open slot for this service",
            );
        }

        let booker: BookInput;
        if (dto.contactId) {
            let contact = await prisma.contact.findUnique({
                where: { id: dto.contactId },
            });
            // A page loaded before a merge can still name the merged-away
            // contact (C9): book the survivor it points at. The booking is
            // then made by the survivor's email, never the tombstone's
            // placeholder.
            if (
                contact?.mergedIntoId &&
                contact.organizationId === ctx.organizationId
            ) {
                contact = await prisma.contact.findUnique({
                    where: { id: contact.mergedIntoId },
                });
            }
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
            // An email that is already someone's picks that someone (E4),
            // as they stand: booking them never renames them or forks a
            // second contact.
            const known = await prisma.contact.findUnique({
                where: {
                    organizationId_email: {
                        organizationId: ctx.organizationId,
                        email: dto.bookerEmail.trim().toLowerCase(),
                    },
                },
            });
            booker = known
                ? {
                      startAt: dto.startAt,
                      bookerEmail: known.email,
                      bookerName:
                          [known.firstName, known.lastName]
                              .filter(Boolean)
                              .join(" ")
                              .trim() || undefined,
                      bookerPhone: known.phone ?? undefined,
                  }
                : {
                      startAt: dto.startAt,
                      bookerEmail: dto.bookerEmail,
                      // A field left blank is not given, rather than "".
                      bookerName: dto.bookerName?.trim()
                          ? dto.bookerName
                          : undefined,
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

        // Its bill goes to an email (DEC-050): a contact with none is asked
        // for one.
        if (treatmentStore) treatmentEmail(booker.bookerEmail);

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
            // Calendar only books into its own diary (#868).
            await bookingStaffFor(prisma, ctx, dto.staffId),
            "team",
            undefined,
            opening,
        );
        const paidWith: PaidWith | null = withPack
            ? "PACK"
            : (dto.paidWith ?? null);

        if (treatmentStore) {
            // The treatment's order, with this booking its visit 1.
            const booked = await reserve(
                this.activation,
                service,
                startAt,
                endAt,
                booker,
                { source: "manual", actorUserId: ctx.userId },
                {
                    inTx: async (tx, booking) => {
                        await startTreatmentInTx(tx, {
                            service,
                            booking,
                            storeId: treatmentStore.id,
                        });
                    },
                    onRace: "That changed while you were booking. Try again.",
                    // The race lost may be another order taking the
                    // business's next order number (P3): tried again, it
                    // books, or says what really changed.
                    retryOnce: true,
                },
                { ...person, paidWith },
            );
            return prisma.booking.findUniqueOrThrow({
                where: { id: booked.id },
            });
        }

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
     * Book visit `n` of a treatment (E9, DEC-050) — see {@link bookVisit}.
     * `booking:write`; another business's order is a 404.
     */
    async bookVisit(
        ctx: OrganizationContext,
        orderId: string,
        dto: BookVisitInput,
    ): Promise<Booking> {
        requireBookingPower(ctx, "booking:write");
        // Calendar only books a visit into its own diary (#868).
        const staffId = await bookingStaffFor(prisma, ctx, dto.staffId);
        return bookVisit(ctx, orderId, {
            ...dto,
            ...(staffId ? { staffId } : {}),
        });
    }

    /**
     * "Send a pay link" for a booking (E4): issue its invoice and hand back
     * the link to copy (`booking-pay-link.ts`). It issues an invoice, so it
     * needs `invoice:write` as well as `booking:write`. Another business's
     * booking is a 404; a cancelled, unpriced or already paid one a 409.
     */
    async payLink(
        ctx: OrganizationContext,
        bookingId: string,
        now: Date = new Date(),
    ): Promise<{ token: string }> {
        requireBookingPower(ctx, "booking:write");
        requireBookingPower(
            ctx,
            "invoice:write",
            "Your role can't send pay links, because it can't issue invoices.",
        );
        await this.requireOwnedBooking(ctx, bookingId);
        // Only a connection that can open the checkout window counts: a
        // Razorpay one still missing its public key id would make a link
        // the customer can't pay (DEC-054).
        const connected = await prisma.merchantPaymentProvider.count({
            where: {
                organizationId: ctx.organizationId,
                status: "CONNECTED",
                ...OPENS_CHECKOUT,
            },
        });
        if (connected === 0) {
            throw new ConflictException(
                "Connect a payment provider to take payment online.",
            );
        }
        // A pay link charges online: the plan's too (403 MODULE_LOCKED).
        await assertPlanTakesOnlinePayment(ctx.organizationId);
        // The link issues the booking's invoice: the business details
        // first (DEC-068).
        await assertBusinessDetails(prisma, ctx.organizationId);
        const { token } = await prisma.$transaction((tx) =>
            bookingPayLinkInTx(tx, {
                organizationId: ctx.organizationId,
                bookingId,
                actorUserId: ctx.userId,
                now,
            }),
        );
        return { token };
    }

    /**
     * "Take ₹X" at the desk (round-2 P2): record what the desk took, by
     * cash, UPI at the counter or card, on the booking's invoice — made or
     * found here (`booking-desk-pay.ts`). The same pair as a pay link
     * (permission matrix): the booking is the desk's, the invoice is paper.
     */
    async takeDeskPayment(
        ctx: OrganizationContext,
        bookingId: string,
        dto: TakeDeskPaymentDto,
        now: Date = new Date(),
    ): Promise<DeskPayment> {
        requireBookingPower(ctx, "booking:write");
        requireBookingPower(
            ctx,
            "invoice:write",
            "Your role can't take payment for bookings, because it can't issue invoices.",
        );
        await this.requireOwnedBooking(ctx, bookingId);
        return prisma.$transaction((tx) =>
            takeDeskPaymentInTx(tx, {
                organizationId: ctx.organizationId,
                bookingId,
                actorUserId: ctx.userId,
                method: dto.method,
                amountCents: dto.amountCents,
                receivedCents: dto.receivedCents ?? null,
                now,
            }),
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

    /**
     * The business's booking, or a 404. For Calendar only (#868), also one
     * on their own diary: someone else's is a 404 to read and a 403 to
     * change (`own-diary.ts`).
     */
    private async requireOwnedBooking(
        ctx: OrganizationContext,
        bookingId: string,
        mode: "read" | "write" = "write",
    ): Promise<Booking> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
        });
        if (booking?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Booking not found");
        }
        await assertOwnBooking(prisma, ctx, booking, mode);
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
 * Where a service happens, checked as a pair. An online service — or one the
 * customer may take online (EITHER) — needs an https link: it is shown to
 * everyone who books online, so nothing that could run script or send them
 * somewhere unencrypted. Going back to in person drops the link rather than
 * leaving a credential lying in the row.
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
            message:
                locationType === "EITHER"
                    ? "A service people can take online needs a meeting link"
                    : "An online service needs a meeting link",
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
        ? "Check-in opens an hour before the booking."
        : "This booking has not started yet.";
}
