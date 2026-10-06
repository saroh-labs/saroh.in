import { createHmac, timingSafeEqual } from "node:crypto";

import type {
    BillingEventPhase,
    BillingProvider,
    BillingProviderFactory,
    CancelSubscriptionOptions,
    CreateProviderPlanInput,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    NextChargeItem,
    ParsedBillingEvent,
    ProviderChargeCapability,
    ProviderPlanCapability,
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
    /** The next `createSubscription` fails with this, once. */
    failNextCreate: BillingProviderError | null = null;

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

    cancelSubscription(
        providerSubscriptionId: string,
        options?: CancelSubscriptionOptions,
    ): Promise<void> {
        this.cancelCalls.push(providerSubscriptionId);
        this.cancelOptions.push(options);
        return Promise.resolve();
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
