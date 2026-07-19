import { createHmac, timingSafeEqual } from "node:crypto";

import type {
    BillingProvider,
    BillingProviderFactory,
    CreateSubscriptionInput,
    CreateSubscriptionResult,
    ParsedBillingEvent,
    SubscriptionStatus,
    WebhookHeaders,
} from "./billing-provider.port";
import { headerValue } from "./billing-provider.port";

/**
 * Deterministic, network-free billing provider for tests/dev (S7-005).
 *
 * Records every create/cancel call (so a test can assert the resolved plan
 * terms were passed and NO merchant credential leaked in) and returns a stable
 * `providerSubscriptionId` derived from the org id. `verifyWebhook` runs a REAL
 * HMAC-SHA256 hex compare against a constructor secret (so a valid-signature
 * test exercises genuine crypto and a forged/absent one fails), and
 * `parseWebhook` reads the already-verified body straight through. Never makes
 * an HTTP request and never touches `process.env`.
 */
export class FakeBillingProvider implements BillingProvider {
    readonly createCalls: CreateSubscriptionInput[] = [];
    readonly cancelCalls: string[] = [];

    constructor(
        readonly name = "RAZORPAY",
        private readonly secret = "whsec_fake_platform_secret",
    ) {}

    createSubscription(
        input: CreateSubscriptionInput,
    ): Promise<CreateSubscriptionResult> {
        this.createCalls.push(input);
        return Promise.resolve({
            providerSubscriptionId: `fake_sub_${input.organizationId}`,
            providerCustomerId: `fake_cus_${input.organizationId}`,
            status: "ACTIVE",
        });
    }

    cancelSubscription(providerSubscriptionId: string): Promise<void> {
        this.cancelCalls.push(providerSubscriptionId);
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
        };
        return {
            type: body.type ?? "unknown",
            providerEventId: body.providerEventId ?? "evt_unknown",
            providerSubscriptionId: body.providerSubscriptionId,
            status: body.status ?? "IGNORED",
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
