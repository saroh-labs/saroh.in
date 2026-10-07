/**
 * Merchant payment-provider port (S5-002).
 *
 * A narrow, swappable interface over "create an order/intent with a provider".
 * The service depends only on this port, so the real Razorpay/Cashfree adapters
 * (which make live HTTP calls) can be replaced by the {@link FakeMerchantProvider}
 * in tests — no network, deterministic output. Decrypted credentials are passed
 * IN for the single provider call and never retained by the port.
 */

import type { CredentialCheck } from "../../../common/providers/provider-attention";
import type { FlagKey } from "../../feature-flags/flags";

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
export type { CredentialCheck } from "../../../common/providers/provider-attention";

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

/**
 * A refund call's 2xx body. One that cannot be read — cut short, or not
 * JSON — came after the provider said yes, so the refund may be made:
 * `UNKNOWN`, never a refusal.
 */
export async function readRefundAnswer<T>(
    res: Response,
    what: string,
): Promise<T> {
    try {
        return (await res.json()) as T;
    } catch {
        throw new RefundCallError(`${what}: unreadable response`, "UNKNOWN");
    }
}

/** Cancel one mandate at the provider (round-2 D20). */
export interface CancelMandateInput {
    /** The provider's mandate (or recurring token) id. */
    providerMandateId: string;
    /** The provider's customer id, where its API needs it to find the mandate. */
    providerCustomerId: string | null;
    credentials: ProviderCredentials;
}

/**
 * A mandate call that did not come back with an answer. `REFUSED`: the
 * provider definitely didn't do it and would refuse again. `UNKNOWN`: it
 * may have — a timeout, a network error, a 5xx — so Saroh asks again
 * rather than assuming either way (DEC-026). `NOT_YET`: the provider
 * won't take a debit yet — its pre-debit notice isn't delivered, or
 * `debitAfter` hasn't come (Razorpay `pre_debit_notification_not_sent`) —
 * and nothing was charged; ask again later. A cancel of a mandate the
 * provider already has cancelled is a success, never an error.
 */
export class MandateCallError extends Error {
    constructor(
        message: string,
        readonly outcome: "REFUSED" | "UNKNOWN" | "NOT_YET",
    ) {
        super(message);
        this.name = "MandateCallError";
    }
}

/**
 * How a customer can authorise autopay. A provider's authorisation takes
 * exactly one (D11 spike: a Razorpay recurring order carries one method,
 * and without one its Checkout shows cards only), so the customer picks
 * from what the business's account can set up — Saroh never narrows it
 * (DEC-059). Never a card or bank detail: only the kind.
 */
export const MANDATE_METHODS = ["UPI", "CARD", "EMANDATE"] as const;
export type MandateMethod = (typeof MANDATE_METHODS)[number];

export function isMandateMethod(value: unknown): value is MandateMethod {
    return (
        typeof value === "string" &&
        (MANDATE_METHODS as readonly string[]).includes(value)
    );
}

/**
 * How often a mandate may be charged. Saroh uses `AS_PRESENTED`: it says
 * when to charge, because renewal dates move (a pause, D8).
 */
export const MANDATE_FREQUENCIES = [
    "AS_PRESENTED",
    "WEEKLY",
    "MONTHLY",
    "QUARTERLY",
    "YEARLY",
] as const;
export type MandateFrequency = (typeof MANDATE_FREQUENCIES)[number];

/** A mandate's state as the provider reports it, in Saroh's words. */
export type ProviderMandateStatus =
    "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED" | "FAILED";

