/**
 * Merchant payment-provider port (S5-002).
 *
 * A narrow, swappable interface over "create an order/intent with a provider".
 * The service depends only on this port, so the real Razorpay/Cashfree adapters
 * (which make live HTTP calls) can be replaced by the {@link FakeMerchantProvider}
 * in tests — no network, deterministic output. Decrypted credentials are passed
 * IN for the single provider call and never retained by the port.
 */

/** The closed set of providers this app can connect. */
export const SUPPORTED_PROVIDERS = ["RAZORPAY", "CASHFREE"] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/** Type guard for a runtime string against {@link SUPPORTED_PROVIDERS}. */
export function isSupportedProvider(value: string): value is SupportedProvider {
    return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Decrypted provider credentials — the plaintext that only ever exists
 * in-memory at the moment of a provider call. `keyId` is the public
 * identifier; `keySecret` is the secret that is NEVER logged or returned.
 */
export interface ProviderCredentials {
    keyId: string;
    keySecret: string;
}

export interface CreateOrderIntentInput {
    /** Server-calculated minor units (e.g. paise/cents). Never client-supplied. */
    amountCents: number;
    currency: string;
    /**
     * The merchant reference the provider records and echoes back in its
     * webhooks: the Order's id, or the Invoice's id for a pay link (U13).
     */
    orderId: string;
    credentials: ProviderCredentials;
}

export interface CreateOrderIntentResult {
    /** The provider's order/intent id (e.g. Razorpay order_id, Cashfree cf id). */
    providerIntentId: string;
    /**
     * Non-secret parameters the client SDK needs to render checkout. MUST NOT
     * contain the key secret.
     */
    clientParams: Record<string, unknown>;
}

export interface RefundInput {
    /**
     * Saroh's own reference for this refund — the PaymentRefund row's id. One
     * row is one refund at the provider: it is the idempotency key (Razorpay)
     * or the merchant `refund_id` (Cashfree), so a retry never makes a
     * second refund and two equal partial refunds are still two.
     */
    reference: string;
    /** The provider's order/intent id the refund is booked against. */
    providerIntentId: string;
    /** The provider's payment id (from the capture webhook), when known. */
    providerPaymentRef?: string | null;
    /** Server-derived minor units to refund. Never client-supplied. */
    amountCents: number;
    currency: string;
    credentials: ProviderCredentials;
}

export interface RefundResult {
    /** The provider's refund id — later echoed by the refund webhook. */
    providerRefundId: string;
    /** The provider's refund status (e.g. "PENDING" | "PROCESSED"). */
    status: string;
    /** The provider says this refund failed or was cancelled — nothing went back. */
    failed: boolean;
}

/** Look a refund up at the provider by Saroh's reference. */
export type FindRefundInput = Omit<RefundInput, "amountCents" | "currency">;

/**
 * A refund call that did not come back with a refund. `REFUSED`: the
 * provider definitely made none (a 4xx it would give again), so the money
 * and lines are free. `UNKNOWN`: it may have made one — a network error, a
 * timeout, a 5xx, a request still in flight — so nothing may be freed until
 * the provider says (the webhook, or a try-again that looks first).
 */
export class RefundCallError extends Error {
    constructor(
        message: string,
        readonly outcome: "REFUSED" | "UNKNOWN",
    ) {
        super(message);
        this.name = "RefundCallError";
    }
}

export interface MerchantProvider {
    readonly name: string;
    createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult>;
    /**
     * Book a refund with the provider (S5-003). Returns the provider refund id;
     * the actual money-state settlement happens asynchronously when the
     * provider's refund webhook is reconciled. Throws {@link RefundCallError}.
     */
    refund(input: RefundInput): Promise<RefundResult>;
    /**
     * The refund made under `reference`, or null when the provider has none.
     * Throws {@link RefundCallError} (`UNKNOWN`) when it could not say.
     */
    findRefund(input: FindRefundInput): Promise<RefundResult | null>;
}

/** Factory over the concrete providers — injectable so tests swap in a fake. */
export interface ProviderFactory {
    get(name: string): MerchantProvider;
}

/** DI token for the {@link ProviderFactory}. */
export const PROVIDER_FACTORY = Symbol("PROVIDER_FACTORY");
