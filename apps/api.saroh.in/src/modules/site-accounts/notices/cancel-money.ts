import type { Prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../../common/words-format";
import { loadBookingRules } from "../../bookings/booking-rules";
import {
    bookingPaymentInTx,
    bookingRefundKey,
} from "../../payments/booking-refund";

/**
 * What a cancel did with the customer's money, said in every cancel notice
 * (DEC-174 U13, #1144): a booking cancelled by either side, a place in a
 * class the business cancelled (U17, #1148), and an order cancelled from
 * Order Detail. One reading and one set of words, so a booking's email, a
 * class's email and an order's note never say it differently.
 *
 * A booking's is read when its notice goes ({@link bookingCancelMoney}),
 * never when it is queued, so the email says what is true then: a refund
 * on its way, done or refused. An order's is the cancel's own outcome, the
 * one the sheet shows ({@link orderCancelMoney}). Amounts are integer
 * paise. Nothing here ever claims a refund that isn't happening: money
 * nobody is handing back is said as kept, or as "ask them about it".
 */
export type CancelMoney =
    /** The provider has taken the refund. */
    | { state: "REFUNDED"; amountMinor: number; currency: string }
    /** On its way: sent, or waiting on the provider's answer. */
    | { state: "REFUNDING"; amountMinor: number; currency: string }
    /** The provider refused it: the money is still the business's. */
    | { state: "REFUND_FAILED"; amountMinor: number; currency: string }
    /**
     * Part goes back online, and the business owes the rest by hand (an
     * order whose refund was partly refused).
     */
    | {
          state: "PARTLY_REFUNDED";
          amountMinor: number;
          restMinor: number;
          currency: string;
      }
    /** Paid by hand: the business gives it back by hand. */
    | { state: "BY_HAND"; amountMinor: number; currency: string }
    /** Paid and not handed back, for no rule that says it is kept. */
    | { state: "NOT_REFUNDED"; amountMinor: number; currency: string }
    /**
     * Kept: cancelled inside the free-cancellation window (DEC-051).
     * `window` is that window in words ("24 hours"), or null when it can't
     * be said for sure.
     */
    | {
          state: "KEPT";
          amountMinor: number;
          currency: string;
          window: string | null;
      }
    /** A pack's class back in it, and how many are left. */
    | { state: "PACK_BACK"; left: number }
    /** Cancelled late: the pack's class stays used. */
    | { state: "PACK_USED"; window: string | null }
    /** A membership's class not counted. */
    | { state: "MEMBERSHIP_BACK" }
    /** Nothing was ever paid. */
    | { state: "NOTHING_TAKEN" };

type Tx = Prisma.TransactionClient;

/** What a booking's money is read from. */
export interface CancelledBookingMoneyFacts {
    id: string;
    paidWith: string | null;
    holdExpiresAt: Date | null;
    cancelledLate: boolean;
    startAt: Date;
    freeCancelUntil: Date | null;
    /** A treatment's visit: its money is on the order (E9, DEC-050). */
    orderId: string | null;
}

/**
 * What happened to a cancelled booking's money, read now. Null: nothing
 * to say (money paid at the desk, whose handing back Saroh doesn't see;
 * a treatment's visit, whose money stays on its order; a membership class
 * cancelled late).
 *
 * `classCancelled` (U17): the business cancelled the whole class, which
 * gives classes back and never cancels late. Its unpaid places say nothing
 * about money, as U17 shipped; a pay-now hold says no payment was taken.
 */
export async function bookingCancelMoney(
    tx: Tx,
    organizationId: string,
    booking: CancelledBookingMoneyFacts,
    options: { classCancelled?: boolean } = {},
): Promise<CancelMoney | null> {
    // The cancel's own refund, as the provider stands on it now.
    const refund = await tx.paymentRefund.findFirst({
        where: { organizationId, idempotencyKey: bookingRefundKey(booking.id) },
        select: { status: true, amountCents: true, currency: true },
    });
    if (refund) {
        const amount = {
            amountMinor: refund.amountCents,
            currency: refund.currency,
        };
        if (refund.status === "SUCCEEDED") {
            return { state: "REFUNDED", ...amount };
        }
        if (refund.status === "FAILED") {
            return { state: "REFUND_FAILED", ...amount };
        }
        return { state: "REFUNDING", ...amount };
    }
    // Paid online and not handed back: kept when cancelled late, else
    // the business didn't refund it (its policy, or who cancelled).
    const paid = await bookingPaymentInTx(tx, organizationId, booking.id);
    if (paid) {
        const amount = { amountMinor: paid.leftCents, currency: paid.currency };
        if (booking.cancelledLate) {
            return {
                state: "KEPT",
                ...amount,
                window: await lateWindow(tx, organizationId, booking),
            };
        }
        return { state: "NOT_REFUNDED", ...amount };
    }
    const redemption = await tx.packRedemption.findFirst({
        where: { bookingId: booking.id },
        orderBy: { createdAt: "desc" },
        select: {
            reversedAt: true,
            purchase: { select: { id: true, credits: true } },
        },
    });
    if (redemption?.reversedAt) {
        const used = await tx.packRedemption.count({
            where: { purchaseId: redemption.purchase.id, reversedAt: null },
        });
        return {
            state: "PACK_BACK",
            left: Math.max(0, redemption.purchase.credits - used),
        };
    }
    if (redemption && booking.cancelledLate) {
        return {
            state: "PACK_USED",
            window: await lateWindow(tx, organizationId, booking),
        };
    }
    if (booking.paidWith === "MEMBERSHIP") {
        return booking.cancelledLate ? null : { state: "MEMBERSHIP_BACK" };
    }
    // A pay-now hold let go before it was paid.
    if (booking.holdExpiresAt) return { state: "NOTHING_TAKEN" };
    if (options.classCancelled) return null;
    // A visit's money is on its order; desk money is handed back by hand,
    // which Saroh doesn't see: neither is said.
    if (booking.orderId || redemption) return null;
    if (await paidAtDesk(tx, organizationId, booking.id)) return null;
    return { state: "NOTHING_TAKEN" };
}

/** Anything taken for the booking's own invoice, online or at the desk. */
async function paidAtDesk(
    tx: Pick<Tx, "invoice">,
    organizationId: string,
    bookingId: string,
): Promise<boolean> {
    const invoice = await tx.invoice.findFirst({
        where: {
            organizationId,
            bookingId,
            kind: "INVOICE",
            paidCents: { gt: 0 },
        },
        select: { id: true },
    });
    return invoice !== null;
}

/**
 * The free-cancellation window a late cancel missed, in words ("24
 * hours"): the business's rule, but only while it still matches the
 * deadline fixed when the booking was made (DEC-051). A rule changed
 * since, or a booking moved, reads null and the words say "late".
 */
async function lateWindow(
    tx: Tx,
    organizationId: string,
    booking: Pick<CancelledBookingMoneyFacts, "startAt" | "freeCancelUntil">,
): Promise<string | null> {
    const rules = await loadBookingRules(tx, organizationId);
    const hours = rules.freeCancelHours;
    if (hours === null || hours <= 0) return null;
    if (
        booking.freeCancelUntil &&
        booking.startAt.getTime() - booking.freeCancelUntil.getTime() !==
            hours * 3_600_000
    ) {
        return null;
    }
    return windowWords(hours);
}

/** "24 hours", "1 hour", "3 days": a day only from two of them on. */
export function windowWords(hours: number): string {
    if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** An order cancel's outcome, as `OrderCancelService.cancel` returns it. */
export interface OrderCancelOutcome {
    refund: {
        /** What goes back online: the refunds that weren't refused. */
        amountCents: number;
        currency: string;
        /** What the provider refused: still owed to the customer. */
        refusedCents?: number;
    } | null;
    byHand: { amountCents: number; currency: string } | null;
    /** Nothing was ever paid for it, online or by hand. */
    nothingTaken: boolean;
}

/**
 * An order cancel's money, from the very outcome the sheet shows, so the
 * customer's note and the team's screen never disagree. Null: nothing to
 * say (everything paid had already gone back).
 */
export function orderCancelMoney(
    outcome: OrderCancelOutcome,
): CancelMoney | null {
    const { refund, byHand } = outcome;
    if (refund) {
        const refused = Math.max(0, refund.refusedCents ?? 0);
        const currency = refund.currency;
        if (refund.amountCents > 0 && refused > 0) {
            return {
                state: "PARTLY_REFUNDED",
                amountMinor: refund.amountCents,
                restMinor: refused,
                currency,
            };
        }
        if (refund.amountCents > 0) {
            return {
                state: "REFUNDING",
                amountMinor: refund.amountCents,
                currency,
            };
        }
        if (refused > 0) {
            return { state: "REFUND_FAILED", amountMinor: refused, currency };
        }
    }
    if (byHand && byHand.amountCents > 0) {
        return {
            state: "BY_HAND",
            amountMinor: byHand.amountCents,
            currency: byHand.currency,
        };
    }
    return outcome.nothingTaken ? { state: "NOTHING_TAKEN" } : null;
}

/**
 * The money line, in plain words; null: none. `classCancelled` keeps the
 * words U17 shipped for a class the business cancelled.
 */
export function cancelMoneyWords(
    money: CancelMoney | null | undefined,
    business: string,
    options: { classCancelled?: boolean } = {},
): string | null {
    if (!money) return null;
    const said = (minor: number, currency: string) =>
        moneyWordsMinor(minor, currency);
    switch (money.state) {
        case "REFUNDED":
            return `${said(money.amountMinor, money.currency)} has been refunded to how you paid.`;
        case "REFUNDING":
            return `${said(money.amountMinor, money.currency)} is being refunded to how you paid.`;
        case "REFUND_FAILED":
            return `The refund of ${said(money.amountMinor, money.currency)} didn't go through. Ask ${business} about it.`;
        case "PARTLY_REFUNDED":
            return `${said(money.amountMinor, money.currency)} is being refunded to how you paid; ${business} will return the other ${said(money.restMinor, money.currency)}.`;
        case "BY_HAND":
            return `${business} will return the ${said(money.amountMinor, money.currency)} you paid.`;
        case "NOT_REFUNDED":
            return `The ${said(money.amountMinor, money.currency)} you paid hasn't been refunded. Ask ${business} about it.`;
        case "KEPT":
            return money.window
                ? `As the cancel was within ${money.window}, the ${said(money.amountMinor, money.currency)} is kept.`
                : `As it was cancelled late, the ${said(money.amountMinor, money.currency)} is kept.`;
        case "PACK_BACK":
            return options.classCancelled
                ? `The class is back in your pack: ${money.left} ${money.left === 1 ? "class" : "classes"} left.`
                : `Your class credit is back: ${money.left} left.`;
        case "PACK_USED":
            return money.window
                ? `As the cancel was within ${money.window}, the class from your pack is used.`
                : "As it was cancelled late, the class from your pack is used.";
        case "MEMBERSHIP_BACK":
            return "It doesn't count against your membership.";
        case "NOTHING_TAKEN":
            return "No payment was taken.";
    }
}
