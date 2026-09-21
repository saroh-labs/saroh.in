import { describe, expect, it } from "vitest";

import { describeDiscount, reachOf } from "./describe";
import type { Discount } from "./service";

const base: Discount = {
    id: "d",
    code: "MARKETDAY",
    description: null,
    kind: "PERCENTAGE",
    percent: "15",
    amount: null,
    currency: null,
    appliesTo: "BUSINESS",
    targets: [],
    startsAt: null,
    endsAt: null,
    usageLimit: 100,
    used: 3,
    state: "ACTIVE",
};

describe("describeDiscount", () => {
    it("says what it takes off, from what, and its cap", () => {
        expect(describeDiscount(base)).toBe(
            "15% off · everything · capped at 100",
        );
    });

    it("says 'no cap' rather than 0 or nothing", () => {
        expect(describeDiscount({ ...base, usageLimit: null })).toBe(
            "15% off · everything · no cap",
        );
    });

    it("names one target and counts several", () => {
        expect(
            reachOf({
                appliesTo: "STOREFRONT",
                targets: [{ id: "s", name: "Hill Road" }],
            }),
        ).toBe("at Hill Road");
        expect(
            reachOf({
                appliesTo: "PRODUCT",
                targets: [
                    { id: "a", name: "A" },
                    { id: "b", name: "B" },
                ],
            }),
        ).toBe("2 products");
    });

    it("admits a narrow code that reaches nothing now", () => {
        expect(reachOf({ appliesTo: "COLLECTION", targets: [] })).toBe(
            "no collection",
        );
    });
});
