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
    /**
     * The provider's own plan the subscription bills on (pricing catalogue
     * U15: `PricingProviderPlan.providerPlanId`). Its amount is the plan's
     * price with GST, set when the plan was synced; nothing here sends an
     * amount for the recurring charge.
     */
    providerPlanId?: string;
    /** When the recurring charges start; absent or null: at authorisation. */
    startAt?: Date | null;
    /**
     * How many charges the subscription makes (DEC-093: a 12-month term,
     * then a one-tap renewal). Absent: the adapter's own open-ended count.
     */
    totalCount?: number;
    /**
     * A one-off charge taken at authorisation (an upgrade's difference for
     * the rest of the period), GST included, in paise. Worked out by Saroh.
     */
    upfront?: { name: string; amountPaise: number } | null;
    /**
     * A coupon (U16): `amountPaise` (GST included, worked out by Saroh) off
     * each of the subscription's first `charges` charges. A provider that
     * can't take one off refuses (`BillingProviderError` REFUSED) rather
     * than charge the full amount.
     *
     * `razorpayOfferId` is the coupon's Razorpay Offer, made in the Razorpay
     * Dashboard: Razorpay takes a discount off only through one, applying
     * the Offer's own terms, which must match the coupon's
     * (`PRICING_ROLLOUT.md`). Razorpay refuses a coupon without one.
     */
    discount?: {
        code: string;
        amountPaise: number;
        charges: number;
        razorpayOfferId?: string | null;
    } | null;
    /** Saroh's reference for this attempt (the checkout id), for the notes. */
    reference?: string;
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
    /**
     * Where the business authorises it (the provider's hosted page), when the
     * provider makes one. Answered once to the caller; Saroh never stores it.
     */
    authorisationUrl?: string;
}

/** How a cancel ends the provider subscription. */
export interface CancelSubscriptionOptions {
    /**
     * True (the default): it runs to the end of the period already paid and
     * charges no more. False: it ends now.
     */
    atCycleEnd?: boolean;
}

/**
 * What a provider event says happened to the subscription, beyond the target
 * status (U15). The checkout and the renewal path read this; `status` alone
 * can't tell an authorisation from a renewal charge.
 */
export const BILLING_EVENT_PHASES = [
    "authenticated",
    "activated",
    "charged",
    "pending",
    "halted",
    "cancelled",
    "completed",
    "other",
] as const;
export type BillingEventPhase = (typeof BILLING_EVENT_PHASES)[number];

/** A provider plan to make: one catalogue plan row × cycle (U15). */
export interface CreateProviderPlanInput {
    /** Saroh's reference (the `PricingProviderPlan` id), kept in its notes. */
    reference: string;
    name: string;
    /** The amount per period, GST included, in paise (KTD-18). */
    amountPaise: number;
    currency: string;
    period: "month" | "year";
}

/**
 * Making the provider's plan objects (U15). Optional on the port: a provider
 * without it can't sell catalogue plans, and its rows fail to sync.
 */
export interface ProviderPlanCapability {
    /**
     * The provider plan made earlier for this reference, or null. Asked first,
     * so a retry after an unanswered create never makes a second plan.
     */
    findPlan(reference: string): Promise<string | null>;
    createPlan(input: CreateProviderPlanInput): Promise<{
        providerPlanId: string;
    }>;
}

/** A one-off item for a provider subscription's next charge (U16 add-ons). */
export interface NextChargeItem {
    providerSubscriptionId: string;
    /** Saroh's reference (the `SubscriptionAddonCharge` id), in its notes. */
    reference: string;
    name: string;
    /** GST included, in paise (KTD-18). */
    amountPaise: number;
    currency: string;
}

/**
 * Putting one-off items on a provider subscription's next charge (U16): how
 * add-ons are billed, after the period they cover. Optional on the port: a
 * provider without it can't bill add-ons, and their charges wait.
 */
export interface ProviderChargeCapability {
    addToNextCharge(
        item: NextChargeItem,
    ): Promise<{ providerChargeId: string }>;
}

/** A one-time payment to make (DEC-093: a yearly plan, paid once). */
export interface CreateOrderInput {
    /** GST included, in paise, worked out by Saroh (KTD-18). */
    amountPaise: number;
    currency: string;
    /** Saroh's reference (the checkout id), kept in the order's notes. */
    reference: string;
    organizationId: string;
    planKey: string;
}

