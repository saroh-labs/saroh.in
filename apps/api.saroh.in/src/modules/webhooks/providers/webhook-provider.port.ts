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

/** Case-insensitive header bag as delivered on the HTTP request. */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

/** The normalized money-effect of a verified webhook. */
export type WebhookOutcome = "SUCCEEDED" | "FAILED" | "REFUNDED" | "IGNORED";

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
    /** Present on refund events — the provider refund id to settle. */
    providerRefundId?: string;
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
