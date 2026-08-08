import { createHmac, timingSafeEqual } from "node:crypto";

import type {
    NormalizedWebhookEvent,
    ParseEventInput,
    VerifySignatureInput,
    WebhookHeaders,
    WebhookProvider,
    WebhookProviderFactory,
} from "./webhook-provider.port";
import { headerValue } from "./webhook-provider.port";

/**
 * Deterministic, network-free webhook provider for tests/dev (S5-003).
 *
 * Uses a REAL HMAC-SHA256 hex compare (so a valid signature test exercises the
 * genuine crypto path and a wrong/absent one fails) via the `x-fake-signature`
 * header, and reads the already-verified body straight through as the
 * normalized event. Lets a service test drive the full verify→inbox→reconcile
 * flow with no provider-specific payload shape.
 */
export class FakeWebhookProvider implements WebhookProvider {
    constructor(readonly name = "RAZORPAY") {}

    verifySignature({
        rawBody,
        headers,
        secret,
    }: VerifySignatureInput): boolean {
        const provided = headerValue(headers, "x-fake-signature");
        if (!provided) return false;
        const expected = createHmac("sha256", secret)
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

    signatureHeader(headers: WebhookHeaders): string | undefined {
        return headerValue(headers, "x-fake-signature");
    }

    parseEvent({ payload }: ParseEventInput): NormalizedWebhookEvent {
        const body = (payload ?? {}) as Partial<NormalizedWebhookEvent> & {
            eventType?: string;
        };
        return {
            providerEventId: body.providerEventId ?? "evt_unknown",
            eventType: body.eventType ?? "unknown",
            outcome: body.outcome ?? "IGNORED",
            providerIntentId: body.providerIntentId,
            orderRef: body.orderRef,
            providerPaymentRef: body.providerPaymentRef,
            providerRefundId: body.providerRefundId,
        };
    }
}

/** A {@link WebhookProviderFactory} that always returns the SAME fake. */
export class FakeWebhookProviderFactory implements WebhookProviderFactory {
    constructor(private readonly provider: FakeWebhookProvider) {}

    get(): FakeWebhookProvider {
        return this.provider;
    }
}
