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
 * Cashfree PG webhook verifier + normalizer (S5-003).
 *
 * Signature scheme (per Cashfree docs): the `x-webhook-signature` header is the
 * BASE64 HMAC-SHA256 of `timestamp + rawBody` (the `x-webhook-timestamp` header
 * concatenated with the RAW body) keyed by the client secret. Verification is
 * constant-time; a mismatch/absent header or timestamp returns `false` (never
 * throws), so the caller rejects with 401 before parsing.
 */
export class CashfreeWebhookProvider implements WebhookProvider {
    readonly name = "CASHFREE";
    private readonly headerName = "x-webhook-signature";
    private readonly timestampHeader = "x-webhook-timestamp";

    verifySignature({
        rawBody,
        headers,
        secret,
    }: VerifySignatureInput): boolean {
        const provided = headerValue(headers, this.headerName);
        const timestamp = headerValue(headers, this.timestampHeader);
        if (!provided || !timestamp) return false;

        const signed = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
        const expected = createHmac("sha256", secret)
            .update(signed)
            .digest("base64");

        return safeEqualBase64(provided, expected);
    }

    signatureHeader(headers: WebhookHeaders): string | undefined {
        return headerValue(headers, this.headerName);
    }

    parseEvent({ payload }: ParseEventInput): NormalizedWebhookEvent {
        const body = (payload ?? {}) as {
            type?: string;
            data?: {
                order?: { order_id?: string };
                payment?: {
                    cf_payment_id?: string | number;
                    payment_status?: string;
                };
                refund?: {
                    cf_refund_id?: string | number;
                    refund_id?: string;
                    refund_status?: string;
                };
            };
        };

        const eventType = body.type ?? "unknown";
        const orderRef = body.data?.order?.order_id;
        const payment = body.data?.payment;
        const refund = body.data?.refund;

        const providerPaymentRef =
            payment?.cf_payment_id != null
                ? String(payment.cf_payment_id)
                : undefined;
        const providerRefundId =
            refund?.cf_refund_id != null
                ? String(refund.cf_refund_id)
                : (refund?.refund_id ?? undefined);

        // Cashfree has no single event-id field, so derive a stable idempotency
        // key from the type + the payment/refund id of this delivery.
        const providerEventId = `${eventType}:${providerRefundId ?? providerPaymentRef ?? orderRef ?? "unknown"}`;

        return {
            providerEventId,
            eventType,
            outcome: outcomeFor(eventType, refund?.refund_status),
            // Cashfree webhooks carry the MERCHANT order id (== our Order.id we
            // submitted at create), so reconcile matches on the order ref.
            orderRef,
            providerPaymentRef,
            providerRefundId,
        };
    }
}

function outcomeFor(eventType: string, refundStatus?: string): WebhookOutcome {
    if (eventType === "PAYMENT_SUCCESS_WEBHOOK") return "SUCCEEDED";
    if (
        eventType === "PAYMENT_FAILED_WEBHOOK" ||
        eventType === "PAYMENT_USER_DROPPED_WEBHOOK"
    ) {
        return "FAILED";
    }
    if (eventType === "REFUND_STATUS_WEBHOOK") {
        return refundStatus === "SUCCESS" ? "REFUNDED" : "IGNORED";
    }
    return "IGNORED";
}

/** Constant-time compare of two base64 strings. */
function safeEqualBase64(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "base64");
    const bufB = Buffer.from(b, "base64");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}
