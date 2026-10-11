import { anotherAmount } from "./refund-choice";

/**
 * "Record as refunded" (UX-061, #865, DEC-116), pure: the full amount left,
 * or another amount above zero and no more than is left. The API judges it
 * again under the order's lock; this says only what the dialog can know.
 */

export type HandRefundChoice = "full" | "another";

export type HandRefundAmount =
    /** The full amount left: nothing is sent, the API works it out. */
    | { kind: "full" }
    /** Another amount, as money ("49.50"). */
    | { kind: "ok"; amount: number; money: string }
    /** Another amount not typed yet. */
    | { kind: "none" }
    | { kind: "bad"; error: string };

/** What the dialog would record, from the choice and what was typed. */
export function handRefundAmount(
    choice: HandRefundChoice,
    typed: string,
    left: number,
    format: (n: number) => string,
): HandRefundAmount {
    if (choice === "full") return { kind: "full" };
    return anotherAmount(typed, left, format);
}

/**
 * The dialog's button: "Record as refunded" for the full amount (and while
 * another amount is not ready), "Record ₹200 refunded" for another.
 */
export function handRefundVerb(
    amount: HandRefundAmount,
    format: (n: number) => string,
): string {
    return amount.kind === "ok"
        ? `Record ${format(amount.amount)} refunded`
        : "Record as refunded";
}

/**
 * The toast once it is recorded: in full, the order "marked refunded"; in
 * part, how much, since the order stays paid.
 */
export function handRefundDone(
    orderRef: string,
    amount: number | null,
    format: (n: number) => string,
): string {
    return amount === null
        ? `${orderRef} marked refunded`
        : `${format(amount)} recorded as refunded on ${orderRef}`;
}
