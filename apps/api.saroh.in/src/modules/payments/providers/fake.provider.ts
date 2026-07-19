import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    MerchantProvider,
    ProviderFactory,
} from "./provider.port";

/**
 * Deterministic, network-free provider for tests/dev (S5-002).
 *
 * Records every call (so a test can assert it received the DECRYPTED
 * credentials and the SERVER-CALCULATED amount) and returns a stable
 * `providerIntentId` derived from the order id. Never makes an HTTP request.
 */
export class FakeMerchantProvider implements MerchantProvider {
    readonly calls: CreateOrderIntentInput[] = [];

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
