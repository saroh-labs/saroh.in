import type { OrderReadMoney } from "./read";

/**
 * "Cancel #1063?" — how much goes back and how (B9; #918, DEC-116), pure.
 * A cancel refunds what is left on the order: what was paid less every
 * refund already made, online or recorded by hand. Online it goes back to
 * the provider; paid by hand, the till gives it back. With nothing left,
 * the cancel hands nothing back. The API works the amount out again under
 * the order's lock; this says what the dialog can know.
 */

export type CancelPaid = "unpaid" | "by-hand" | "online";

/** What a cancel hands back and what went back before it, in major units. */
export interface CancelMoney {
    amount: number;
    already: number;
}

/** From the order read's money: what is left, and what was refunded. */
export function cancelMoney(
    money: OrderReadMoney | null | undefined,
    paid: CancelPaid,
): CancelMoney {
    if (paid === "unpaid" || !money) return { amount: 0, already: 0 };
    const already = Math.max(0, Number(money.refunded));
    // An API before #865 sends no `leftToRefund`: paid less refunded.
    const left =
        money.leftToRefund !== undefined
            ? Number(money.leftToRefund)
            : Number(paid === "by-hand" ? money.total : money.paid) - already;
    return { amount: Math.max(0, left), already };
}

/** The sentence under the lines, and the button that confirms. */
export interface CancelWords {
    says: string;
    confirm: string;
}

export function cancelWords(input: {
    paid: CancelPaid;
    amount: number;
    already: number;
    /** "Razorpay", or "the till" when paid by hand. */
    refundTo: string;
    /** Money in major units; null without a money read. */
    format: ((n: number) => string) | null;
}): CancelWords {
    const { paid, amount, already, refundTo, format } = input;
    if (paid === "unpaid") {
        return {
            says: "Nothing was paid, so nothing goes back. Its stock goes back on the shelf.",
            confirm: "Cancel order",
        };
    }
    const stock =
        paid === "online"
            ? "Its stock goes back on the shelf once the refund is confirmed."
            : "Its stock goes back on the shelf.";
    if (!format) {
        return {
            says:
                paid === "online"
                    ? `What's left goes back to ${refundTo}, in 3–5 days. ${stock}`
                    : `Give what's left back from the till. ${stock}`,
            confirm: "Cancel order",
        };
    }
    if (amount <= 0) {
        return {
            says: "Everything paid has already been refunded, so nothing more goes back. Its stock goes back on the shelf.",
            confirm: "Cancel order",
        };
    }
    const money = format(amount);
    const back =
        paid === "online"
            ? already > 0
                ? `${format(already)} has already been refunded, so the ${money} left goes back to ${refundTo}, in 3–5 days.`
                : `${money} goes back to ${refundTo}, in 3–5 days.`
            : already > 0
              ? `${format(already)} has already been refunded, so give the ${money} left back from the till.`
              : `Give ${money} back from the till.`;
    return { says: `${back} ${stock}`, confirm: `Refund ${money}` };
}
