import { describe, expect, it } from "vitest";

import {
    generateWebhookSecret,
    isTestKey,
    lastUpdateLine,
    sinceWords,
    WEBHOOK_PLACE,
    webhookFor,
} from "./webhook";

const now = new Date("2026-09-29T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("sinceWords", () => {
    it("says how long ago, in the words the row uses", () => {
        expect(sinceWords(ago(20_000), now)).toBe("just now");
        expect(sinceWords(ago(2 * 60_000), now)).toBe("2 min ago");
        expect(sinceWords(ago(3 * 3_600_000), now)).toBe("3 h ago");
        expect(sinceWords(ago(30 * 3_600_000), now)).toBe("yesterday");
        expect(sinceWords(ago(5 * 86_400_000), now)).toBe("5 days ago");
        // A clock a little ahead is not "in the future".
        expect(sinceWords(new Date(now.getTime() + 5_000), now)).toBe(
            "just now",
        );
    });
});

describe("lastUpdateLine", () => {
    const setup = {
        provider: "RAZORPAY" as const,
        url: "https://api.saroh.in/public/webhooks/razorpay/org_1",
        events: [],
        secretRequired: true,
    };

    it("names the provider and when", () => {
        expect(
            lastUpdateLine(
                { ...setup, lastReceivedAt: ago(120_000).toISOString() },
                now,
            ),
        ).toBe("Last payment update from Razorpay: 2 min ago.");
        expect(lastUpdateLine({ ...setup, lastReceivedAt: null }, now)).toBe(
            "No payment updates received yet — check the webhook in Razorpay.",
        );
    });

    it("claims nothing when the setup wasn't read or the date is not one", () => {
        expect(lastUpdateLine(null, now)).toBeNull();
        expect(
            lastUpdateLine({ ...setup, lastReceivedAt: "not a date" }, now),
        ).toBeNull();
    });
});

describe("generateWebhookSecret", () => {
    it("is 48 hex characters from 24 random bytes", () => {
        const secret = generateWebhookSecret();
        expect(secret).toMatch(/^[0-9a-f]{48}$/);
        expect(generateWebhookSecret()).not.toBe(secret);
    });

    it("uses the random source it is given", () => {
        const fixed = generateWebhookSecret((b) => b.fill(171));
        expect(fixed).toBe("ab".repeat(24));
    });
});

describe("the rest", () => {
    it("knows where each dashboard keeps its webhooks", () => {
        expect(WEBHOOK_PLACE.RAZORPAY).toBe(
            "Accounts & Settings › Webhooks › Add New Webhook",
        );
        expect(WEBHOOK_PLACE.CASHFREE).toMatch(/Webhooks/);
    });

    it("finds a provider's setup, or none", () => {
        const razorpay = {
            provider: "RAZORPAY" as const,
            url: "u",
            events: [],
            secretRequired: true,
            lastReceivedAt: null,
        };
        expect(webhookFor([razorpay], "RAZORPAY")).toBe(razorpay);
        expect(webhookFor([razorpay], "CASHFREE")).toBeNull();
        expect(webhookFor(null, "RAZORPAY")).toBeNull();
    });

    it("spots a Razorpay test key", () => {
        expect(isTestKey("rzp_test_Abc")).toBe(true);
        expect(isTestKey("  rzp_test_Abc")).toBe(true);
        expect(isTestKey("rzp_live_Abc")).toBe(false);
    });
});
