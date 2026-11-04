import { describe, expect, it } from "vitest";

import { pricingModel } from "./plans";

describe("the pricing page's plans", () => {
    const model = pricingModel();
    const view = model.views["month-excl"];

    it("offers Free alone, with no toggle, tables or tax", () => {
        expect(model.tax.toggle).toBe(false);
        expect(model.yearly).toBeNull();
        expect(view.usage).toBeNull();
        expect(model.rows).toEqual([]);
        expect(view.plans.map((p) => [p.name, p.cta.paid, p.featured])).toEqual(
            [
                ["Free", false, true],
                ["Grow", true, false],
                ["Pro", true, false],
            ],
        );
    });

    it("gives the paid plans no price, and says nothing they would include", () => {
        for (const plan of view.plans.filter((p) => p.cta.paid)) {
            expect(plan.price).toBe("—");
            expect(plan.lines).toEqual([]);
        }
    });

    it("names no money, limit, tax or provider", () => {
        expect(JSON.stringify(view)).not.toMatch(
            /₹|\$|rupee|GST|\bVAT\b|\btax\b|\d|stripe|paypal|razorpay|cashfree/i,
        );
    });
});
