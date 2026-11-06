import { createHmac, timingSafeEqual } from "node:crypto";

import type {
    NormalizedWebhookEvent,
    ParseEventInput,
    VerifySignatureInput,
    WebhookHeaders,
    WebhookOutcome,
    WebhookProvider,
} from "./webhook-provider.port";
import { headerValue } from "./webhook-provider.port";

/** Stripe's libraries' default: a delivery signed more than 5 minutes off is refused. */
export const STRIPE_SIGNATURE_TOLERANCE_S = 300;

/**
 * Stripe webhook verifier + normalizer, for the business's own endpoint
 * (docs.stripe.com/webhooks#verify-manually; `payments/providers/STRIPE.md`).
 *
 * `Stripe-Signature` is `t=<unix seconds>,v1=<hex>[,v1=…][,v0=…]`. Each
 * `v1` is the hex HMAC-SHA256 of `<t>.<raw body>`, keyed by the endpoint's
 * whole `whsec_…` signing secret; there is more than one while a secret is
 * being rolled. Any other scheme (`v0`, Stripe's fake for test events) is
 * ignored, so it can't downgrade the check. A `t` outside the tolerance is
 * refused, against replays. Never throws.
 */
export class StripeWebhookProvider implements WebhookProvider {
    readonly name = "STRIPE";
    private readonly headerName = "stripe-signature";

    /** `now` in epoch milliseconds; a test passes a fixed clock. */
    constructor(private readonly now: () => number = Date.now) {}

    verifySignature({
        rawBody,
        headers,
        secret,
    }: VerifySignatureInput): boolean {
        try {
            const header = headerValue(headers, this.headerName);
            if (!header || !secret) return false;
            let timestamp: string | undefined;
            const signatures: string[] = [];
            for (const part of header.split(",")) {
                const at = part.indexOf("=");
                if (at < 0) continue;
                const key = part.slice(0, at).trim();
                const value = part.slice(at + 1).trim();
                if (key === "t") timestamp = value;
                else if (key === "v1") signatures.push(value);
            }
            if (!timestamp || !/^\d+$/.test(timestamp)) return false;
            if (signatures.length === 0) return false;
            const age = this.now() / 1000 - Number(timestamp);
            if (Math.abs(age) > STRIPE_SIGNATURE_TOLERANCE_S) return false;

            const expected = createHmac("sha256", secret)
                .update(`${timestamp}.`)
                .update(rawBody)
                .digest();
            let matched = false;
            for (const signature of signatures) {
                if (!/^[0-9a-f]{64}$/i.test(signature)) continue;
                if (timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
                    matched = true;
                }
            }
            return matched;
        } catch {
            return false;
        }
    }

    signatureHeader(headers: WebhookHeaders): string | undefined {
        return headerValue(headers, this.headerName);
    }

    /**
     * The event's own id (`evt_…`) is the inbox key, read from the body, so
     * the job's re-parse (with no headers) gives the same one.
     */
    parseEvent({ payload }: ParseEventInput): NormalizedWebhookEvent {
        const body = (payload ?? {}) as {
            id?: string;
            type?: string;
            data?: { object?: Record<string, unknown> };
        };
        const eventType = text(body.type) ?? "unknown";
        const object = body.data?.object ?? {};
        const objectId = text(object.id);
        const providerEventId =
            text(body.id) ?? `${eventType}:${objectId ?? "unknown"}`;

        if (eventType.startsWith("payment_intent.")) {
            const outcome: WebhookOutcome =
                eventType === "payment_intent.succeeded"
                    ? "SUCCEEDED"
                    : eventType === "payment_intent.payment_failed"
                      ? "FAILED"
                      : "IGNORED";
            return {
                providerEventId,
                eventType,
                outcome,
                providerIntentId: objectId,
                // The charge names the payment, as the look-up does
                // (`stripeOrderPayments`); the intent when there is none.
                providerPaymentRef: text(object.latest_charge) ?? objectId,
                // What was collected, in minor units already (PAY-06).
                capturedAmountCents:
                    outcome === "SUCCEEDED"
                        ? whole(object.amount_received)
                        : undefined,
                capturedCurrency:
                    outcome === "SUCCEEDED"
                        ? text(object.currency)?.toUpperCase()
                        : undefined,
            };
        }

        if (eventType.startsWith("refund.")) {
            const metadata = object.metadata as
                Record<string, unknown> | null | undefined;
            return {
                providerEventId,
                eventType,
                outcome: refundOutcome(eventType, text(object.status)),
                providerIntentId: text(object.payment_intent),
                // A dashboard refund of a mismatched capture finds its
                // payment by the charge (PAY-06).
                providerPaymentRef: text(object.charge),
                providerRefundId: objectId,
                refundAmountCents: whole(object.amount),
                // Absent on a refund made in Stripe's dashboard.
                refundReference: text(metadata?.saroh_refund_id),
            };
        }

        return { providerEventId, eventType, outcome: "IGNORED" };
    }
}

/**
 * `refund.created` may already say `succeeded` (cards often do), and
 * `refund.updated` says it again: both are REFUNDED, settled once per
 * refund id by the webhook service. `pending` and `requires_action` are
 * still on their way.
 */
function refundOutcome(eventType: string, status?: string): WebhookOutcome {
    if (eventType === "refund.failed") return "REFUND_FAILED";
    if (eventType !== "refund.created" && eventType !== "refund.updated") {
        return "IGNORED";
    }
    if (status === "succeeded") return "REFUNDED";
    if (status === "failed" || status === "canceled") return "REFUND_FAILED";
    return "IGNORED";
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

function whole(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
}
