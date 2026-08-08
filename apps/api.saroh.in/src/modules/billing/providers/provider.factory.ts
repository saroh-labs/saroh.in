import type { Provider } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";

import type {
    BillingProvider,
    BillingProviderFactory,
} from "./billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "./billing-provider.port";
import { CashfreeBillingProvider } from "./cashfree.provider";
import { RazorpayBillingProvider } from "./razorpay.provider";

/**
 * Default {@link BillingProviderFactory}: resolves a provider name to its
 * concrete platform adapter. Constructed once; the adapters are stateless (they
 * read Saroh's platform secrets from `process.env` per call), so a single
 * instance is shared. An unknown provider name is a 404.
 */
export class DefaultBillingProviderFactory implements BillingProviderFactory {
    private readonly byName: Map<string, BillingProvider>;

    constructor(providers: BillingProvider[] = defaultProviders()) {
        this.byName = new Map(providers.map((p) => [p.name, p]));
    }

    get(name: string): BillingProvider {
        const provider = this.byName.get(name.toUpperCase());
        if (!provider) {
            throw new NotFoundException(`Unknown billing provider "${name}"`);
        }
        return provider;
    }
}

function defaultProviders(): BillingProvider[] {
    return [new RazorpayBillingProvider(), new CashfreeBillingProvider()];
}

/**
 * Nest provider exposing the {@link BillingProviderFactory} under
 * {@link BILLING_PROVIDER_FACTORY}. Tests construct the services directly with a
 * `FakeBillingProviderFactory` instead.
 */
export const billingProviderFactoryProvider: Provider = {
    provide: BILLING_PROVIDER_FACTORY,
    useFactory: (): BillingProviderFactory =>
        new DefaultBillingProviderFactory(),
};
