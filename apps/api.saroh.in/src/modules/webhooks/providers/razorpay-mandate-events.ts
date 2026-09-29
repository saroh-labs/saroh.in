import {
    mandateMethodOf,
    razorpayTokenView,
} from "../../payments/providers/razorpay-mandates";
import type {
    NormalizedWebhookEvent,
    WebhookMandateChange,
    WebhookMandateLink,
} from "./webhook-provider.port";

/**
 * Razorpay's recurring-payment webhooks in the port's words (round-2 D19;
 * the events are the D11 spike's, `backend-integrations.md`):
 *
 * - `token.confirmed` → ACTIVE (also a UPI mandate resumed in the app),
 *   `token.paused` → PAUSED, `token.cancelled` → CANCELLED,
 *   `token.rejected` → FAILED — found by the token id;
 * - `invoice.expired` (a registration link never paid) → FAILED, found by
 *   the link's `inv_…`;
 * - `order.notification.delivered` / `.failed` → the charge order's
 *   pre-debit notice;
 * - a payment (or paid link) that carries a `token_id` links that token
 *   to the set-up it paid, since the token events name no customer, order
 *   or link. A recurring charge's own `payment.captured` / `.failed` is
 *   left to the ordinary intent path, matched by its order.
 *
 * Only a masked UPI handle or a card's last four is taken from a token
 * (`razorpayTokenView`); a full VPA, a name or a bank account never
 * leaves this function.
 */

type Json = Record<string, unknown>;

type MandateFields = Pick<
    NormalizedWebhookEvent,
    "outcome" | "mandate" | "providerIntentId" | "preDebitStatus"
>;

const TOKEN_EVENTS: Readonly<
    Partial<Record<string, WebhookMandateChange["status"]>>
> = {
    "token.confirmed": "ACTIVE",
    "token.paused": "PAUSED",
    "token.cancelled": "CANCELLED",
    "token.rejected": "FAILED",
};

/** Whether `eventType` is one this file reads as a mandate or notice event. */
export function isRazorpayMandateEvent(eventType: string): boolean {
    return (
        eventType in TOKEN_EVENTS ||
        eventType === "invoice.expired" ||
        eventType === "order.notification.delivered" ||
        eventType === "order.notification.failed"
    );
}

/** The entity id a mandate event is about, for a fallback inbox key. */
export function razorpayMandateEntityId(body: Json): string | undefined {
    const payload = entities(body);
    return (
        text(payload.token?.id) ??
        text(payload.notification?.id) ??
        text(payload.invoice?.id)
    );
}

/** The outcome and mandate fields of one mandate or notice event. */
export function razorpayMandateFields(
    eventType: string,
    body: Json,
): MandateFields {
    const payload = entities(body);

    const status = TOKEN_EVENTS[eventType];
    if (status) {
        const token = payload.token;
        const tokenId = text(token?.id);
        if (!token || !tokenId) return { outcome: "IGNORED" };
        const view = razorpayTokenView(token);
        return {
            outcome: "MANDATE",
            mandate: {
                status,
                providerMandateId: tokenId,
                method: view.method ?? undefined,
                displayHint: view.displayHint ?? undefined,
                maxAmountCents: view.maxAmountCents ?? undefined,
                expiresAt: view.expiresAt ?? undefined,
                failureReason:
                    status === "FAILED"
                        ? (view.failureReason ?? "token_rejected")
                        : undefined,
            },
        };
    }

    if (eventType === "invoice.expired") {
        const linkId = text(payload.invoice?.id);
        return linkId
            ? {
                  outcome: "MANDATE",
                  mandate: {
                      status: "FAILED",
                      setupReference: linkId,
                      failureReason: "setup_expired",
                  },
              }
            : { outcome: "IGNORED" };
    }

    if (
        eventType === "order.notification.delivered" ||
        eventType === "order.notification.failed"
    ) {
        const orderId = text(payload.notification?.order_id);
        return orderId
            ? {
                  outcome: "PRE_DEBIT",
                  providerIntentId: orderId,
                  preDebitStatus: eventType.endsWith("delivered")
                      ? "DELIVERED"
                      : "FAILED",
              }
            : { outcome: "IGNORED" };
    }
    return { outcome: "IGNORED" };
}

/**
 * The set-up a payment paid, when the payment made a token: a
 * registration link's (`invoice_id`) and its order. A recurring charge
 * carries a token too, but its order is no mandate's set-up, so the link
 * finds nothing and changes nothing.
 */
export function razorpayMandateLink(
    body: Json,
): WebhookMandateLink | undefined {
    const payload = entities(body);
    const payment = payload.payment;
    const tokenId = text(payment?.token_id);
    if (!payment || !tokenId) return undefined;
    // Only a recurring method makes a mandate.
    if (!mandateMethodOf(payment.method)) return undefined;
    const setupReferences = [
        text(payment.invoice_id),
        text(payload.invoice?.id),
        text(payment.order_id),
    ].filter((r): r is string => r !== undefined);
    if (setupReferences.length === 0) return undefined;
    return {
        providerMandateId: tokenId,
        providerCustomerId:
            text(payment.customer_id) ?? text(payload.invoice?.customer_id),
        setupReferences: [...new Set(setupReferences)],
    };
}

function entities(body: Json): Partial<Record<string, Json>> {
    const payload = body.payload;
    if (!payload || typeof payload !== "object") return {};
    const out: Partial<Record<string, Json>> = {};
    for (const [key, value] of Object.entries(payload as Json)) {
        const entity =
            value && typeof value === "object"
                ? (value as Json).entity
                : undefined;
        if (entity && typeof entity === "object") out[key] = entity as Json;
    }
    return out;
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}
