import type { Provider } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";

import { EmailCommsProvider } from "./email.provider";
import type {
    CommsChannel,
    CommsProvider,
    CommsProviderFactory,
} from "./provider.port";
import { COMMS_PROVIDER_FACTORY } from "./provider.port";
import { WhatsappCommsProvider } from "./whatsapp.provider";

/**
 * Default {@link CommsProviderFactory}: resolves a (channel, provider) pair to
 * its concrete adapter. Constructed once; the adapters are stateless
 * (credentials are passed per call), so a single instance is shared across
 * requests. Keyed by channel, then narrowed to the concrete provider via the
 * adapter's `supports` check.
 */
export class DefaultCommsProviderFactory implements CommsProviderFactory {
    private readonly byChannel: Map<CommsChannel, CommsProvider>;

    constructor(adapters: CommsProvider[] = defaultAdapters()) {
        this.byChannel = new Map(adapters.map((a) => [a.channel, a]));
    }

    get(channel: CommsChannel, provider: string): CommsProvider {
        const adapter = this.byChannel.get(channel);
        if (!adapter?.supports(provider)) {
            throw new BadRequestException(
                `Unsupported comms provider "${provider}" for channel "${channel}"`,
            );
        }
        return adapter;
    }
}

function defaultAdapters(): CommsProvider[] {
    return [new EmailCommsProvider(), new WhatsappCommsProvider()];
}

/**
 * Nest provider exposing the {@link CommsProviderFactory} under
 * {@link COMMS_PROVIDER_FACTORY}. Tests construct the service/handler directly
 * with a {@link FakeCommsProviderFactory} instead.
 */
export const commsProviderFactoryProvider: Provider = {
    provide: COMMS_PROVIDER_FACTORY,
    useFactory: (): CommsProviderFactory => new DefaultCommsProviderFactory(),
};
