import type { Prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../../common/words-format";
import {
    bookingPaymentInTx,
    bookingRefundKey,
} from "../../payments/booking-refund";

/**
 * What happened to the money for a place in a class the business cancelled
 * as a whole (DEC-174 U17, #1148), read when the notice runs, so the email
 * says what is true then: a refund on its way, done or refused, money paid
 * and not handed back, a pack's class back, a membership's class not used,
 * or a hold never paid. Null: nothing to say.
 *
 * A class the business cancels gives its classes back (`returnCredit`),
 * and refunds money paid online only when whoever cancelled may refund
 * (`booking-cancel.ts`), so every one of these can happen.
 */
export type ClassCancelMoney =
    | { state: "REFUNDED"; amountMinor: number; currency: string }
    | { state: "REFUNDING"; amountMinor: number; currency: string }
    | { state: "REFUND_FAILED"; amountMinor: number; currency: string }
    | { state: "NOT_REFUNDED"; amountMinor: number; currency: string }
    | { state: "PACK_BACK"; left: number }
    | { state: "MEMBERSHIP_BACK" }
    | { state: "NOTHING_TAKEN" };

type Tx = Prisma.TransactionClient;

export async function classCancelMoney(
    tx: Tx,
    organizationId: string,
    booking: {
        id: string;
        paidWith: string | null;
        holdExpiresAt: Date | null;
        cancelledLate: boolean;
    },
): Promise<ClassCancelMoney | null> {
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
    const paid = await bookingPaymentInTx(tx, organizationId, booking.id);
    if (paid) {
        return {
            state: "NOT_REFUNDED",
            amountMinor: paid.leftCents,
            currency: paid.currency,
        };
    }
    const redemption = await tx.packRedemption.findFirst({
        where: { bookingId: booking.id, reversedAt: { not: null } },
        select: { purchase: { select: { id: true, credits: true } } },
    });
    if (redemption) {
        const used = await tx.packRedemption.count({
            where: { purchaseId: redemption.purchase.id, reversedAt: null },
        });
        return {
            state: "PACK_BACK",
            left: Math.max(0, redemption.purchase.credits - used),
        };
    }
    if (booking.paidWith === "MEMBERSHIP" && !booking.cancelledLate) {
        return { state: "MEMBERSHIP_BACK" };
    }
    // A pay-now hold let go before it was paid.
    if (booking.holdExpiresAt) return { state: "NOTHING_TAKEN" };
    return null;
}

/** The money line, in plain words; null: none. */
export function classCancelMoneyWords(
    money: ClassCancelMoney | null | undefined,
    business: string,
): string | null {
    if (!money) return null;
    switch (money.state) {
        case "REFUNDED":
            return `${moneyWordsMinor(money.amountMinor, money.currency)} has been refunded to how you paid.`;
        case "REFUNDING":
            return `${moneyWordsMinor(money.amountMinor, money.currency)} is being refunded to how you paid.`;
        case "REFUND_FAILED":
            return `The refund of ${moneyWordsMinor(money.amountMinor, money.currency)} didn't go through. Ask ${business} about it.`;
        case "NOT_REFUNDED":
            return `The ${moneyWordsMinor(money.amountMinor, money.currency)} you paid hasn't been refunded. Ask ${business} about it.`;
        case "PACK_BACK":
            return `The class is back in your pack: ${money.left} ${money.left === 1 ? "class" : "classes"} left.`;
        case "MEMBERSHIP_BACK":
            return "It doesn't count against your membership.";
        case "NOTHING_TAKEN":
            return "No payment was taken.";
    }
}
