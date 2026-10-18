/**
 * Billing › Provider events in words (R28): what each event Razorpay sent
 * means for Saroh's billing, and whether Saroh handled it. Client-safe: no
 * server imports. Never reads an event's payload; the API never sends it.
 */

/** Events Saroh's billing acts on, as Razorpay names them. */
const EVENT_WORDS: Record<string, string> = {
    "subscription.authenticated": "Autopay was set up for a plan",
    "subscription.activated": "A plan's subscription started",
    "subscription.charged": "A plan's payment went through",
    "subscription.pending":
        "A plan's payment failed, and Razorpay will try again",
    "subscription.halted": "Razorpay stopped trying to take a plan's payment",
    "subscription.resumed": "A paused subscription started again",
    "subscription.paused": "A subscription was paused",
    "subscription.cancelled": "A subscription was cancelled",
    "subscription.completed": "A subscription ran all its charges",
    "subscription.expired": "A subscription ran out without being paid",
    "subscription.updated": "A subscription was changed",
    "order.paid": "A one-time plan payment went through",
    "payment.captured": "A payment went through",
    "payment.authorized": "A payment was approved, not yet taken",
    "payment.failed": "A payment failed",
    "refund.created": "A refund was started",
    "refund.processed": "A refund reached the business",
    "refund.failed": "A refund failed",
    "payment.dispute.created": "A bank disputed a payment",
    "payment.dispute.under_review": "A dispute is with the bank",
    "payment.dispute.action_required": "A dispute needs an answer",
    "payment.dispute.won": "Saroh won a dispute",
    "payment.dispute.lost": "Saroh lost a dispute, and the money went back",
    "payment.dispute.closed": "A dispute was closed",
};

/**
 * What an event means, in a sentence. An event the console has no words
 * for reads as its own code, so a new kind of event still shows.
 */
export function eventWords(type: string): string {
    return EVENT_WORDS[type] ?? type;
}

/** Whether the console has words for this event. */
export function hasEventWords(type: string): boolean {
    return type in EVENT_WORDS;
}

export type EventHandled = "handled" | "not-applied" | "no-business";

/**
 * Whether Saroh handled an event: applied to a business, kept but not
 * applied (rejected or nothing to change), or placed with no business.
 */
export function eventHandled(event: {
    processedAt: string | null;
    organization: unknown;
}): EventHandled {
    if (!event.organization) return "no-business";
    return event.processedAt ? "handled" : "not-applied";
}

export const HANDLED_LABEL: Record<EventHandled, string> = {
    handled: "Handled",
    "not-applied": "Not applied",
    "no-business": "No business",
};
