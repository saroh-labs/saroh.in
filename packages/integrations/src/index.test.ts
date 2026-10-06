import { describe, expect, it } from "vitest";

import { WEBHOOK_EVENTS, WEBHOOK_ROUTE, webhookPath } from "./index";

describe("the payment webhook address", () => {
    it("is the route, the provider in lower case and the business", () => {
        expect(webhookPath("RAZORPAY", "org_1")).toBe(
            "/public/webhooks/razorpay/org_1",
        );
        expect(webhookPath("CASHFREE", "org_1")).toBe(
            "/public/webhooks/cashfree/org_1",
        );
        expect(webhookPath("RAZORPAY", "a/b")).toBe(
            "/public/webhooks/razorpay/a%2Fb",
        );
    });

    it("mounts under a route without slashes, as Nest takes it", () => {
        expect(WEBHOOK_ROUTE).not.toMatch(/^\/|\/$/);
    });

    it("lists events for every provider", () => {
        expect(WEBHOOK_EVENTS.RAZORPAY.length).toBeGreaterThan(0);
        expect(WEBHOOK_EVENTS.CASHFREE.length).toBeGreaterThan(0);
    });
});
