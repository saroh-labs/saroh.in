import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    cancelFoundBooking,
    sendCancelRefund,
} from "../bookings/booking-cancel";
import { moveFoundBooking } from "../bookings/booking-move";
import type { BookingRulesValue } from "../bookings/booking-rules";
import { isLateCancel, loadBookingRules } from "../bookings/booking-rules";
import type { BookingLocationType } from "../bookings/dto";
import { bookVisit, refuseClosedTreatment } from "../bookings/visits";
import { PaymentsService } from "../payments/payments.service";
import type { Ctx, Row } from "./account-booking-rules";
import {
    businessName,
    cancelTerms,
    first,
    freeTimes,
    ownBookingsWhere,
    refuseOutsideWindow,
    refuseUnchangeable,
    ROW_SELECT,
    TIME_WENT,
} from "./account-booking-rules";
import type {
    AccountBookingRow,
    AccountBookings,
    AccountCancelResult,
    AccountMoveResult,
    AccountTimes,
    AccountTreatment,
} from "./account-bookings-view";
import { bookingRowView, cancelResultView } from "./account-bookings-view";
import { bookableTreatment, readTreatments } from "./account-treatments";

/**
 * The account's Bookings (round-2 plan A, A6; ADR-011): Coming up, Past and
 * Cancelled, a treatment's visits, and the customer moving and cancelling
 * their own bookings.
 *
 * Every read and write finds the booking by its id **and** the signed-in
 * customer's business and contact: another customer's booking, even in the
 * same business, is a 404. Everything leaves through
 * `account-bookings-view.ts`.
 *
 * A move and a cancel go through the same writes as the team's
 * (`bookings/booking-move.ts`, `booking-cancel.ts`) with no actor, so the
 * workspace's history reads "by the customer". The customer's own rules sit
 * on top:
 * - Nothing that has started, a course's session, or a hold still being
 *   paid for is changed here.
 * - Inside the free-cancel window a move is refused ("Call ‹business› to
 *   change this"); a cancel is taken, and is late (DEC-051). The deadline is
 *   the one fixed at booking, so a move never widens it.
 * - A move lands only on a time the booking page would offer them: the
 *   business's window rules, and the same person for a one-to-one.
 * - A visit of a treatment follows E9: its order is locked, a closed
 *   treatment moves no more, and cancelling it never refunds on its own.
 */

export { ownBookingsWhere, TIME_WENT } from "./account-booking-rules";

/** How many bookings each list shows (the design's six for the old ones). */
export const COMING_UP_ROWS = 50;
export const PAST_ROWS = 6;
export const CANCELLED_ROWS = 6;

@Injectable()
export class AccountBookingsService {
    private readonly logger = new Logger(AccountBookingsService.name);

    constructor(
        // Sends a cancel's refund after it commits (E8). Optional so a spec
        // that never refunds need not build one.
        @Optional() private readonly payments?: PaymentsService,
    ) {}

    // ---- Reads ------------------------------------------------------------

    /** Coming up, Past, Cancelled, and the customer's treatments. */
    async list(ctx: Ctx, now: Date = new Date()): Promise<AccountBookings> {
        const own = ownBookingsWhere(ctx);
        const [rules, comingUp, past, cancelled, treatments] =
            await Promise.all([
                loadBookingRules(prisma, ctx.organizationId),
                prisma.booking.findMany({
                    where: {
                        ...own,
                        status: "CONFIRMED",
                        endAt: { gt: now },
                    },
                    orderBy: [{ startAt: "asc" }, { id: "asc" }],
                    take: COMING_UP_ROWS,
                    select: ROW_SELECT,
                }),
                prisma.booking.findMany({
                    where: {
                        ...own,
                        status: "CONFIRMED",
                        endAt: { lte: now },
                    },
                    orderBy: [{ startAt: "desc" }, { id: "desc" }],
                    take: PAST_ROWS,
                    select: ROW_SELECT,
                }),
                prisma.booking.findMany({
                    where: {
                        ...own,
                        status: "CANCELLED",
                        // A pay-now hold let go was never a booking: it
                        // keeps its expiry, a real cancel has none.
                        holdExpiresAt: null,
                    },
                    orderBy: [{ startAt: "desc" }, { id: "desc" }],
                    take: CANCELLED_ROWS,
                    select: ROW_SELECT,
                }),
                readTreatments(ctx, now),
            ]);
        const upcoming = await Promise.all(
            comingUp.map((row) => this.rowWithActions(ctx, row, rules, now)),
        );
        return {
            comingUp: upcoming,
            past: past.map((row) => bookingRowView(row)),
            cancelled: cancelled.map((row) => bookingRowView(row)),
            treatments,
        };
    }

