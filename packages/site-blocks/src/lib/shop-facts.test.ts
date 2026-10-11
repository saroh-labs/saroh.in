import { describe, expect, it } from "vitest";

import { shopFactsLine } from "./shop-facts";

describe("what an order costs to receive, under the price", () => {
    it("names each way the location offers, with its fee or free", () => {
        expect(
            shopFactsLine({
                currency: "INR",
                ways: [
                    { label: "Pick-up", fee: null },
                    { label: "Local delivery", fee: "40.00" },
                    { label: "Shipping", fee: "89.50" },
                ],
            }),
        ).toBe("Pick-up free · Local delivery ₹40 · Shipping ₹89.50");
    });

    it("adds free delivery from the location's amount when a fee is there to waive", () => {
        expect(
            shopFactsLine({
                currency: "INR",
                ways: [
                    { label: "Pick-up", fee: null },
                    { label: "Local delivery", fee: "40.00" },
                ],
                freeDeliveryOver: "999.00",
            }),
        ).toBe("Pick-up free · Local delivery ₹40 · Free delivery from ₹999");
    });

    it("never promises free delivery where nothing is charged, or no amount is set", () => {
        const free = [
            { label: "Pick-up", fee: null },
            { label: "Local delivery", fee: null },
        ];
        expect(
            shopFactsLine({
                currency: "INR",
                ways: free,
                freeDeliveryOver: "999.00",
            }),
        ).toBe("Pick-up free · Local delivery free");
        for (const none of [null, undefined, "", "0.00"]) {
            expect(
                shopFactsLine({
                    currency: "INR",
                    ways: [{ label: "Shipping", fee: "80.00" }],
                    freeDeliveryOver: none,
                }),
            ).toBe("Shipping ₹80");
        }
    });

    it("says nothing for a shop with no way to order, or no read", () => {
        expect(shopFactsLine({ currency: "INR", ways: [] })).toBeNull();
        expect(shopFactsLine(null)).toBeNull();
        expect(shopFactsLine(undefined)).toBeNull();
    });
});
