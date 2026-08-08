/**
 * Communications provider port (S6-001).
 *
 * A narrow, swappable interface over "hand one message to the org's connected
 * provider". The service/handler depend only on this port, so the real email /
 * WhatsApp adapters (which make live HTTP calls) can be replaced by the
 * {@link FakeCommsProvider} in tests — no network, deterministic output.
 * DECRYPTED credentials are passed IN for the single provider call and are never
 * retained by the port or logged.
 */

/** The channels an org can message a contact on. */
export const COMMS_CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type CommsChannel = (typeof COMMS_CHANNELS)[number];

/** Type guard for a runtime string against {@link COMMS_CHANNELS}. */
export function isCommsChannel(value: string): value is CommsChannel {
    return (COMMS_CHANNELS as readonly string[]).includes(value);
}

/**
 * The concrete providers this app can connect, per channel. A connect is
 * rejected unless the (channel, provider) pair appears here.
 */
export const SUPPORTED_COMMS_PROVIDERS: Record<
    CommsChannel,
    readonly string[]
> = {
    EMAIL: ["RESEND", "SENDGRID", "SMTP"],
    WHATSAPP: ["TWILIO", "META"],
};

/** True if `provider` is a supported adapter for `channel`. */
export function isSupportedComms(
    channel: CommsChannel,
    provider: string,
): boolean {
    return SUPPORTED_COMMS_PROVIDERS[channel].includes(provider);
}

/**
 * Decrypted provider credentials — the plaintext that only ever exists
 * in-memory at the instant of a provider call. A generic string map so each
 * adapter can read the keys it needs (e.g. `apiKey` for email, `accessToken` +
 * `phoneNumberId` for WhatsApp). NONE of these values is ever logged or echoed.
 */
export type CommsCredentials = Record<string, string>;

/** The single message an adapter is asked to hand to its provider. */
export interface CommsSendInput {
    to: string;
    from?: string;
    subject?: string;
    body: string;
    credentials: CommsCredentials;
}

/** The provider's accepted-for-delivery receipt. */
export interface CommsSendResult {
    /** The provider's own message id — recorded on the Delivery for audit. */
    providerMessageId: string;
}

/**
 * One channel adapter. `channel` fixes which channel it serves; `supports`
 * narrows to the concrete provider names it can talk to; `send` performs the
 * single delivery. Implementations MUST sanitize errors — never surface the
 * auth header, credentials, or the raw provider body.
 */
export interface CommsProvider {
    readonly channel: CommsChannel;
    supports(provider: string): boolean;
    send(input: CommsSendInput): Promise<CommsSendResult>;
}

/** Factory over the concrete adapters — injectable so tests swap in a fake. */
export interface CommsProviderFactory {
    get(channel: CommsChannel, provider: string): CommsProvider;
}

/** DI token for the {@link CommsProviderFactory}. */
export const COMMS_PROVIDER_FACTORY = Symbol("COMMS_PROVIDER_FACTORY");