    /** One of the customer's bookings, with what they can do with it. */
    async one(
        ctx: Ctx,
        ref: string,
        now: Date = new Date(),
    ): Promise<AccountBookingRow> {
        const row = await this.ownRow(ctx, ref);
        const rules = await loadBookingRules(prisma, ctx.organizationId);
        return this.rowWithActions(ctx, row, rules, now);
    }

    /**
     * Free times to move a one-to-one to: over the next two weeks, with the
     * same person, inside the business's window rules. Refused as the move
     * itself would be.
     */
    async moveTimes(
        ctx: Ctx,
        ref: string,
        now: Date = new Date(),
    ): Promise<AccountTimes> {
        const row = await this.ownRow(ctx, ref);
        const { booking, service, rules } = await this.movable(ctx, row, now);
        const times = await freeTimes(
            service,
            rules,
            now,
            booking.staffId ?? undefined,
            booking.locationType as BookingLocationType | null,
        );
        return {
            service: service.name,
            staff: row.staff?.name ?? null,
            timezone: booking.timezone,
            times: times.filter((t) => t !== booking.startAt.toISOString()),
        };
    }

    // ---- Move and cancel -------------------------------------------------

    /**
     * Move the customer's booking to `startAt`: a one-to-one to a free time
     * with the same person, a class to another of its sessions (its credit
     * moves with it). The free-cancel deadline stays the one fixed at
     * booking. The history reads "by the customer", and the business is
     * told (A14's `booking.notify`): `told`.
     */
    async move(
        ctx: Ctx,
        ref: string,
        startAtIso: string,
        now: Date = new Date(),
    ): Promise<AccountMoveResult> {
        const row = await this.ownRow(ctx, ref);
        const { booking, service, rules } = await this.movable(ctx, row, now);
        const startAt = new Date(startAtIso);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        if (startAt.getTime() === booking.startAt.getTime()) {
            return {
                ...(await this.rowWithActions(ctx, row, rules, now)),
                told: false,
            };
        }
        refuseOutsideWindow(startAt, now, rules);
        await moveFoundBooking(
            booking,
            service,
            startAt,
            { organizationId: ctx.organizationId, userId: null },
            {
                audience: "public",
                slotTaken: TIME_WENT,
                refuseClosedTreatment: true,
            },
        );
        return { ...(await this.one(ctx, ref, now)), told: true };
    }

