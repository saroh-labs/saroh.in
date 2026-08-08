// Network-free unit tests for the billing provider adapters + factory (S7-005).
// No @saroh/database and no HTTP: these assert the CREDENTIAL BOUNDARY — the
// adapters read ONLY Saroh's own `SAROH_*` platform env keys (never a merchant
// credential) — plus the real HMAC verify paths and factory resolution.
import { createHmac } from "node:crypto";

import { NotFoundException } from "@nestjs/common";

import { CashfreeBillingProvider } from "./cashfree.provider";
import { DefaultBillingProviderFactory } from "./provider.factory";
import { RazorpayBillingProvider } from "./razorpay.provider";

/** Wrap `process.env` in a proxy that records every string key read. */
function recordEnvReads(): { reads: string[]; restore: () => void } {
    const reads: string[] = [];
    const real = globalThis.process.env;
    globalThis.process.env = new Proxy(real, {
        get(target, prop, receiver) {
            if (typeof prop === "string") reads.push(prop);
            return Reflect.get(target, prop, receiver) as unknown;
        },
    });
    return { reads, restore: () => (globalThis.process.env = real) };
}

const RZP_WEBHOOK_SECRET = "SAROH_RAZORPAY_WEBHOOK_SECRET";
const CF_WEBHOOK_SECRET = "SAROH_CASHFREE_WEBHOOK_SECRET";

describe("RazorpayBillingProvider.verifyWebhook", () => {
    afterEach(() => {
        delete globalThis.process.env[RZP_WEBHOOK_SECRET];
    });

    it("accepts a valid HMAC and reads ONLY its own SAROH_RAZORPAY_* env key", () => {
        globalThis.process.env[RZP_WEBHOOK_SECRET] = "platform_whsec";
        const provider = new RazorpayBillingProvider();
        const raw = Buffer.from(
            JSON.stringify({ event: "subscription.charged" }),
        );
        const signature = createHmac("sha256", "platform_whsec")
            .update(raw)
            .digest("hex");

        const { reads, restore } = recordEnvReads();
        const ok = provider.verifyWebhook(raw, {
            "x-razorpay-signature": signature,
        });
        restore();

        expect(ok).toBe(true);
        // Credential separation: every env read is a platform Razorpay key —
        // never a merchant credential (PAYMENTS_ENC_KEY, merchant provider keys).
        expect(reads.length).toBeGreaterThan(0);
        for (const key of reads) {
            expect(key.startsWith("SAROH_RAZORPAY_")).toBe(true);
        }
        expect(reads).toContain(RZP_WEBHOOK_SECRET);
    });

    it("rejects a forged signature and an absent header", () => {
        globalThis.process.env[RZP_WEBHOOK_SECRET] = "platform_whsec";
        const provider = new RazorpayBillingProvider();
        const raw = Buffer.from("{}");

        expect(
            provider.verifyWebhook(raw, {
                "x-razorpay-signature": createHmac("sha256", "wrong")
                    .update(raw)
                    .digest("hex"),
            }),
        ).toBe(false);
        expect(provider.verifyWebhook(raw, {})).toBe(false);
    });

    it("fails closed (false, no throw) when the platform secret is unset", () => {
        const provider = new RazorpayBillingProvider();
        const raw = Buffer.from("{}");
        expect(
            provider.verifyWebhook(raw, { "x-razorpay-signature": "deadbeef" }),
        ).toBe(false);
    });

    it("parses a subscription event to a normalized shape", () => {
        const provider = new RazorpayBillingProvider();
        const event = provider.parseWebhook({
            event: "subscription.halted",
            payload: {
                subscription: { entity: { id: "sub_x", status: "halted" } },
            },
        });
        expect(event).toEqual({
            type: "subscription.halted",
            providerEventId: "subscription.halted:sub_x",
            providerSubscriptionId: "sub_x",
            status: "PAST_DUE",
        });
    });
});

describe("CashfreeBillingProvider.verifyWebhook", () => {
    afterEach(() => {
        delete globalThis.process.env[CF_WEBHOOK_SECRET];
    });

    it("accepts a valid base64 HMAC over timestamp+body, reading ONLY its SAROH_CASHFREE_* key", () => {
        globalThis.process.env[CF_WEBHOOK_SECRET] = "cf_platform_whsec";
        const provider = new CashfreeBillingProvider();
        const raw = Buffer.from(
            JSON.stringify({ type: "SUBSCRIPTION_STATUS_WEBHOOK" }),
        );
        const timestamp = "1700000000";
        const signed = Buffer.concat([Buffer.from(timestamp, "utf8"), raw]);
        const signature = createHmac("sha256", "cf_platform_whsec")
            .update(signed)
            .digest("base64");

        const { reads, restore } = recordEnvReads();
        const ok = provider.verifyWebhook(raw, {
            "x-webhook-signature": signature,
            "x-webhook-timestamp": timestamp,
        });
        restore();

        expect(ok).toBe(true);
        for (const key of reads) {
            expect(key.startsWith("SAROH_CASHFREE_")).toBe(true);
        }
        expect(reads).toContain(CF_WEBHOOK_SECRET);
    });

    it("rejects when the timestamp header is missing", () => {
        globalThis.process.env[CF_WEBHOOK_SECRET] = "cf_platform_whsec";
        const provider = new CashfreeBillingProvider();
        const raw = Buffer.from("{}");
        expect(
            provider.verifyWebhook(raw, { "x-webhook-signature": "abc" }),
        ).toBe(false);
    });
});

describe("DefaultBillingProviderFactory", () => {
    it("resolves RAZORPAY and CASHFREE case-insensitively", () => {
        const factory = new DefaultBillingProviderFactory();
        expect(factory.get("razorpay").name).toBe("RAZORPAY");
        expect(factory.get("cashfree").name).toBe("CASHFREE");
    });

    it("404s an unknown provider", () => {
        const factory = new DefaultBillingProviderFactory();
        expect(() => factory.get("stripe")).toThrow(NotFoundException);
    });
});
