import type { Provider } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";

import { CashfreeProvider } from "./cashfree.provider";
import type { MerchantProvider, ProviderFactory } from "./provider.port";
import { PROVIDER_FACTORY } from "./provider.port";
import { RazorpayProvider } from "./razorpay.provider";

/**
 * Default {@link ProviderFactory}: resolves a provider name to its concrete
 * adapter. Constructed once; the adapters are stateless (credentials are passed
 * per call), so a single instance is shared across requests.
 */
export class DefaultProviderFactory implements ProviderFactory {
    private readonly byName: Map<string, MerchantProvider>;

    constructor(providers: MerchantProvider[] = defaultProviders()) {
        this.byName = new Map(providers.map((p) => [p.name, p]));
    }

    get(name: string): MerchantProvider {
        const provider = this.byName.get(name);
        if (!provider) {
            throw new BadRequestException(
                `Unsupported payment provider "${name}"`,
            );
        }
        return provider;
    }
}

function defaultProviders(): MerchantProvider[] {
    return [new RazorpayProvider(), new CashfreeProvider()];
}

/**
 * Nest provider exposing the {@link ProviderFactory} under
 * {@link PROVIDER_FACTORY}. Tests construct {@link PaymentsService} directly
 * with a `FakeProviderFactory` instead.
 */
export const providerFactoryProvider: Provider = {
    provide: PROVIDER_FACTORY,
    useFactory: (): ProviderFactory => new DefaultProviderFactory(),
};
