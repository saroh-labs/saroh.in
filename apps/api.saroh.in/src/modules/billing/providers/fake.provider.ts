import { createHmac, timingSafeEqual } from "node:crypto";

import type {
    BillingCustomer,
    BillingEventPhase,
    BillingProvider,
    BillingProviderFactory,
    CancelSubscriptionOptions,
    CheckoutStatus,
    CreateOrderInput,
    CreateProviderPlanInput,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    CustomerCreated,
    NextChargeItem,
    ParsedBillingEvent,
    ProviderChargeCapability,
    ProviderCustomer,
    ProviderCustomerCapability,
    ProviderDisputeEvent,
    ProviderOrderCapability,
    ProviderPaidCharge,
    ProviderPaymentNotesCapability,
    ProviderPlanCapability,
    ProviderReconcileCapability,
    ProviderRefundCapability,
    ProviderRefundEvent,
    ProviderStatusCapability,
    SubscriptionStanding,
    SubscriptionStatus,
    WebhookHeaders,
} from "./billing-provider.port";
import { BillingProviderError, headerValue } from "./billing-provider.port";

/**
 * The fake's provider plans (U15): kept by reference, so `findPlan` finds
 * what an earlier `createPlan` made, as a real provider's list would. A test
 * queues failures with {@link failNext}.
 */
export class FakeProviderPlans implements ProviderPlanCapability {
    readonly created: CreateProviderPlanInput[] = [];
    private readonly byReference = new Map<string, string>();
    private readonly failures: ("REFUSED" | "UNKNOWN" | "UNKNOWN_MADE")[] = [];

    /**
     * The next `createPlan` calls fail, in order. `UNKNOWN_MADE` makes the
     * plan and then answers as if the network dropped: the case `findPlan`
     * exists for.
     */
    failNext(...kinds: ("REFUSED" | "UNKNOWN" | "UNKNOWN_MADE")[]): void {
        this.failures.push(...kinds);
    }

    findPlan(reference: string): Promise<string | null> {
        return Promise.resolve(this.byReference.get(reference) ?? null);
    }

    createPlan(
        input: CreateProviderPlanInput,
    ): Promise<{ providerPlanId: string }> {
        const failure = this.failures.shift();
        if (failure === "REFUSED") {
            return Promise.reject(
                new BillingProviderError("REFUSED", "plan refused (HTTP 400)"),
            );
        }
        if (failure === "UNKNOWN") {
            return Promise.reject(
                new BillingProviderError("UNKNOWN", "network error"),
            );
        }
        this.created.push(input);
        const providerPlanId = `fake_plan_${input.reference}`;
        this.byReference.set(input.reference, providerPlanId);
        if (failure === "UNKNOWN_MADE") {
            return Promise.reject(
                new BillingProviderError("UNKNOWN", "network error"),
            );
        }
        return Promise.resolve({ providerPlanId });
    }
}

/**
 * The fake's next-charge items (U16 add-ons): each one recorded, keyed by
 * Saroh's reference so a repeat for one reference returns the same id, as a
 * provider asked twice should. A test queues failures with {@link failNext}.
 */
export class FakeProviderCharges implements ProviderChargeCapability {
    readonly added: NextChargeItem[] = [];
    private readonly byReference = new Map<string, string>();
    private readonly failures: ("REFUSED" | "UNKNOWN")[] = [];

    failNext(...kinds: ("REFUSED" | "UNKNOWN")[]): void {
        this.failures.push(...kinds);
    }

    addToNextCharge(
        item: NextChargeItem,
    ): Promise<{ providerChargeId: string }> {
        const failure = this.failures.shift();
        if (failure) {
            return Promise.reject(
                new BillingProviderError(
                    failure,
                    failure === "REFUSED"
                        ? "item refused (HTTP 400)"
                        : "network error",
                ),
            );
        }
        const known = this.byReference.get(item.reference);
        if (known) return Promise.resolve({ providerChargeId: known });
        this.added.push(item);
        const providerChargeId = `fake_item_${item.reference}`;
        this.byReference.set(item.reference, providerChargeId);
        return Promise.resolve({ providerChargeId });
    }
}

/** The fake's one-time payments (DEC-093): each order recorded. */
export class FakeProviderOrders implements ProviderOrderCapability {
    readonly created: CreateOrderInput[] = [];

    createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }> {
        this.created.push(input);
        return Promise.resolve({
            providerOrderId: `fake_order_${input.reference}`,
        });
    }
}

/**
 * The fake's provider customers, as Razorpay with `fail_existing: "1"`:
 * one per email and phone, a second refused as `exists` (and handed back
 * by {@link existingCustomer}, as `fail_existing: "0"` does); the same
 * email without a phone is a new one; an update to another's email and
 * phone is `exists`. Every create and update recorded; a test turns the
 * keys off with {@link keys}, queues a failure, loses the next create's
 * answer after making it ({@link loseNextAnswer}), or adds a customer the
 * provider made itself ({@link addCustomer}).
 */
