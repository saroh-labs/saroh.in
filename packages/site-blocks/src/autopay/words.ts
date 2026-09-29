import { accountDate, accountMoney } from "../account/model";
import type {
    AutopayCheck,
    AutopayCheckState,
    AutopayMethod,
    AutopayState,
} from "./api";

/**
 * Autopay in the customer's words (round-2 D12): each method by a plain
 * name, and what it asks of them. Only the kinds the business's provider
 * says it takes are ever shown (DEC-059), all of them.
 */
const NAMES: Record<AutopayMethod, { label: string; sub: string }> = {
    UPI: { label: "UPI Autopay", sub: "Approve it in your UPI app" },
    CARD: {
        label: "Debit or credit card",
        sub: "Your card is charged each time it renews",
    },
    EMANDATE: {
        label: "Bank account (eMandate)",
        sub: "Approve it with your bank; nothing is taken to set it up",
    },
};

export function autopayMethodLabel(method: AutopayMethod): string {
    return NAMES[method].label;
}

export function autopayMethodSub(method: AutopayMethod): string {
    return NAMES[method].sub;
}

/** How autopay pays, short: "UPI", "card", "bank account". */
const SHORT: Record<AutopayMethod, string> = {
    UPI: "UPI",
    CARD: "card",
    EMANDATE: "bank account",
};

/** "UPI (mo•••@okicici)", "card (•••• 4242)", or just the method. */
export function autopayWith(
    autopay: Pick<AutopayState, "method" | "hint">,
): string {
    const method = autopay.method ? SHORT[autopay.method] : "autopay";
    return autopay.hint ? `${method} (${autopay.hint})` : method;
}

/** A plan's autopay in a line, for My plan: null when there is none. */
export function autopayStateLine(
    autopay: AutopayState | null | undefined,
): string | null {
    if (!autopay) return null;
    switch (autopay.state) {
        case "ON":
            return `Autopay is on with ${autopayWith(autopay)}`;
        case "PAUSED":
            return `Autopay is paused in your UPI app`;
        case "PENDING":
            return "Autopay is being confirmed";
        case "FAILED":
            return "Autopay didn't turn on";
    }
}

/**
 * The ₹1 check (DEC-064), before they pay: switching autopay on with
 * nothing owed by UPI or card takes it, and it comes straight back.
 */
export function autopayCheckBefore(check: AutopayCheck): string {
    const m = accountMoney(check.amount, check.currency);
    return `To switch on autopay, your bank needs a ${m} check. We refund the ${m} straight away — it's back in your account in 5–7 working days.`;
}

/** The check afterwards, as a sentence: where its refund is. */
export function autopayCheckAfter(
    check: AutopayCheckState,
    timezone: string,
    business: string,
): string {
    const m = accountMoney(check.amount, check.currency);
    switch (check.state) {
        case "REFUNDED":
            return check.refundedAt
                ? `The ${m} check was refunded on ${accountDate(check.refundedAt, timezone)}.`
                : `The ${m} check was refunded.`;
        case "REFUNDING":
            return `The ${m} check is being refunded — it reaches you in 5–7 working days.`;
        case "NOT_REFUNDED":
            return `The ${m} check hasn't been refunded yet. ${business} will return it — ask them if it doesn't arrive.`;
    }
}

/** The check on My plan, short: "Autopay check · ₹1 · Refunded". */
export function autopayCheckLine(check: AutopayCheckState): string {
    const m = accountMoney(check.amount, check.currency);
    const where =
        check.state === "REFUNDED"
            ? "Refunded"
            : check.state === "REFUNDING"
              ? "Refund on its way"
              : "Not refunded yet";
    return `Autopay check · ${m} · ${where}`;
}
