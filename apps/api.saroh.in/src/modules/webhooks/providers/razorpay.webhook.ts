import { createHmac, timingSafeEqual } from "node:crypto";

import {
    isRazorpayMandateEvent,
    razorpayMandateEntityId,
    razorpayMandateFields,
    razorpayMandateLink,
} from "./razorpay-mandate-events";
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
                payment?: {
                    entity?: {
                        id?: string;
                        order_id?: string;
                        fee?: number;
                        amount?: number;
                        currency?: string;
                    };
                };
                refund?: {
                    entity?: {
                        id?: string;
                        payment_id?: string;
                        amount?: number;
                        receipt?: string | null;
                        notes?: Record<string, unknown> | unknown[] | null;
                    };
                };
            };
        };

        const eventType = body.event ?? "unknown";
        const payment = body.payload?.payment?.entity;
        const refund = body.payload?.refund?.entity;
        const raw = (payload ?? {}) as Record<string, unknown>;

        // Autopay (D19): a token's state, a link that lapsed, or a charge's
        // pre-debit notice. A token moves more than once (paused, then
        // confirmed again), so its fallback key carries the event's time.
        if (isRazorpayMandateEvent(eventType)) {
            const at = typeof raw.created_at === "number" ? raw.created_at : "";
            return {
                providerEventId:
                    headerValue(headers, "x-razorpay-event-id") ??
                    `${eventType}:${razorpayMandateEntityId(raw) ?? "unknown"}:${at}`,
                eventType,
                ...razorpayMandateFields(eventType, raw),
            };
        }

        // Prefer Razorpay's per-delivery event id header; fall back to a stable
        // id derived from the entity so the inbox stays idempotent either way.
        const providerEventId =
            headerValue(headers, "x-razorpay-event-id") ??
            `${eventType}:${refund?.id ?? payment?.id ?? "unknown"}`;

        return {
            // An authorisation's payment (or its paid link) names the token
            // it made, which the token's own events never tie to a set-up.
            mandateLink: razorpayMandateLink(raw),
            providerEventId,
            eventType,
            outcome: outcomeFor(eventType),
            providerIntentId: payment?.order_id,
            // A refund names its payment on the refund entity too: how a
            // dashboard refund of a mismatched capture finds it (PAY-06).
            providerPaymentRef: payment?.id ?? nonEmpty(refund?.payment_id),
            // Paise, GST included, on the captured payment (`payment.captured`
            // and `order.paid` both carry it). Absent or not a whole number:
            // no fee is recorded, never a guess (default 47).
            feeCents: wholeNumber(payment?.fee),
            // The payment's amount, in paise already — Razorpay captures a
            // payment whole, so this is what was taken (PAY-06).
            capturedAmountCents: wholeNumber(payment?.amount),
            capturedCurrency: nonEmpty(payment?.currency),
            providerRefundId: refund?.id,
            // Paise already. Saroh's reference rides in `receipt`, and in
            // `notes` as a second copy (DEC-026).
            refundAmountCents: wholeNumber(refund?.amount),
            refundReference: refund
                ? (nonEmpty(refund.receipt) ?? noteReference(refund.notes))
                : undefined,
        };
    }
}

function outcomeFor(eventType: string): WebhookOutcome {
    if (eventType === "payment.captured" || eventType === "order.paid") {
        return "SUCCEEDED";
    }
    if (eventType === "payment.failed") return "FAILED";
    // Only a processed refund is money handed back: `refund.created` may
    // still fail, and `refund.speed_changed` repeats a processed one.
    if (eventType === "refund.processed") return "REFUNDED";
    if (eventType === "refund.failed") return "REFUND_FAILED";
    return "IGNORED";
}

function wholeNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
}

function nonEmpty(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

/** Razorpay sends `notes` as `[]` when there are none. */
function noteReference(
    notes: Record<string, unknown> | unknown[] | null | undefined,
): string | undefined {
    if (!notes || Array.isArray(notes)) return undefined;
    return nonEmpty(notes.saroh_refund_id);
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
