/**
 * Inbound webhook provider port (S5-003).
 *
 * A narrow, swappable interface over "verify the signature of, and normalize,
 * an inbound provider webhook". The webhook service depends only on this port,
 * so the real Razorpay/Cashfree verifiers (real HMAC math) can be replaced by a
 * {@link FakeWebhookProvider} in tests — deterministic, no network.
 *
 * SECURITY: `verifySignature` is called on the RAW request bytes BEFORE the
 * body is ever parsed or trusted. A forged/altered body fails the constant-time
 * HMAC compare and is rejected with 401 — it never reaches {@link parseEvent},
 * the inbox, or reconciliation.
 */

import type { ReportedMandateChange } from "../../payments/mandate-rules";

/** Case-insensitive header bag as delivered on the HTTP request. */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

/**
 * The normalized money-effect of a verified webhook. `REFUNDED` is money the
 * provider has handed back; `REFUND_FAILED` is a refund it definitely did
 * not make (Razorpay `refund.failed`, Cashfree CANCELLED/FAILED/REJECTED).
 */
export type WebhookOutcome =
    | "SUCCEEDED"
    | "FAILED"
    | "REFUNDED"
    | "REFUND_FAILED"
    | "MANDATE"
    | "PRE_DEBIT"
    | "IGNORED";

/**
 * A mandate's state as a verified webhook reports it (D11): Razorpay's
 * `token.confirmed` → ACTIVE, `token.paused` → PAUSED, `token.cancelled` →
 * CANCELLED, `token.rejected` → FAILED. Defined beside the mandate rules.
 */
export type WebhookMandateChange = ReportedMandateChange;

/**
 * A provider-agnostic view of one verified webhook event. All money-state
 * reconciliation is driven off this shape, never off raw provider JSON.
 */
export interface NormalizedWebhookEvent {
    /** Stable per-event idempotency id — the inbox `(provider, providerEventId)`. */
    providerEventId: string;
    /** The raw provider event/type string, for audit (e.g. "payment.captured"). */
    eventType: string;
    /** The normalized effect this event has on payment state. */
    outcome: WebhookOutcome;
    /** The provider's order/intent id (matches `PaymentIntent.providerIntentId`). */
    providerIntentId?: string;
    /** The merchant order id we submitted at create time (fallback intent match). */
    orderRef?: string;
    /** The provider payment id (stored so a later refund can reference it). */
    providerPaymentRef?: string;
    /**
     * On a successful payment: what the provider kept from it, in minor
     * units, when its payload reports a fee (plan 005 E19, default 47).
     * Absent when it reports none — Saroh never estimates one.
     */
    feeCents?: number;
    /** Present on refund events — the provider refund id to settle. */
    providerRefundId?: string;
    /**
     * On refund events: what the provider refunded, in minor units (paise).
     * The row a webhook creates is made at this amount, never the payment's.
     */
    refundAmountCents?: number;
    /**
     * On refund events: Saroh's own reference, echoed back — the
     * PaymentRefund id sent as Razorpay's `receipt`/`notes` or Cashfree's
     * `refund_id` (DEC-026). Absent on a refund made in the provider's
     * dashboard.
     */
    refundReference?: string;
    /** On `MANDATE`: what became of the mandate. */
    mandate?: WebhookMandateChange;
    /**
     * On `PRE_DEBIT`: the charge order's notice (Razorpay
     * `order.notification.delivered` / `.failed`), found by
     * `providerIntentId`.
     */
    preDebitStatus?: "DELIVERED" | "FAILED";
    /**
     * An authorisation's own payment names the mandate it made (D19):
     * Razorpay's token webhooks carry no customer, order or link, so the
     * token id reaches a PENDING mandate only through the payment (or the
     * paid registration link) that set it up. Applied beside `outcome`,
     * whatever that is.
     */
    mandateLink?: WebhookMandateLink;
}

/** A set-up (by any of its references) → the provider's mandate id. */
export interface WebhookMandateLink {
    providerMandateId: string;
    providerCustomerId?: string;
    /** The set-up's references as the payment carries them (link, order). */
    setupReferences: string[];
}

export interface VerifySignatureInput {
    rawBody: Buffer;
    headers: WebhookHeaders;
    secret: string;
}

export interface ParseEventInput {
    payload: unknown;
    headers: WebhookHeaders;
}

export interface WebhookProvider {
    readonly name: string;
    /** Constant-time HMAC verify over the RAW bytes. Never throws on mismatch. */
    verifySignature(input: VerifySignatureInput): boolean;
    /** Normalize an ALREADY-VERIFIED payload. */
    parseEvent(input: ParseEventInput): NormalizedWebhookEvent;
    /** The signature header value to persist for audit (may be absent). */
    signatureHeader(headers: WebhookHeaders): string | undefined;
}

/** Factory over the concrete webhook providers — injectable so tests swap a fake. */
export interface WebhookProviderFactory {
    get(name: string): WebhookProvider;
}

/** DI token for the {@link WebhookProviderFactory}. */
export const WEBHOOK_PROVIDER_FACTORY = Symbol("WEBHOOK_PROVIDER_FACTORY");

/** Read a single header value case-insensitively (first value if repeated). */
export function headerValue(
    headers: WebhookHeaders,
    name: string,
): string | undefined {
    const target = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === target) {
            const value = headers[key];
            return Array.isArray(value) ? value[0] : value;
        }
    }
    return undefined;
}
