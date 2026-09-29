/**
 * A connection's webhook (DEC-063): which providers sign with a secret of
 * their own, which connections lack it, and the address setup shows.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        API_PUBLIC_URL: "https://api.example.test/",
        NODE_ENV: "test",
    },
}));

import { encryptSecret } from "./crypto";
import {
    needsWebhookSecret,
    WEBHOOK_EVENTS,
    webhookSecretFrom,
} from "./webhook-secret";
import {
    lacksWebhookSecret,
    readWebhookSetup,
    webhookUrl,
} from "./webhook-setup";

function sealed(provider: string, creds: Record<string, string>) {
    const s = encryptSecret(JSON.stringify(creds));
    return {
        provider,
        encryptedCredentials: s.ciphertext,
        credentialsIv: s.iv,
        credentialsAuthTag: s.authTag,
    };
}

describe("which providers sign with a secret of their own", () => {
    it("Razorpay does; Cashfree signs with its key secret", () => {
        expect(needsWebhookSecret("RAZORPAY")).toBe(true);
        expect(needsWebhookSecret("razorpay")).toBe(true);
        expect(needsWebhookSecret("CASHFREE")).toBe(false);
    });

    it("verifies Razorpay only with its own webhook secret", () => {
        expect(
            webhookSecretFrom("RAZORPAY", {
                keySecret: "key",
                webhookSecret: "hook",
            }),
        ).toBe("hook");
        expect(webhookSecretFrom("RAZORPAY", { keySecret: "key" })).toBeNull();
        expect(
            webhookSecretFrom("RAZORPAY", {
                keySecret: "key",
                webhookSecret: "  ",
            }),
        ).toBeNull();
    });

    it("verifies Cashfree with a saved webhook secret, else its key secret", () => {
        expect(
            webhookSecretFrom("CASHFREE", {
                keySecret: "key",
                webhookSecret: "hook",
            }),
        ).toBe("hook");
        expect(webhookSecretFrom("CASHFREE", { keySecret: "key" })).toBe("key");
        expect(webhookSecretFrom("CASHFREE", {})).toBeNull();
    });

    it("lists the Razorpay events the webhook acts on", () => {
        expect(WEBHOOK_EVENTS.RAZORPAY).toEqual([
            "payment.captured",
            "payment.failed",
            "order.paid",
            "refund.processed",
            "refund.failed",
        ]);
    });
});

describe("lacksWebhookSecret", () => {
    it("flags a Razorpay connection sealed without a webhook secret", () => {
        expect(
            lacksWebhookSecret(
                sealed("RAZORPAY", { keyId: "rzp_live_A", keySecret: "s" }),
            ),
        ).toBe(true);
    });

    it("passes a Razorpay connection with one, and any Cashfree", () => {
        expect(
            lacksWebhookSecret(
                sealed("RAZORPAY", {
                    keyId: "rzp_live_A",
                    keySecret: "s",
                    webhookSecret: "w",
                }),
            ),
        ).toBe(false);
        expect(
            lacksWebhookSecret(
                sealed("CASHFREE", { keyId: "app", keySecret: "s" }),
            ),
        ).toBe(false);
    });

    it("says nothing about a blob it can't open (a seed's placeholder)", () => {
        expect(
            lacksWebhookSecret({
                provider: "RAZORPAY",
                encryptedCredentials: "seed-not-a-real-credential",
                credentialsIv: "seed-iv",
                credentialsAuthTag: "seed-tag",
            }),
        ).toBe(false);
    });
});

describe("the webhook address", () => {
    it("is the API's public address, the provider and the business", () => {
        expect(webhookUrl("org_1", "RAZORPAY")).toBe(
            "https://api.example.test/public/webhooks/razorpay/org_1",
        );
        expect(webhookUrl("org_1", "CASHFREE")).toBe(
            "https://api.example.test/public/webhooks/cashfree/org_1",
        );
    });

    it("reads each provider's setup for the one business, with its last update", async () => {
        const at = new Date("2026-09-29T10:00:00Z");
        const findFirst = jest.fn(
            ({ where }: { where: { provider: string } }) =>
                Promise.resolve(
                    where.provider === "RAZORPAY" ? { createdAt: at } : null,
                ),
        );
        const setup = await readWebhookSetup("org_1", {
            webhookEvent: { findFirst },
        } as never);

        expect(setup).toEqual([
            {
                provider: "RAZORPAY",
                url: "https://api.example.test/public/webhooks/razorpay/org_1",
                events: [...WEBHOOK_EVENTS.RAZORPAY],
                secretRequired: true,
                lastReceivedAt: at,
            },
            {
                provider: "CASHFREE",
                url: "https://api.example.test/public/webhooks/cashfree/org_1",
                events: [...WEBHOOK_EVENTS.CASHFREE],
                secretRequired: false,
                lastReceivedAt: null,
            },
        ]);
        for (const [args] of findFirst.mock.calls) {
            expect(args.where).toEqual(
                expect.objectContaining({ organizationId: "org_1" }),
            );
        }
    });
});
