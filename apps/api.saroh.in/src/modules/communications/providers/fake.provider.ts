import type {
    CommsChannel,
    CommsProvider,
    CommsProviderFactory,
    CommsSendInput,
    CommsSendResult,
} from "./provider.port";

/**
 * Deterministic, network-free provider for tests/dev (S6-001).
 *
 * Records every call (so a test can assert it received the DECRYPTED
 * credentials and the resolved recipient) and returns a stable
 * `providerMessageId`. Never makes an HTTP request. Set `failWith` to make
 * `send` reject — the delivery-failure path — without any network.
 */
export class FakeCommsProvider implements CommsProvider {
    readonly calls: CommsSendInput[] = [];

    constructor(
        readonly channel: CommsChannel = "EMAIL",
        private readonly failWith?: Error,
    ) {}

    supports(): boolean {
        return true;
    }

    send(input: CommsSendInput): Promise<CommsSendResult> {
        this.calls.push(input);
        if (this.failWith) {
            return Promise.reject(this.failWith);
        }
        return Promise.resolve({
            providerMessageId: `fake_${this.channel.toLowerCase()}_${this.calls.length}`,
        });
    }
}

/**
 * A {@link CommsProviderFactory} that always returns the SAME fake provider,
 * regardless of the requested channel/provider. Lets a handler test inject one
 * fake and assert on its recorded calls.
 */
export class FakeCommsProviderFactory implements CommsProviderFactory {
    constructor(private readonly provider: FakeCommsProvider) {}

    get(): FakeCommsProvider {
        return this.provider;
    }
}
