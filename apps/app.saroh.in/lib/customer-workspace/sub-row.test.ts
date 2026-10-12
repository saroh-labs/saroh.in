import { describe, expect, it } from "vitest";

import type { DetailSubscription } from "./detail";
import { subRow } from "./view";

/**
 * A customer's Subscriptions tab (12 Oct 2026): the figure on a row is
 * what they pay a period, GST and all, as Subscriptions says it. The
 * amount is the API's (`pay`).
 */

const NOW = new Date("2026-10-12T06:30:00Z");
const ZONE = "Asia/Kolkata";

const sub = (over: Partial<DetailSubscription> = {}): DetailSubscription => ({
    id: "s1",
    plan: { id: "p1", name: "Gym monthly" },
    status: "ACTIVE",
    interval: "MONTH",
    price: "2000.00",
    currency: "INR",
    currentPeriodStart: "2026-10-01T00:00:00.000Z",
    currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    nextChargeAt: "2026-10-31T18:30:00.000Z",
    cancelAtPeriodEnd: false,
    pausedAt: null,
    cancelledAt: null,
    ...over,
});

describe("a subscription on a customer's page", () => {
    it("GST is added: a ₹2,000 member's row says ₹2,360", () => {
        expect(subRow(sub({ pay: "2360.00" }), ZONE, NOW).price).toBe(
            "₹2,360/mo",
        );
    });

    it("prices include GST, and not registered: ₹2,000, as before", () => {
        expect(subRow(sub({ pay: "2000.00" }), ZONE, NOW).price).toBe(
            "₹2,000/mo",
        );
    });

    it("an API before the amount to pay reads the price, which was the amount", () => {
        expect(subRow(sub(), ZONE, NOW).price).toBe("₹2,000/mo");
    });
});