/**
 * One-time payments (DEC-093). Optional on the port: a provider without it
 * can't sell a yearly plan.
 */
export interface ProviderOrderCapability {
    createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }>;
}

/**
 * What the provider says a checkout's subscription or order is, asked
 * directly when the business comes back from paying (DEC-093), so the plan
 * moves without waiting for the webhook. Read as the event the webhook
 * would have sent, and reconciled by the same rule.
 */
export interface CheckoutStatus {
    /** What it amounts to; `other` when it's still waiting for the business. */
    phase: BillingEventPhase;
    status: SubscriptionStatus | "IGNORED";
    /** The end of the period now paid, when the provider says. */
    currentPeriodEnd?: Date | null;
    /** The payment that paid it, when one did. */
    providerPaymentId?: string | null;
}

export interface ProviderStatusCapability {
    /** `ref` is the checkout's provider subscription id, or its order's. */
    checkoutStatus(ref: string, oneTime: boolean): Promise<CheckoutStatus>;
}

/**
 * What the browser needs to open the provider's own checkout window over
 * Saroh (DEC-093): its public key, the subscription or order to pay, and
 * the business's details pre-filled. Never a secret.
 */
export interface CheckoutHandoff {
    provider: string;
    /** The provider's public key (Razorpay's key id). */
    keyId: string;
    subscriptionId: string | null;
    orderId: string | null;
    /** An order's amount, GST included, in paise; null for a subscription. */
    amountPaise: number | null;
    currency: string;
    prefill: {
        name: string | null;
        email: string | null;
        contact: string | null;
    };
}

/**
 * A provider call that failed, classified: `REFUSED` is an answer it would
 * give again (a 4xx), `UNKNOWN` may have worked (network, timeout, 5xx, 429).
 * Never carries the request, a credential or the provider's body.
 */
export class BillingProviderError extends Error {
    constructor(
        readonly kind: "REFUSED" | "UNKNOWN",
        message: string,
    ) {
        super(message);
        this.name = "BillingProviderError";
    }
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
    /** What happened (U15); absent reads as "other". */
    phase?: BillingEventPhase;
    /** When the provider says it happened; orders late deliveries (U15). */
    eventAt?: Date | null;
    /** The end of the period the subscription is now paid to, when sent. */
    currentPeriodEnd?: Date | null;
    /**
     * The provider's id for the payment this event reports, when it carries
     * one (a `charged` event). Kept on Saroh's invoice for the charge (U17).
     */
    providerPaymentId?: string | null;
}

export interface BillingProvider {
    readonly name: string;
    /** Create the org's subscription with the provider (real adapters: HTTP). */
    createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult>;
    /** Cancel the provider subscription (real adapters: HTTP). */
    cancelSubscription(
        providerSubscriptionId: string,
        options?: CancelSubscriptionOptions,
    ): Promise<void>;
    /** Provider plan objects for the catalogue (U15); absent: can't sell them. */
    readonly plans?: ProviderPlanCapability;
    /** Items on the next charge (U16 add-ons); absent: can't bill them. */
    readonly charges?: ProviderChargeCapability;
    /** One-time payments (DEC-093 yearly); absent: can't sell yearly. */
    readonly orders?: ProviderOrderCapability;
    /** Asking how a checkout stands (DEC-093); absent: the webhook alone. */
    readonly statuses?: ProviderStatusCapability;
    /**
     * The public key the browser opens the provider's checkout with, or
     * null when there's no such window (the page link is used instead).
     */
    publicKey?(): string | null;
    /**
     * Constant-time HMAC verify over the RAW bytes using Saroh's PLATFORM
     * webhook secret (from `process.env`). Never throws on mismatch — returns
     * `false` so the caller rejects with 401 BEFORE parsing or any DB write.
     */
    verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): boolean;
    /**
     * Normalize an ALREADY-VERIFIED payload into a {@link ParsedBillingEvent}.
     * `providerEventId` must be unique per DELIVERY, not per event type: the
     * inbox drops a repeat as a duplicate (PAY-04).
     */
    parseWebhook(
        payload: unknown,
        headers?: WebhookHeaders,
    ): ParsedBillingEvent;
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
