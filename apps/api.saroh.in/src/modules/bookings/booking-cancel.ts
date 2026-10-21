import { ConflictException, Logger } from "@nestjs/common";
import type { Booking, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { reversePackInTx } from "../class-packs/redeem-pack";
import {
    bookingPaymentInTx,
    lockBookingIntentsInTx,
    recordBookingRefundInTx,
    reserveBookingRefundInTx,
} from "../payments/booking-refund";
import type { PaymentsService } from "../payments/payments.service";
import { BookingEventType, classCancelledData } from "./booking-event-type";
import { lockBookingInTx, releaseHoldInTx } from "./booking-hold";
import { PAID_ALREADY, retirePayLinkInTx } from "./booking-pay-link";
import {
    isLateCancel,
    loadBookingRules,
    refundsAutomatically,
} from "./booking-rules";
import {
    closeSessionWaitlistInTx,
    offerFreedPlaceInTx,
} from "./waitlist-queue";

/*
 * Cancelling a booking (U3, E8, E9, E30), whoever cancels it: the team from
 * the workspace (`BookingsService.cancelBooking`), or the customer from
 * their account on the business's site (A6, `AccountBookingsService`). One
 * write, so the free-cancellation rule, the refund and the history read the
 * same whichever side cancels; the caller has already found the booking and
 * checked who may.
 */

/**
 * Where a cancel's refund stands (E8): SENT once the provider took it,
 * CONFIRMING while its answer is awaited (the money is held), REFUSED when
 * the provider made none.
 */
export type RefundStatus = "SENT" | "CONFIRMING" | "REFUSED";

/** What a cancel did with money paid online for the booking (E8). */
export interface CancelMoney {
    /** Handed back: cancelled in time, or by someone who may refund. */
    refund: {
        amountCents: number;
        currency: string;
        status: RefundStatus;
    } | null;
    /** Kept: cancelled late (DEC-051). */
    kept: { amountCents: number; currency: string } | null;
    /**
     * A visit of a treatment (E9, DEC-050): its money stays on this order
     * and comes back only through the order's refund. Null otherwise.
     */
    treatmentOrderId?: string | null;
}

export const NOTHING_MOVED: CancelMoney = { refund: null, kept: null };

/**
 * Home's Turn down (review #11) cancels only a booking still awaiting its
 * money. When the customer paid in the ten seconds Undo was offered, the
 * cancel is refused with this, and the row says so: the booking stands.
 */
export const THEY_JUST_PAID = "They just paid. The booking stands.";
/** `details.reason` on that refusal, which the app answers in place. */
export const JUST_PAID_REASON = "paid";

/**
 * Whether a booking still waits on its money, under its locks: a pay-now
 * hold (PENDING), or a confirmed booking not paid another way whose own
 * invoice is still issued (Home's "awaiting payment",
 * `home-pending-bookings.ts`). A webhook that confirmed the hold, or paid
 * the link's invoice, ends it.
 */
async function awaitsPaymentInTx(
    tx: Prisma.TransactionClient,
    booking: Booking,
): Promise<boolean> {
    if (booking.status === "PENDING") return true;
    if (booking.status !== "CONFIRMED") return false;
    if (booking.paidWith && PAID_ALREADY.includes(booking.paidWith)) {
        return false;
    }
    const issued = await tx.invoice.findFirst({
        where: {
            bookingId: booking.id,
            kind: "INVOICE",
            source: "BOOKING",
            status: "ISSUED",
        },
        select: { id: true },
    });
    return issued !== null;
}

/**
 * A cancelled booking, and what happened to its money. `told`: the cancel
 * happened now and its notice is queued (A14's `booking.notify`, which
 * tells the customer, and the team when the customer cancelled it).
 */
export type CancelledBooking = Booking & { money: CancelMoney; told: boolean };

/** Who is cancelling, as the booking's history and the refund rule need. */
export interface CancelActor {
    organizationId: string;
    /** The team member; null when the customer cancels it themselves. */
    userId: string | null;
    /**
     * May hand back money a late cancel keeps (`payment:manage`). Only the
     * business's `returnCredit` override asks; a customer never may.
     */
    mayRefundByHand: boolean;
}

/**
 * Cancel a booking already found in the actor's business. Idempotent: an
 * already-cancelled booking is returned unchanged and refunds nothing.
 *
 * The deadline is the one fixed when the booking was made (`freeCancelUntil`,
 * DEC-051), so a move never changes it. Cancelled in time, a pack's class
 * goes back, and money paid online for it is refunded once, if the
 * business's refund policy says so (E30, DEC-058). Inside the window the
 * class stays used, the money is kept, and the booking says it was
 * cancelled late. A refund is never more than what is left of what was
 * received (`reserveBookingRefundInTx`).
 *
 * `returnCredit` is the business cancelling rather than the customer (U15):
 * never late, and money kept is handed back only with `mayRefundByHand`.
 *
 * A visit of a treatment (E9, DEC-050) never refunds on its own, early or
 * late, whoever cancels it: its slot is freed and its money stays on the
 * order. Its order is locked first (the documented order: order → intent →
 * booking), so a visit booked or refunded on the same order waits its turn.
 *
 * The refund is two-phase (DEC-026): the PENDING refund is reserved in the
 * cancel's transaction and sent after commit, under the row's id.
 *
 * A pay-now hold (PENDING) is released rather than cancelled (#508).
 *
 * The place it frees goes to the class's waitlist (A12, `waitlist.offer`)
 * — unless `closesClass`: the team is cancelling the whole class, so its
 * line is closed instead and nobody is offered a place in it.
 */
export async function cancelFoundBooking(
    found: Booking,
    actor: CancelActor,
    now: Date,
    options: {
        returnCredit?: boolean;
        closesClass?: boolean;
        /**
         * Cancel only while it still awaits payment (Home's Turn down,
         * review #11): else 409 `THEY_JUST_PAID`, and nothing changes.
         */
        ifUnpaid?: boolean;
        /**
         * With `closesClass`: why the business cancelled it (DEC-178,
         * #1172), kept on the CANCELLED event's `data` and told to its
         * customers and its waitlist.
         */
        classReason?: string;
    },
    send: (refundId: string) => Promise<RefundStatus>,
): Promise<CancelledBooking> {
    if (found.status === "CANCELLED") {
        return { ...found, money: NOTHING_MOVED, told: false };
    }
    const { organizationId } = actor;
    const rules = await loadBookingRules(prisma, organizationId);
    const done = await prisma.$transaction(async (tx) => {
        // A visit's order first (E9): the documented lock order.
        if (found.orderId) {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${found.orderId} FOR UPDATE`;
        }
        // Where it stands now, under its locks — the payment's, then
        // the invoice's, then the booking's: the webhook's order (#508,
        // E8) — so a second cancel, or a payment landing on a hold, is
        // seen rather than overwritten.
        await lockBookingIntentsInTx(tx, found.id);
        await lockBookingInTx(tx, found.id);
        const booking =
            (await tx.booking.findUnique({ where: { id: found.id } })) ?? found;
        if (booking.status === "CANCELLED") {
            return { booking, money: NOTHING_MOVED, send: null, told: false };
        }
        // Turned down from Home after ten seconds of Undo: a payment that
        // landed meanwhile (the webhook takes the same locks first) wins.
        if (options.ifUnpaid && !(await awaitsPaymentInTx(tx, booking))) {
            throw new ConflictException({
                message: THEY_JUST_PAID,
                details: { reason: JUST_PAID_REASON },
            });
        }
        // A pay-now hold nobody has paid: let it go as the booker would,
        // so its draft invoice is voided and its pay link stops working.
        // A payment that lands after is recorded as owed back.
        if (booking.status === "PENDING") {
            await releaseHoldInTx(tx, booking.id, now, actor.userId, {
                freesPlace: !options.closesClass,
                // The whole class is off (U17): the booker of an unpaid
                // hold in it hears so too.
                ...(options.closesClass
                    ? { classCancelled: true, classReason: options.classReason }
                    : {}),
            });
            if (options.closesClass) {
                await closeSessionWaitlistInTx(tx, {
                    organizationId,
                    serviceId: booking.serviceId,
                    startAt: booking.startAt,
                    now,
                    tell: true,
                    reason: options.classReason,
                });
            }
            return {
                booking:
                    (await tx.booking.findUnique({
                        where: { id: booking.id },
                    })) ?? booking,
                money: NOTHING_MOVED,
                send: null,
                told: false,
            };
        }
        const inTime = !isLateCancel(booking, now, rules);
        const late = !options.returnCredit && !inTime;
        // A visit of a treatment never refunds on its own (E9, DEC-050,
        // DEC-051), early or late, whoever cancels it: its slot is
        // freed and its money stays on the order, which refunds it.
        const visit = Boolean(booking.orderId);
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
        // Money paid online goes back once when cancelled in time and
        // the business's policy refunds (E8, DEC-058). Otherwise only
        // someone who may refund hands it back, by hand.
        const automatic = !visit && refundsAutomatically(inTime, rules);
        const refunds =
            !visit &&
            (automatic || (!!options.returnCredit && actor.mayRefundByHand));
        const reserved = refunds
            ? await reserveBookingRefundInTx(tx, {
                  organizationId,
                  bookingId: booking.id,
                  reason: automatic
                      ? "Booking cancelled in time"
                      : "Booking cancelled by the business",
              })
            : null;
        const kept =
            reserved || visit
                ? null
                : await bookingPaymentInTx(tx, organizationId, booking.id);
        // A pay link sent for it (E4) stops working with the place.
        await retirePayLinkInTx(tx, booking.id);
        // The place is free: offered to the first in line, or, when the
        // whole class is being cancelled, the line is closed (A12).
        const session = {
            organizationId,
            serviceId: booking.serviceId,
            startAt: booking.startAt,
        };
        if (options.closesClass) {
            // Everyone waiting for it hears the class is off (U17).
            await closeSessionWaitlistInTx(tx, {
                ...session,
                now,
                tell: true,
                reason: options.classReason,
            });
        } else {
            await offerFreedPlaceInTx(tx, session);
        }
        // The slot it was cancelled OUT of, so the history reads as a
        // sequence rather than a list of states with the times missing.
        // No actor is the customer themselves ("by the customer").
        const event = await tx.bookingEvent.create({
            data: {
                bookingId: booking.id,
                organizationId,
                type: BookingEventType.Cancelled,
                actorUserId: actor.userId,
                fromStartAt: booking.startAt,
                // The whole class (DEC-178, #1172): and why, in the
                // business's words, for the email and the history.
                ...(options.closesClass
                    ? { data: { ...classCancelledData(options.classReason) } }
                    : {}),
            },
            select: { id: true },
        });
        // The outbox, as a booking and a move: A14's `booking.notify`
        // tells the customer, and the team when the customer cancelled.
        // A course's sessions are not told one by one (ADR-007).
        const told = !booking.courseEnrollmentId;
        if (told) {
            await tx.job.create({
                data: {
                    organizationId,
                    type: "booking.notify",
                    payload: {
                        bookingId: booking.id,
                        serviceId: booking.serviceId,
                        contactId: booking.contactId,
                        reason: "cancelled",
                        eventId: event.id,
                        // The business cancelled the whole class (U17):
                        // "‹Business› cancelled this class", and the money.
                        ...(options.closesClass
                            ? { classCancelled: true }
                            : {}),
                    },
                },
                select: { id: true },
            });
        }
        const money: CancelMoney = {
            refund: reserved
                ? {
                      amountCents: reserved.amountCents,
                      currency: reserved.currency,
                      status: "CONFIRMING",
                  }
                : null,
            kept: kept
                ? { amountCents: kept.leftCents, currency: kept.currency }
                : null,
            ...(booking.orderId ? { treatmentOrderId: booking.orderId } : {}),
        };
        return {
            booking: cancelled,
            money,
            send: reserved?.reservedNow ? reserved.refundId : null,
            told,
        };
    });
    // Phase two, after commit: the provider, under the row's id.
    if (done.send && done.money.refund) {
        done.money.refund.status = await send(done.send);
        await recordRefundOutcome(done.send, done.money.refund.status);
    }
    return { ...done.booking, money: done.money, told: done.told };
}

const logger = new Logger("BookingCancel");

/**
 * The cancel's refund in the booking's history (#1137): "Refunded ₹X"
 * once sent or awaiting the provider, "Refund failed" when refused. Under
 * the refund row's lock, which the refund webhook takes too, so whichever
 * writes first the line follows the row. Never throws: the cancel and the
 * refund have happened, and the webhook writes the final line regardless.
 */
async function recordRefundOutcome(
    refundId: string,
    status: RefundStatus,
): Promise<void> {
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "PaymentRefund" WHERE id = ${refundId} FOR UPDATE`;
            await recordBookingRefundInTx(tx, refundId, status);
        });
    } catch (err) {
        logger.warn(
            `Refund ${refundId}: not written to the booking's history (${
                err instanceof Error ? err.message : String(err)
            }); the refund webhook writes it`,
        );
    }
}

/**
 * Send a cancel's reserved refund (DEC-026), and say where it stands:
 * SENT once the provider took it, REFUSED when it definitely made none
 * (the row is FAILED, the money freed), CONFIRMING when no answer came —
 * the row stays PENDING with the money held until the refund webhook
 * settles it. Never throws: the cancel has already happened.
 */
export async function sendCancelRefund(
    payments: PaymentsService | undefined,
    logger: Pick<Logger, "warn">,
    organizationId: string,
    refundId: string,
): Promise<RefundStatus> {
    if (!payments) {
        logger.warn(
            `Refund ${refundId} reserved with no payments service; held until the provider says`,
        );
        return "CONFIRMING";
    }
    try {
        const sent = await payments.sendAutomaticRefund(
            organizationId,
            refundId,
        );
        if (sent.status === "FAILED") return "REFUSED";
        if (sent.status === "SUCCEEDED") return "SENT";
        return sent.beingConfirmed ? "CONFIRMING" : "SENT";
    } catch (err) {
        logger.warn(
            `Refund ${refundId}: ${
                err instanceof Error ? err.message : String(err)
            }; held until the provider says`,
        );
        return "CONFIRMING";
    }
}