/** Start an authorisation (D11): the customer approves it at the provider. */
export interface CreateMandateSetupInput {
    /** Saroh's reference — the PaymentMandate row's id. */
    reference: string;
    method: MandateMethod;
    /** Who authorises. Only what the provider needs to reach them. */
    customer: { name: string; email: string | null; phone: string | null };
    /**
     * The authorisation's own payment, in minor units. UPI and card take at
     * least ₹1, which D12 makes the invoice's own payment; with nothing
     * owed it is the provider's minimum, refunded (the ₹1 check, DEC-064:
     * {@link MandateCapability.authorisationMinimumCents}). eMandate's is 0.
     */
    firstAmountCents: number;
    /** The most one charge may take, in minor units. */
    maxAmountCents: number;
    currency: string;
    frequency: MandateFrequency;
    /** When the authority lapses at the provider. */
    expiresAt: Date;
    /** When an unanswered set-up stops being offered. */
    setupExpiresAt: Date;
    /** What the provider's page says the authorisation is for. */
    description: string;
    /**
     * Where the provider's hosted page sends the customer back to once they
     * have approved (or left) it: a page on the business's own site (D12),
     * never Saroh's or the provider's. Absent: the adapter's default.
     */
    returnUrl?: string;
    /**
     * How the customer reaches the provider. `CHECKOUT` (the default, D12):
     * the provider's window on the business's own page, opened with
     * `clientParams`; for UPI and card `setupReference` is then the order
     * the first payment is taken on. `HOSTED_LINK`: the provider's own page
     * (`authorisationUrl`), for a set-up link sent to the customer
     * (D13/D14); Razorpay's is a registration link, whose `inv_…` is the
     * reference.
     */
    handoff?: MandateSetupHandoff;
    credentials: ProviderCredentials;
}

export type MandateSetupHandoff = "CHECKOUT" | "HOSTED_LINK";

export interface MandateSetupResult {
    providerCustomerId: string;
    /**
     * The provider's set-up object (Razorpay: the registration link's
     * `inv_…`, or the authorisation order), echoed by its webhooks.
     *
     * When `firstAmountCents` is above 0 (UPI, card), it is also the
     * provider order the first payment is made on (D12): Saroh records the
     * invoice's payment intent under it, so that payment's own capture
     * webhook pays the invoice as a pay link's does.
     */
    setupReference: string;
    /** The provider's hosted page to authorise on, when it has one. */
    authorisationUrl: string | null;
    /**
     * Non-secret parameters a checkout window needs instead. For Razorpay
     * (D19): `razorpayOrderId`, `razorpayCustomerId`, `recurring: true` and,
     * given a `returnUrl`, `callbackUrl`, which the site's window turns into
     * Checkout's `order_id`, `customer_id`, `recurring: "1"` and
     * `callback_url`.
     */
    clientParams: Record<string, unknown>;
    /**
     * The provider order the authorisation's own payment is made on, when
     * it isn't `setupReference` (Razorpay's registration link: the link is
     * `inv_…`, its payment's order `order_…`). Absent: `setupReference`.
     * Saroh records that payment's intent under it, so the capture webhook
     * finds it.
     */
    paymentReference?: string;
}

/** Read one mandate: by the provider's id, or by its set-up before that. */
export interface GetMandateInput {
    providerMandateId: string | null;
    providerCustomerId: string | null;
    setupReference: string | null;
    credentials: ProviderCredentials;
}

export interface ProviderMandate {
    status: ProviderMandateStatus;
    /** Null while the provider hasn't made the mandate (token) yet. */
    providerMandateId: string | null;
    providerCustomerId: string | null;
    method: MandateMethod | null;
    /**
     * Only what the provider returns as displayable: a masked UPI handle
     * (`as•••@okbank`) or a card's last four. Never a full VPA or number.
     */
    displayHint: string | null;
    maxAmountCents: number | null;
    expiresAt: Date | null;
    /** The provider's reason code for a failed set-up. */
    failureReason: string | null;
    /**
     * The authorisation's own payment, when the read found it (read by the
     * set-up, before the mandate is known): its provider id and whether the
     * money was captured. Lets a lost capture webhook be recovered — the ₹1
     * check is refunded all the same (DEC-064). Absent: not read.
     */
    setupPayment?: { providerPaymentRef: string; captured: boolean } | null;
}

/**
 * Step one of a charge (D11 spike): the provider's order, made with a
 * pre-debit notice. Razorpay refuses a UPI debit sooner than 25 hours after
 * the notice, so `debitAt` carries a margin ({@link PRE_DEBIT_LEAD_HOURS}).
 * A method that needs no notice answers `NOT_NEEDED` and may be charged
 * at once.
 */
export interface PrepareMandateChargeInput {
    /** Saroh's charge key (`inv_<invoiceId>_<attempt>`), the order's receipt. */
    reference: string;
    providerMandateId: string;
    providerCustomerId: string | null;
    method: MandateMethod | null;
    amountCents: number;
    currency: string;
    /** When Saroh wants the debit; not before the notice's lead time. */
    debitAt: Date;
    credentials: ProviderCredentials;
}

