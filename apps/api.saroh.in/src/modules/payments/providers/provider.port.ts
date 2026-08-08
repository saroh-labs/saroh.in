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
}

export interface MerchantProvider {
    readonly name: string;
    createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult>;
    /**
     * Book a refund with the provider (S5-003). Returns the provider refund id;
     * the actual money-state settlement happens asynchronously when the
     * provider's refund webhook is reconciled.
     */
    refund(input: RefundInput): Promise<RefundResult>;
}

/** Factory over the concrete providers — injectable so tests swap in a fake. */
export interface ProviderFactory {
    get(name: string): MerchantProvider;
}

/** DI token for the {@link ProviderFactory}. */
export const PROVIDER_FACTORY = Symbol("PROVIDER_FACTORY");