export class FakeProviderCustomers implements ProviderCustomerCapability {
    readonly created: { input: BillingCustomer; withContact: boolean }[] = [];
    readonly updated: {
        providerCustomerId: string;
        input: BillingCustomer;
        withContact: boolean;
    }[] = [];
    readonly looked: string[] = [];
    keys = true;
    failNext: BillingProviderError | null = null;
    loseNextAnswer = false;
    private readonly byEmailPhone = new Map<string, string>();
    private readonly byId = new Map<string, string | null>();

    configured(): boolean {
        return this.keys;
    }

    /** A customer the provider holds already, with its notes' business. */
    addCustomer(providerCustomerId: string, organizationId: string | null) {
        this.byId.set(providerCustomerId, organizationId);
    }

    private take(): Promise<never> | null {
        if (!this.failNext) return null;
        const error = this.failNext;
        this.failNext = null;
        return Promise.reject(error);
    }

    private key(input: BillingCustomer, withContact: boolean) {
        const contact = withContact ? input.contact : null;
        return input.email && contact ? `${input.email}|${contact}` : null;
    }

    private make(input: BillingCustomer, withContact: boolean): string {
        let id = `fake_cus_${input.organizationId}`;
        for (let n = 2; this.byId.has(id); n += 1) {
            id = `fake_cus_${input.organizationId}_${n}`;
        }
        this.byId.set(id, input.organizationId);
        const key = this.key(input, withContact);
        if (key) this.byEmailPhone.set(key, id);
        this.created.push({ input, withContact });
        return id;
    }

    createCustomer(
        input: BillingCustomer,
        options: { withContact: boolean },
    ): Promise<CustomerCreated> {
        const failed = this.take();
        if (failed) return failed;
        const key = this.key(input, options.withContact);
        if (key && this.byEmailPhone.has(key)) return Promise.resolve("exists");
        const id = this.make(input, options.withContact);
        if (this.loseNextAnswer) {
            this.loseNextAnswer = false;
            return Promise.reject(
                new BillingProviderError(
                    "UNKNOWN",
                    "Razorpay customer creation failed: network error",
                ),
            );
        }
        return Promise.resolve({ providerCustomerId: id });
    }

    existingCustomer(
        input: BillingCustomer,
        options: { withContact: boolean },
    ): Promise<ProviderCustomer> {
        const failed = this.take();
        if (failed) return failed;
        const key = this.key(input, options.withContact);
        const id =
            (key && this.byEmailPhone.get(key)) ??
            this.make(input, options.withContact);
        return Promise.resolve({
            providerCustomerId: id,
            organizationId: this.byId.get(id) ?? null,
        });
    }

    findCustomer(providerCustomerId: string): Promise<ProviderCustomer | null> {
        const failed = this.take();
        if (failed) return failed;
        this.looked.push(providerCustomerId);
        return Promise.resolve(
            this.byId.has(providerCustomerId)
                ? {
                      providerCustomerId,
                      organizationId: this.byId.get(providerCustomerId) ?? null,
                  }
                : null,
        );
    }

    updateCustomer(
        providerCustomerId: string,
        input: BillingCustomer,
        options: { withContact: boolean },
    ): Promise<"updated" | "exists"> {
        const failed = this.take();
        if (failed) return failed;
        const key = this.key(input, options.withContact);
        const holder = key ? this.byEmailPhone.get(key) : undefined;
        if (holder && holder !== providerCustomerId) {
            return Promise.resolve("exists");
        }
        if (key) this.byEmailPhone.set(key, providerCustomerId);
        this.updated.push({
            providerCustomerId,
            input,
            withContact: options.withContact,
        });
        return Promise.resolve("updated");
    }
}

/**
 * The fake's payment notes (17 Oct 2026): every call recorded; a test
 * queues a failure with {@link failNext}.
 */
export class FakeProviderPaymentNotes implements ProviderPaymentNotesCapability {
    readonly set: {
        providerPaymentId: string;
        notes: Record<string, string>;
    }[] = [];
    failNext: BillingProviderError | null = null;

    setPaymentNotes(input: {
        providerPaymentId: string;
        notes: Record<string, string>;
    }): Promise<void> {
        if (this.failNext) {
            const error = this.failNext;
            this.failNext = null;
            return Promise.reject(error);
        }
        this.set.push(input);
        return Promise.resolve();
    }
}

/**
 * The fake's refunds (DEC-164): one per payment, however often asked, as
 * Razorpay refuses to refund more than was paid. A test queues failures
 * with {@link failNext}; a refusal carries Razorpay-like words.
 */