export type PreDebitStatus = "PENDING" | "DELIVERED" | "FAILED" | "NOT_NEEDED";

export interface PreparedMandateCharge {
    /** The provider's order id (the intent's `providerIntentId`). */
    providerIntentId: string;
    /** The earliest the debit may be asked for, as the provider took it. */
    debitAfter: Date;
    preDebitStatus: PreDebitStatus;
    /** The provider's notice id, when it has one. */
    preDebitRef: string | null;
}

/** Step two: ask for the debit on a prepared order. */
export interface MandateChargeInput {
    reference: string;
    providerIntentId: string;
    providerMandateId: string;
    providerCustomerId: string | null;
    amountCents: number;
    currency: string;
    credentials: ProviderCredentials;
}

export interface MandateChargeResult {
    /** The provider's payment id, when it gave one. */
    providerPaymentRef: string | null;
    /**
     * `PENDING`: taken, answer to come (UPI takes up to about 36 hours;
     * the payment webhook settles it). `SUCCEEDED` / `FAILED`: answered now.
     */
    status: "PENDING" | "SUCCEEDED" | "FAILED";
}

/** Read a prepared charge's notice (a webhook may be late or lost). */
export interface GetPreDebitInput {
    providerIntentId: string;
    credentials: ProviderCredentials;
}

/** Look up what became of a charge's debit (D13: Retry asks first). */
export interface FindMandateChargeInput {
    /** The prepared order (the intent's `providerIntentId`). */
    providerIntentId: string;
    credentials: ProviderCredentials;
}

/**
 * The debit on a prepared order, as the provider has it now (D13).
 * `NONE`: no debit was made on it — asking for one is safe. `PENDING`:
 * made, not answered yet. `SUCCEEDED` / `FAILED`: answered.
 */
export interface FoundMandateCharge {
    status: "NONE" | "PENDING" | "SUCCEEDED" | "FAILED";
    providerPaymentRef: string | null;
}

/**
 * Hours ahead of a debit Saroh asks for the pre-debit notice: Razorpay's
 * 25-hour minimum (D11 spike) plus a margin for the clocks and the job.
 */
export const PRE_DEBIT_LEAD_HOURS = 26;

/**
 * Autopay mandates at the business's own provider (DEC-038, D11). A
 * provider without it (Cashfree this round) never offers autopay:
 * {@link supportsMandates}. Every call throws {@link MandateCallError};
 * errors are sanitised to a code, never the provider's body or a
 * credential.
 */
export interface MandateCapability {
    /**
     * The rollout flag a business needs on before autopay is offered
     * through this adapter (Razorpay: `RAZORPAY_AUTOPAY`, D19, waves plan
     * boundary 6). It gates offering and set-up
     * (`MandateSetupService.mandateMethods`) and a renewal's charge (D13,
     * `mandateChargingOn`): off, renewals are invoiced with a pay link as
     * before. Reading and cancelling a mandate already made never wait on
     * it. None: no gate.
     */
    readonly rolloutFlag?: FlagKey;
    /**
     * The least an authorisation by each method must take, in minor units
     * (Razorpay: UPI and card 100 — ₹1; eMandate none). With nothing owed,
     * Saroh takes this as the ₹1 check and refunds it (DEC-064). A method
     * not listed authorises for 0. A per-provider constant: never a
     * literal in a service.
     */
    readonly authorisationMinimumCents?: Readonly<
        Partial<Record<MandateMethod, number>>
    >;
    /**
     * The methods this business's account can set up autopay with. Empty
     * means none: autopay isn't offered.
     */
    mandateMethods(input: {
        credentials: ProviderCredentials;
    }): Promise<MandateMethod[]>;
    /** Start an authorisation. */
    createSetup(input: CreateMandateSetupInput): Promise<MandateSetupResult>;
    /** The mandate as the provider has it now. */
    get(input: GetMandateInput): Promise<ProviderMandate>;
    /** Charge step one: the order and its pre-debit notice. */
    prepareCharge(
        input: PrepareMandateChargeInput,
    ): Promise<PreparedMandateCharge>;
    /** The prepared order's notice, as the provider has it now. */
    getPreDebit(input: GetPreDebitInput): Promise<PreDebitStatus>;
    /** Charge step two: the debit. `NOT_YET` until the notice allows it. */
    charge(input: MandateChargeInput): Promise<MandateChargeResult>;
    /**
     * What became of the debit on a prepared order (D13), so an unsure
     * answer is looked up rather than charged again (DEC-026).
     */
    findCharge(input: FindMandateChargeInput): Promise<FoundMandateCharge>;
    /** Resolves once the provider says the mandate is cancelled. */
    cancel(input: CancelMandateInput): Promise<void>;
}