    /**
     * Cancel the customer's booking. In time, a pack's class goes back and
     * money paid online is refunded once, as the business's policy says
     * (E30, DEC-058), never beyond what was received; late, both are kept
     * (ADR-008). A visit of a treatment never refunds on its own. The
     * history reads "by the customer". Cancelling one already cancelled
     * changes nothing.
     */
    async cancel(
        ctx: Ctx,
        ref: string,
        now: Date = new Date(),
    ): Promise<AccountCancelResult> {
        const row = await this.ownRow(ctx, ref);
        if (row.status !== "CANCELLED") {
            refuseUnchangeable(row, now);
        }
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: row.id },
        });
        const done = await cancelFoundBooking(
            booking,
            {
                organizationId: ctx.organizationId,
                userId: null,
                // A customer never hands back money the rules keep.
                mayRefundByHand: false,
            },
            now,
            {},
            (refundId) =>
                sendCancelRefund(
                    this.payments,
                    this.logger,
                    ctx.organizationId,
                    refundId,
                ),
        );
        const after = await this.ownRow(ctx, ref);
        return cancelResultView(bookingRowView(after), done.money, done.told);
    }

    // ---- A treatment's next visit (E9, E10) ------------------------------

    /** Free times for a treatment's next visit, with whoever took the last. */
    async visitTimes(
        ctx: Ctx,
        orderRef: string,
        now: Date = new Date(),
    ): Promise<AccountTimes & { visit: number }> {
        const t = await bookableTreatment(ctx, orderRef, now);
        const times = await freeTimes(t.service, t.rules, now, t.staffId);
        return {
            visit: t.visit,
            service: t.service.name,
            staff: t.staffName,
            timezone: t.service.timezone,
            times,
        };
    }

    /** Book the treatment's next visit, as the customer. */
    async bookVisit(
        ctx: Ctx,
        orderRef: string,
        startAtIso: string,
        now: Date = new Date(),
    ): Promise<AccountTreatment> {
        const t = await bookableTreatment(ctx, orderRef, now);
        const startAt = new Date(startAtIso);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        refuseOutsideWindow(startAt, now, t.rules);
        await bookVisit(
            { organizationId: ctx.organizationId, userId: null },
            t.orderId,
            {
                visitNumber: t.visit,
                startAt: startAt.toISOString(),
                staffId: t.staffId,
            },
            { accountId: ctx.accountId, contactId: ctx.contactId },
        );
        const after = first(await readTreatments(ctx, now, t.orderId));
        if (!after) throw new NotFoundException();
        return after;
    }

    // ---- Helpers -----------------------------------------------------------

    private async ownRow(ctx: Ctx, ref: string): Promise<Row> {
        const row = await prisma.booking.findFirst({
            where: { id: ref, ...ownBookingsWhere(ctx) },
            select: ROW_SELECT,
        });
        // A pay-now hold is the booking page's to finish or let go.
        if (!row || row.status === "PENDING") throw new NotFoundException();
        return row;
    }

    /** The booking, its service and the rules, once a move may be made. */
    private async movable(
        ctx: Ctx,
        row: Row,
        now: Date,
    ): Promise<{
        booking: Booking;
        service: Service;
        rules: BookingRulesValue;
    }> {
        refuseUnchangeable(row, now);
        const rules = await loadBookingRules(prisma, ctx.organizationId);
        if (isLateCancel(row, now, rules)) {
            throw new ConflictException({
                message: `Call ${await businessName(ctx)} to change this.`,
                details: { reason: "late" },
            });
        }
        if (row.order) refuseClosedTreatment(row.order);
        const [booking, service] = await Promise.all([
            prisma.booking.findUniqueOrThrow({ where: { id: row.id } }),
            prisma.service.findFirst({
                where: {
                    id: row.service.id,
                    organizationId: ctx.organizationId,
                    deletedAt: null,
                    status: "ACTIVE",
                },
            }),
        ]);
        if (!service) {
            throw new ConflictException({
                message: `This can't be moved online. Call ${await businessName(ctx)} to change it.`,
                details: { reason: "service-closed" },
            });
        }
        return { booking, service, rules };
    }

    private async rowWithActions(
        ctx: Ctx,
        row: Row,
        rules: BookingRulesValue,
        now: Date,
    ): Promise<AccountBookingRow> {
        if (
            row.status !== "CONFIRMED" ||
            row.startAt.getTime() <= now.getTime() ||
            row.courseEnrollmentId
        ) {
            return bookingRowView(row);
        }
        const late = isLateCancel(row, now, rules);
        const closedTreatment =
            row.order !== null &&
            (row.order.status === "CANCELLED" ||
                row.order.paymentStatus === "REFUNDED");
        const move: AccountBookingRow["move"] = closedTreatment
            ? null
            : late
              ? "call"
              : row.service.capacity > 1
                ? "page"
                : "sheet";
        return bookingRowView(row, {
            move,
            cancel: await cancelTerms(ctx, row, rules, late),
        });
    }
}
