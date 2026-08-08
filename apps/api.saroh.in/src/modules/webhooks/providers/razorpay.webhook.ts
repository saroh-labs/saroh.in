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

/**
 * Razorpay webhook verifier + normalizer (S5-003).
 *
 * Signature scheme (per Razorpay docs): the `X-Razorpay-Signature` header is the
 * lowercase HEX HMAC-SHA256 of the RAW request body keyed by the account's
 * webhook secret. Verification is constant-time ({@link timingSafeEqual}); a
 * mismatch/absent header returns `false` (never throws), so the caller rejects
 * with 401 before parsing.
 */
export class RazorpayWebhookProvider implements WebhookProvider {
    readonly name = "RAZORPAY";
    private readonly headerName = "x-razorpay-signature";

    verifySignature({
        rawBody,
        headers,
        secret,
    }: VerifySignatureInput): boolean {
        const provided = headerValue(headers, this.headerName);
        if (!provided) return false;

        const expected = createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        return safeEqualHex(provided, expected);
    }

    signatureHeader(headers: WebhookHeaders): string | undefined {
        return headerValue(headers, this.headerName);
    }

    parseEvent({ payload, headers }: ParseEventInput): NormalizedWebhookEvent {
        const body = (payload ?? {}) as {
            event?: string;
            payload?: {
                payment?: { entity?: { id?: string; order_id?: string } };
                refund?: { entity?: { id?: string; payment_id?: string } };
            };
        };

        const eventType = body.event ?? "unknown";
        const payment = body.payload?.payment?.entity;
        const refund = body.payload?.refund?.entity;

        // Prefer Razorpay's per-delivery event id header; fall back to a stable
        // id derived from the entity so the inbox stays idempotent either way.
        const providerEventId =
            headerValue(headers, "x-razorpay-event-id") ??
            `${eventType}:${refund?.id ?? payment?.id ?? "unknown"}`;

        return {
            providerEventId,
            eventType,
            outcome: outcomeFor(eventType),
            providerIntentId: payment?.order_id,
            providerPaymentRef: payment?.id,
            providerRefundId: refund?.id,
        };
    }
}

function outcomeFor(eventType: string): WebhookOutcome {
    if (eventType === "payment.captured" || eventType === "order.paid") {
        return "SUCCEEDED";
    }
    if (eventType === "payment.failed") return "FAILED";
    if (eventType.startsWith("refund.")) return "REFUNDED";
    return "IGNORED";
}

/** Constant-time compare of two hex strings of equal length. */
function safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
    } catch {
        return false;
    }
}
