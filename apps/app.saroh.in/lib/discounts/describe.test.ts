import { describe, expect, it } from "vitest";

import { describeDiscount, gaveOffOf, reachOf, usageWords } from "./describe";
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
            "no category",
        );
    });
});

describe("usageWords (DEC-267)", () => {
    it("answers 'is this code working?' in one line", () => {
        const used = {
            ...base,
            used: 14,
            usage: {
                gaveOff: "2100.00",
                currency: "INR",
                ordersTotal: "18400.00",
            },
        };
        expect(usageWords(used)).toEqual({
            lead: "Used on 14 orders · ₹2,100 off",
            orders: "₹18,400 in those orders",
        });
        expect(gaveOffOf(used)).toBe("₹2,100");
    });

    it("says not used yet, and leaves out what the role may not see", () => {
        expect(usageWords({ ...base, used: 0 })).toEqual({
            lead: "Not used yet",
            orders: null,
        });
        expect(gaveOffOf({ ...base, used: 0 })).toBeNull();
        expect(
            usageWords({
                ...base,
                used: 1,
                usage: { gaveOff: "50.00", currency: "INR" },
            }).orders,
        ).toBeNull();
    });
});