export class FakeProviderRefunds implements ProviderRefundCapability {
    readonly refunded: {
        providerPaymentId: string;
        reference: string;
        organizationId?: string | null;
        providerSubscriptionId?: string | null;
        reason?: string | null;
    }[] = [];
    readonly asked: string[] = [];
    /** What a refund answers it gave back; null: the provider didn't say. */
    amountPaise: number | null = null;
    private readonly failures: BillingProviderError[] = [];

    failNext(...kinds: ("REFUSED" | "UNKNOWN")[]): void {
        this.failures.push(
            ...kinds.map((kind) =>
                kind === "REFUSED"
                    ? new BillingProviderError(
                          kind,
                          "Razorpay payment refund failed (HTTP 400): invalid request sent",
                          "invalid request sent",
                      )
                    : new BillingProviderError(
                          kind,
                          "Razorpay payment refund failed: network error",
                      ),
            ),
        );
    }

    refundPayment(input: {
        providerPaymentId: string;
        reference: string;
        organizationId?: string | null;
        providerSubscriptionId?: string | null;
        reason?: string | null;
    }): Promise<{ providerRefundId: string; amountPaise: number | null }> {
        this.asked.push(input.providerPaymentId);
        const failure = this.failures.shift();
        if (failure) return Promise.reject(failure);
        if (
            !this.refunded.some(
                (r) => r.providerPaymentId === input.providerPaymentId,
            )
        ) {
            this.refunded.push(input);
        }
        return Promise.resolve({
            providerRefundId: `fake_rfnd_${input.providerPaymentId}`,
            amountPaise: this.amountPaise,
        });
    }
}

/**
 * What the fake says it took on a subscription or order (DEC-166): set per
 * reference by a test, else nothing. A test makes it fail with
 * {@link failNext}.
 */
export class FakeProviderReconcile implements ProviderReconcileCapability {
    readonly asked: { ref: string; oneTime: boolean }[] = [];
    private readonly byRef = new Map<string, ProviderPaidCharge[]>();
    failNext: BillingProviderError | null = null;

    set(ref: string, charges: ProviderPaidCharge[]): void {
        this.byRef.set(ref, charges);
    }

    paidCharges(ref: string, oneTime: boolean): Promise<ProviderPaidCharge[]> {
        this.asked.push({ ref, oneTime });
        if (this.failNext) {
            const error = this.failNext;
            this.failNext = null;
            return Promise.reject(error);
        }
        return Promise.resolve(this.byRef.get(ref) ?? []);
    }
}

/**
 * What the fake says a checkout stands at when asked (DEC-093): set per
 * reference by a test, else still waiting. Every question is recorded.
 */
export class FakeProviderStatuses implements ProviderStatusCapability {
    readonly asked: { ref: string; oneTime: boolean }[] = [];
    private readonly byRef = new Map<string, CheckoutStatus>();
    failNext: BillingProviderError | null = null;

    set(ref: string, status: CheckoutStatus): void {
        this.byRef.set(ref, status);
    }

    /** What `subscriptionStanding` answers, per reference; else `unknown`. */
    readonly standings = new Map<string, SubscriptionStanding>();

    subscriptionStanding(ref: string): Promise<SubscriptionStanding> {
        return Promise.resolve(this.standings.get(ref) ?? "unknown");
    }

    checkoutStatus(ref: string, oneTime: boolean): Promise<CheckoutStatus> {
        this.asked.push({ ref, oneTime });
        if (this.failNext) {
            const error = this.failNext;
            this.failNext = null;
            return Promise.reject(error);
        }
        return Promise.resolve(
            this.byRef.get(ref) ?? { phase: "other", status: "IGNORED" },
        );
    }
}

/**
 * Deterministic, network-free billing provider for tests/dev (S7-005).
 *
 * Records every create/cancel call (so a test can assert the resolved plan
 * terms were passed and NO merchant credential leaked in) and returns a stable
 * `providerSubscriptionId`: from the checkout's reference when one is given
 * (U15), else from the org id. `verifyWebhook` runs a REAL HMAC-SHA256 hex
 * compare against a constructor secret (so a valid-signature test exercises
 * genuine crypto and a forged/absent one fails), and `parseWebhook` reads the
 * already-verified body straight through. Never makes an HTTP request and
 * never touches `process.env`.
 */
