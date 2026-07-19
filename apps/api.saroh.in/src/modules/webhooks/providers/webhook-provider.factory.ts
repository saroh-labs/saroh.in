import type { Provider } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";

import { CashfreeWebhookProvider } from "./cashfree.webhook";
import { RazorpayWebhookProvider } from "./razorpay.webhook";
import type {
    WebhookProvider,
    WebhookProviderFactory,
} from "./webhook-provider.port";
import { WEBHOOK_PROVIDER_FACTORY } from "./webhook-provider.port";

/**
 * Default {@link WebhookProviderFactory}: resolves a provider name to its
 * concrete webhook verifier/normalizer. Constructed once; the verifiers are
 * stateless (the secret is passed per call), so a single instance is shared.
 * An unknown provider name is a 404 (nothing to verify against).
 */
export class DefaultWebhookProviderFactory implements WebhookProviderFactory {
    private readonly byName: Map<string, WebhookProvider>;

    constructor(providers: WebhookProvider[] = defaultProviders()) {
        this.byName = new Map(providers.map((p) => [p.name, p]));
    }

    get(name: string): WebhookProvider {
        const provider = this.byName.get(name.toUpperCase());
        if (!provider) {
            throw new NotFoundException(`Unknown webhook provider "${name}"`);
        }
        return provider;
    }
}

function defaultProviders(): WebhookProvider[] {
    return [new RazorpayWebhookProvider(), new CashfreeWebhookProvider()];
}

/**
 * Nest provider exposing the {@link WebhookProviderFactory} under
 * {@link WEBHOOK_PROVIDER_FACTORY}. Tests construct {@link WebhooksService}
 * directly with a `FakeWebhookProviderFactory` instead.
 */
export const webhookProviderFactoryProvider: Provider = {
    provide: WEBHOOK_PROVIDER_FACTORY,
    useFactory: (): WebhookProviderFactory =>
        new DefaultWebhookProviderFactory(),
};