export interface MerchantProvider {
    readonly name: string;
    /** Autopay mandates, when this provider's adapter has them. */
    readonly mandates?: MandateCapability;
    /**
     * Check a business's keys with one cheap authenticated read before they
     * are stored (UX-012): Razorpay `GET /payments?count=1`, Cashfree an
     * order look-up. Never throws; never logs a credential. An adapter
     * without it is not checked.
     */
    verifyCredentials?(
        credentials: ProviderCredentials,
    ): Promise<CredentialCheck>;
    /**
     * Make the provider's order for a payment. A 401 or 403 throws
     * `ProviderKeysRefusedError` (`common/providers/provider-attention.ts`),
     * so the caller can mark the connection as needing attention.
     */
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
    /**
     * The payments made on one of the provider's orders, as the provider
     * reports them now (P1). What settles a capture whose webhook never
     * came — the checkout's signed return, the pending sweep, and
     * `payments reconcile` all ask this, and never the browser, for a
     * payment's amount and state. An empty list is "no payment yet". Throws
     * a plain error when the provider could not say; the caller settles
     * nothing then. An adapter without it is never looked up.
     */
    findOrderPayments?(input: FindOrderPaymentsInput): Promise<OrderPayment[]>;
    /**
     * Whether a checkout's own return is signed by this business's account
     * (P1). Razorpay's Checkout hands back `razorpay_signature`, the hex
     * HMAC-SHA256 of `order_id|payment_id` keyed by the key secret. A
     * provider whose window returns no signature (Cashfree) has none: its
     * return is only a cue to ask {@link findOrderPayments}.
     */
    verifyCheckoutReturn?(input: CheckoutReturnInput): boolean;
}

/** Ask the provider which payments were made on one of its orders (P1). */
export interface FindOrderPaymentsInput {
    /** The provider's order id (`PaymentIntent.providerIntentId`). */
    providerIntentId: string;
    /**
     * The merchant reference the order was made under — the Order's or
     * Invoice's id — for a provider that looks orders up by it (Cashfree).
     * Null on an intent that has neither (an autopay check).
     */
    merchantRef: string | null;
    credentials: ProviderCredentials;
}

/** One payment on a provider's order, in Saroh's words (P1). */
export interface OrderPayment {
    /** The provider's payment id (Razorpay `pay_…`, Cashfree `cf_payment_id`). */
    providerPaymentRef: string;
    /**
     * CAPTURED: the money is taken — the only state that settles anything.
     * AUTHORIZED: approved but not yet captured. PENDING: under way.
     * FAILED: refused or dropped. OTHER: anything else (refunded, unknown).
     */
    status: "CAPTURED" | "AUTHORIZED" | "PENDING" | "FAILED" | "OTHER";
    /** In minor units, as the provider reports it; null when unreadable. */
    amountCents: number | null;
    currency: string | null;
    /** What the provider kept, in minor units, when it reports it. */
    feeCents?: number;
    /**
     * An authorisation's payment names the recurring token it made (D19):
     * the fields a webhook's mandate link is read from.
     */
    recurring?: {
        tokenId: string;
        customerId?: string;
        method?: string;
        invoiceId?: string;
    };
}

/** A checkout's return, as the provider's window handed it to the page. */
export interface CheckoutReturnInput {
    providerIntentId: string;
    providerPaymentRef: string;
    signature: string;
    credentials: ProviderCredentials;
}

/**
 * Whether this provider's adapter can take autopay at all (D11). Whether a
 * business is offered it — the rollout flag, then what its account can
 * set up — is `MandateSetupService.mandateMethods`, which is what any
 * screen must ask; never offer autopay on this alone.
 */
export function supportsMandates(provider: MerchantProvider): boolean {
    return provider.mandates !== undefined;
}

/** Factory over the concrete providers — injectable so tests swap in a fake. */
export interface ProviderFactory {
    get(name: string): MerchantProvider;
}

/** DI token for the {@link ProviderFactory}. */
export const PROVIDER_FACTORY = Symbol("PROVIDER_FACTORY");