export class FakeBillingProvider implements BillingProvider {
    readonly createCalls: CreateSubscriptionInput[] = [];
    readonly cancelCalls: string[] = [];
    readonly cancelOptions: (CancelSubscriptionOptions | undefined)[] = [];
    readonly plans = new FakeProviderPlans();
    readonly charges = new FakeProviderCharges();
    readonly orders = new FakeProviderOrders();
    readonly customers = new FakeProviderCustomers();
    readonly statuses = new FakeProviderStatuses();
    readonly paymentNotes = new FakeProviderPaymentNotes();
    readonly refunds = new FakeProviderRefunds();
    readonly reconcile = new FakeProviderReconcile();
    /** The public key Checkout would open with; null: no window. */
    publicKeyValue: string | null = null;
    /** The next `createSubscription` fails with this, once. */
    failNextCreate: BillingProviderError | null = null;
    /** The next `cancelSubscription` calls fail with these, in order. */
    readonly failCancels: BillingProviderError[] = [];

    constructor(
        readonly name = "RAZORPAY",
        private readonly secret = "whsec_fake_platform_secret",
    ) {}

    createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        if (this.failNextCreate) {
            const error = this.failNextCreate;
            this.failNextCreate = null;
            return Promise.reject(error);
        }
        // Like Razorpay: a coupon goes through only with its Razorpay Offer,
        // and is refused, asking nothing, without one.
        if (
            this.name === "RAZORPAY" &&
            input.discount &&
            input.discount.amountPaise > 0 &&
            !input.discount.razorpayOfferId
        ) {
            return Promise.reject(
                new BillingProviderError(
                    "REFUSED",
                    "fake subscription refused: the coupon has no Razorpay offer",
                ),
            );
        }
        this.createCalls.push(input);
        const id = input.reference
            ? `fake_sub_${input.reference}`
            : `fake_sub_${input.organizationId}`;
        return Promise.resolve({
            providerSubscriptionId: id,
            providerCustomerId: `fake_cus_${input.organizationId}`,
            // A catalogue checkout waits for the business to authorise it.
            status: input.providerPlanId ? "TRIALING" : "ACTIVE",
            ...(input.providerPlanId
                ? { authorisationUrl: `https://pay.fake.test/${id}` }
                : {}),
        });
    }

    publicKey(): string | null {
        return this.publicKeyValue;
    }

    cancelSubscription(
        providerSubscriptionId: string,
        options?: CancelSubscriptionOptions,
    ): Promise<void> {
        this.cancelCalls.push(providerSubscriptionId);
        this.cancelOptions.push(options);
        const failure = this.failCancels.shift();
        return failure ? Promise.reject(failure) : Promise.resolve();
    }

    verifyWebhook(rawBody: Buffer, headers: WebhookHeaders): boolean {
        const provided = headerValue(headers, "x-fake-signature");
        if (!provided) return false;
        const expected = createHmac("sha256", this.secret)
            .update(rawBody)
            .digest("hex");
        if (provided.length !== expected.length) return false;
        try {
            return timingSafeEqual(
                Buffer.from(provided, "hex"),
                Buffer.from(expected, "hex"),
            );
        } catch {
            return false;
        }
    }

    parseWebhook(payload: unknown): ParsedBillingEvent {
        const body = (payload ?? {}) as {
            type?: string;
            providerEventId?: string;
            providerSubscriptionId?: string;
            status?: SubscriptionStatus | "IGNORED";
            phase?: BillingEventPhase;
            eventAt?: string;
            currentPeriodEnd?: string | null;
            providerPaymentId?: string;
            paymentAmountPaise?: number;
            providerCustomerId?: string;
            refund?: ProviderRefundEvent;
            dispute?: ProviderDisputeEvent;
        };
        return {
            type: body.type ?? "unknown",
            providerEventId: body.providerEventId ?? "evt_unknown",
            providerSubscriptionId: body.providerSubscriptionId,
            status: body.status ?? "IGNORED",
            ...(body.phase ? { phase: body.phase } : {}),
            ...(body.eventAt ? { eventAt: new Date(body.eventAt) } : {}),
            ...(body.currentPeriodEnd !== undefined
                ? {
                      currentPeriodEnd: body.currentPeriodEnd
                          ? new Date(body.currentPeriodEnd)
                          : null,
                  }
                : {}),
            ...(body.providerPaymentId
                ? { providerPaymentId: body.providerPaymentId }
                : {}),
            ...(typeof body.paymentAmountPaise === "number"
                ? { paymentAmountPaise: body.paymentAmountPaise }
                : {}),
            ...(body.providerCustomerId
                ? { providerCustomerId: body.providerCustomerId }
                : {}),
            ...(body.refund ? { refund: body.refund } : {}),
            ...(body.dispute ? { dispute: body.dispute } : {}),
        };
    }
}

/** A {@link BillingProviderFactory} that always returns the SAME fake. */
export class FakeBillingProviderFactory implements BillingProviderFactory {
    constructor(private readonly provider: FakeBillingProvider) {}

    get(): FakeBillingProvider {
        return this.provider;
    }
}
