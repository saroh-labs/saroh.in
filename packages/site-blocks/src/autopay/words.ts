import type { AutopayMethod, AutopayState } from "./api";

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
