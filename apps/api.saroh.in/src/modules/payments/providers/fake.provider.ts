import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    FindRefundInput,
    MerchantProvider,
    ProviderFactory,
    RefundInput,
    RefundResult,
} from "./provider.port";
import { RefundCallError } from "./provider.port";

/**
 * Deterministic, network-free provider for tests/dev (S5-002).
 *
 * Records every call (so a test can assert it received the DECRYPTED
 * credentials and the SERVER-CALCULATED amount) and returns a stable
 * `providerIntentId` derived from the order id. Never makes an HTTP request.
 */
export class FakeMerchantProvider implements MerchantProvider {
    readonly calls: CreateOrderIntentInput[] = [];
    readonly refundCalls: RefundInput[] = [];
    readonly findCalls: FindRefundInput[] = [];
    /** The refunds made, by Saroh's reference. */
    readonly refunds = new Map<string, RefundResult>();
    private readonly refundFailures: {
        outcome: "REFUSED" | "UNKNOWN";
        madeAnyway: boolean;
    }[] = [];

    constructor(readonly name = "RAZORPAY") {}

    createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        this.calls.push(input);
        return Promise.resolve({
            providerIntentId: `fake_${this.name.toLowerCase()}_${input.orderId}`,
            clientParams: {
                fakeOrderId: `fake_${this.name.toLowerCase()}_${input.orderId}`,
                amount: input.amountCents,
                currency: input.currency,
            },
        });
    }

    refund(input: RefundInput): Promise<RefundResult> {
        this.refundCalls.push(input);
        // Like Razorpay's idempotency key: the same reference answers with
        // the refund it already made.
        const made = this.refunds.get(input.reference);
        if (made) return Promise.resolve(made);

        const failure = this.refundFailures.shift();
        if (failure && !failure.madeAnyway) {
            return Promise.reject(
                new RefundCallError("fake refund failed", failure.outcome),
            );
        }
        // A payment can be refunded more than once now (by line, U6); each
        // refund gets its own id, the first keeping the old shape.
        const nth = [...this.refunds.values()].filter((r) =>
            r.providerRefundId.startsWith(
                `fake_refund_${input.providerIntentId}`,
            ),
        ).length;
        const result: RefundResult = {
            providerRefundId:
                nth === 0
                    ? `fake_refund_${input.providerIntentId}`
                    : `fake_refund_${input.providerIntentId}_${nth + 1}`,
            status: "PENDING",
            failed: false,
        };
        this.refunds.set(input.reference, result);
        // The refund was made, but the answer never came back.
        if (failure) {
            return Promise.reject(
                new RefundCallError("fake refund timed out", failure.outcome),
            );
        }
        return Promise.resolve(result);
    }

    findRefund(input: FindRefundInput): Promise<RefundResult | null> {
        this.findCalls.push(input);
        return Promise.resolve(this.refunds.get(input.reference) ?? null);
    }

    /**
     * Make the next refund call fail: `REFUSED` makes nothing; `UNKNOWN`
     * makes nothing unless `madeAnyway` — a refund that went through while
     * the answer was lost.
     */
    failNextRefund(
        outcome: "REFUSED" | "UNKNOWN",
        opts: { madeAnyway?: boolean } = {},
    ): void {
        this.refundFailures.push({ outcome, madeAnyway: !!opts.madeAnyway });
    }
}

/**
 * A {@link ProviderFactory} that always returns the SAME fake provider,
 * regardless of the requested name. Lets a service test inject one fake and
 * assert on its recorded calls.
 */
export class FakeProviderFactory implements ProviderFactory {
    constructor(private readonly provider: FakeMerchantProvider) {}

    get(): FakeMerchantProvider {
        return this.provider;
    }
}
