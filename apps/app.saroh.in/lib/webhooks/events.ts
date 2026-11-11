import type { WebhookEndpointView, WebhookEvent } from "@saroh/api-contract";

/**
 * Notifications to your systems (webhooks): each event in the merchant's
 * words, and the read it needs, as the API checks it on subscribe and on
 * every send (`outbound-webhooks/emitter.ts`). The picker offers only the
 * events the person may read.
 */
export const EVENT_WORDS: Record<
    WebhookEvent,
    { label: string; read: string }
> = {
    "booking.created": { label: "New booking", read: "booking:read" },
    "booking.moved": { label: "Booking moved", read: "booking:read" },
    "order.created": { label: "New order", read: "order:read" },
    "order.paid": { label: "Order paid", read: "order:read" },
    "order.status_changed": {
        label: "Order status changed",
        read: "order:read",
    },
    "customer.created": { label: "New customer", read: "contact:read" },
    "enquiry.received": { label: "New enquiry", read: "lead:read" },
};

/** What "Send a test" sends, in the log. */
const PING_LABEL = "Test message";

export function eventLabel(event: string): string {
    const words: Partial<Record<string, { label: string }>> = EVENT_WORDS;
    return words[event]?.label ?? PING_LABEL;
}

/** The events this person may subscribe to, in the picker's order. */
export function eventsFor(may: (action: string) => boolean): WebhookEvent[] {
    return (Object.keys(EVENT_WORDS) as WebhookEvent[]).filter((e) =>
        may(EVENT_WORDS[e].read),
    );
}

export type EndpointState = "working" | "off" | "turned-off";

/** Working, switched off by a person, or turned off by Saroh after failures. */
export function endpointState(endpoint: WebhookEndpointView): EndpointState {
    if (endpoint.enabled) return "working";
    return endpoint.disabledAt && endpoint.failureStreak > 0
        ? "turned-off"
        : "off";
}

/** An address as its row shows it: the host and path, no scheme. */
export function addressLine(url: string): string {
    return url.replace(/^https:\/\//i, "").replace(/\/$/, "");
}
