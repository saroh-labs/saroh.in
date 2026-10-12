import { describe, expect, it } from "vitest";

import { shopFactsLine, shopLeadLine } from "./shop-facts";

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

describe("the line under the shop's heading", () => {
    const ways = [
        { type: "PICKUP", label: "Pick-up", fee: null },
        { type: "LOCAL_DELIVERY", label: "Local delivery", fee: "40.00" },
        { type: "SHIPPING", label: "Shipping", fee: "89.50" },
    ];

    it("names the ways an order can leave, in the location's order", () => {
        expect(shopLeadLine({ canOrder: true, currency: "INR", ways })).toBe(
            "Order online for pick-up, local delivery or shipping.",
        );
        expect(
            shopLeadLine({
                canOrder: true,
                currency: "INR",
                ways: ways.slice(0, 2),
            }),
        ).toBe("Order online for pick-up or local delivery.");
        expect(
            shopLeadLine({
                canOrder: true,
                currency: "INR",
                ways: ways.slice(0, 1),
            }),
        ).toBe("Order online for pick-up.");
    });

    it("adds free delivery from the location's amount, by the product page's rule", () => {
        expect(
            shopLeadLine({
                canOrder: true,
                currency: "INR",
                ways: ways.slice(0, 2),
                freeDeliveryOver: "999.00",
            }),
        ).toBe(
            "Order online for pick-up or local delivery. Free delivery from ₹999.",
        );
        // Nothing to waive: pick-up alone has no fee.
        expect(
            shopLeadLine({
                canOrder: true,
                currency: "INR",
                ways: ways.slice(0, 1),
                freeDeliveryOver: "999.00",
            }),
        ).toBe("Order online for pick-up.");
    });

    it("writes a price in the shop's own currency", () => {
        expect(
            shopLeadLine(
                {
                    canOrder: true,
                    currency: "USD",
                    ways: [
                        { type: "SHIPPING", label: "Shipping", fee: "5.00" },
                    ],
                    freeDeliveryOver: "50.00",
                },
                "en-US",
            ),
        ).toBe("Order online for shipping. Free delivery from $50.");
    });

    it("falls back to the way's own words for a kind it doesn't know", () => {
        expect(
            shopLeadLine({
                canOrder: true,
                currency: "INR",
                ways: [{ type: "LOCKER", label: "Locker", fee: null }],
            }),
        ).toBe("Order online for locker.");
    });

    it("says nothing when the read has nothing to say", () => {
        expect(shopLeadLine(null)).toBeNull();
        expect(shopLeadLine(undefined)).toBeNull();
        // Not taking online orders: no promise of one.
        expect(
            shopLeadLine({ canOrder: false, currency: "INR", ways }),
        ).toBeNull();
        expect(
            shopLeadLine({ canOrder: true, currency: "INR", ways: [] }),
        ).toBeNull();
    });
});
