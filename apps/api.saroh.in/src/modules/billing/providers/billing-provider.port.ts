/**
 * Saroh billing-provider port (S7-005).
 *
 * A narrow, swappable interface over Saroh's OWN (platform) billing provider:
 * create/cancel an Organization's subscription and verify + normalize the
 * provider's billing webhooks. The services depend only on this port, so the
 * real Razorpay/Cashfree adapters (live HTTP + real HMAC) can be replaced by the
 * {@link FakeBillingProvider} in tests — deterministic, no network.
 *
 * CREDENTIAL BOUNDARY: adapters read ONLY Saroh's platform `SAROH_*` keys from
 * `process.env` (see platform-secrets.ts). They NEVER read a per-org merchant
 * credential (`MerchantPaymentProvider`) — Saroh billing (charging orgs) is
 * completely separate from merchant payments (an org charging its customers).
 */

/** The closed set of billing providers Saroh's platform can bill through. */
export const SUPPORTED_BILLING_PROVIDERS = ["RAZORPAY", "CASHFREE"] as const;
export type SupportedBillingProvider =
    (typeof SUPPORTED_BILLING_PROVIDERS)[number];

/** Type guard for a runtime string against {@link SUPPORTED_BILLING_PROVIDERS}. */
export function isSupportedBillingProvider(
    value: string,
): value is SupportedBillingProvider {
    return (SUPPORTED_BILLING_PROVIDERS as readonly string[]).includes(value);
}

/** The subscription lifecycle states, canonical across the module. */
export const SUBSCRIPTION_STATUSES = [
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Case-insensitive header bag as delivered on the HTTP request. */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

/**
 * What the provider needs to create a subscription. `planKey` is the catalog
 * key; the price/currency/interval are the resolved Plan terms; the org id lets
 * the provider tag its customer. NO merchant credentials are ever passed.
 */
export interface CreateSubscriptionInput {
    planKey: string;
    planId: string;
    priceCents: number;
    currency: string;
    interval: string;
    organizationId: string;
}

/** The provider's accepted-subscription receipt. */
export interface CreateSubscriptionResult {
    /** The provider's subscription id — stored on `Subscription`. */
    providerSubscriptionId: string;
    /** The provider's customer id, when the provider issues one. */
    providerCustomerId?: string;
    /** The subscription status the provider starts it in. */
    status: SubscriptionStatus;
    /** The end of the first paid period, when the provider reports it. */
    currentPeriodEnd?: Date | null;
}

/**
 * A provider-agnostic view of one VERIFIED billing webhook. The subscription
 * state machine is driven off this shape, never off raw provider JSON. `status`
 * is the target subscription status, or `"IGNORED"` for an event that carries
 * no state change.
 */
export interface ParsedBillingEvent {
    /** The raw provider event/type string, for audit (e.g. "subscription.charged"). */
    type: string;
    /** Stable per-event idempotency id — the inbox `(provider, providerEventId)`. */
    providerEventId: string;
    /** The provider's subscription id this event concerns (matches `Subscription`). */
    providerSubscriptionId?: string;
    /** The normalized target status, or `"IGNORED"` for a non-state event. */
    status: SubscriptionStatus | "IGNORED";
}

export interface BillingProvider {
    readonly name: string;
    /** Create the org's subscription with the provider (real adapters: HTTP). */
    createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult>;
    /** Cancel the provider subscription (real adapters: HTTP). */
    cancelSubscription(providerSubscriptionId: string): Promise<void>;
    /**
     * Constant-time HMAC verify over the RAW bytes using Saroh's PLATFORM
     * webhook secret (from `process.env`). Never throws on mismatch — returns
     * `false` so the caller rejects with 401 BEFORE parsing or any DB write.
     */
    verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): boolean;
    /** Normalize an ALREADY-VERIFIED payload into a {@link ParsedBillingEvent}. */
    parseWebhook(payload: unknown): ParsedBillingEvent;
}

/** Factory over the concrete providers — injectable so tests swap in a fake. */
export interface BillingProviderFactory {
    get(name: string): BillingProvider;
}

/** DI token for the {@link BillingProviderFactory}. */
export const BILLING_PROVIDER_FACTORY = Symbol("BILLING_PROVIDER_FACTORY");

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
