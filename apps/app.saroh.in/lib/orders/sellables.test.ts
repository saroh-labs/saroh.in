import { describe, expect, it } from "vitest";

import { addedLines, firstSellable, sellablesOf } from "./sellables";

const products = [
    {
        id: "dress",
        name: "Linen Wrap Dress",
        price: "2400.00",
        variants: [
            { id: "s", title: "S", price: null },
            { id: "m", title: "M", price: "2600.00" },
        ],
        soldOut: true,
    },
    { id: "loaf", name: "Seeded loaf", price: "240.00" },
];

describe("sellablesOf — what a line can be for", () => {
    it("offers each variant at its price, and a plain product as itself", () => {
        expect(sellablesOf(products)).toEqual([
            {
                key: "dress:s",
                productId: "dress",
                variantId: "s",
                name: "Linen Wrap Dress",
                variantTitle: "S",
                label: "Linen Wrap Dress · S",
                price: "2400.00",
                soldOut: true,
            },
            {
                key: "dress:m",
                productId: "dress",
                variantId: "m",
                name: "Linen Wrap Dress",
                variantTitle: "M",
                label: "Linen Wrap Dress · M",
                price: "2600.00",
                soldOut: true,
            },
            {
                key: "loaf",
                productId: "loaf",
                name: "Seeded loaf",
                variantTitle: null,
                label: "Seeded loaf",
                price: "240.00",
                soldOut: false,
            },
        ]);
    });

    it("starts a new line on the first thing not sold out", () => {
        expect(firstSellable(products)).toBe("loaf");
        expect(firstSellable([])).toBe("");
    });
});

describe("addedLines — Add an item (B8)", () => {
    it("sends each thing once, with how many times it was picked", () => {
        const [s, m, loaf] = sellablesOf(products);
        expect(addedLines([loaf, m, loaf, s])).toEqual([
            { productId: "loaf", quantity: 2 },
            { productId: "dress", variantId: "m", quantity: 1 },
            { productId: "dress", variantId: "s", quantity: 1 },
        ]);
        expect(addedLines([])).toEqual([]);
    });
});

describe("the amount to pay where GST is added (12 Oct 2026)", () => {
    const ADDED = { registered: true, mode: "ADDED" } as const;
    const INCLUDED = { registered: true, mode: "INCLUDED" } as const;
    const serum = {
        id: "serum",
        name: "Vitamin C serum",
        price: "1000.00",
        gstRate: "18",
    };
    const prices = (
        list: Parameters<typeof sellablesOf>[0],
        terms?: Parameters<typeof sellablesOf>[1],
    ) => sellablesOf(list, terms).map((s) => s.price);

    it("puts the GST on top of each price: ₹1,000 at 18% is ₹1,180", () => {
        expect(prices([serum], ADDED)).toEqual(["1180.00"]);
    });

    it("prices a variant under its product's rate, at its own price", () => {
        expect(
            prices(
                [
                    {
                        ...serum,
                        variants: [
                            { id: "s", title: "30 ml", price: null },
                            { id: "l", title: "50 ml", price: "1500.00" },
                        ],
                    },
                ],
                ADDED,
            ),
        ).toEqual(["1180.00", "1770.00"]);
    });

    it("leaves a price that includes GST as typed, to the letter", () => {
        expect(prices([serum], INCLUDED)).toEqual(["1000.00"]);
        expect(prices([serum])).toEqual(["1000.00"]);
        expect(prices([{ ...serum, price: "1000" }], INCLUDED)).toEqual([
            "1000",
        ]);
    });

    it("follows the product's own way over the business's", () => {
        expect(prices([{ ...serum, gstPriceMode: "INCLUDED" }], ADDED)).toEqual(
            ["1000.00"],
        );
        expect(prices([{ ...serum, gstPriceMode: "ADDED" }], INCLUDED)).toEqual(
            ["1180.00"],
        );
    });

    it("adds nothing with no rate, an exempt one, or a business that isn't registered", () => {
        expect(prices([{ ...serum, gstRate: null }], ADDED)).toEqual([
            "1000.00",
        ]);
        expect(prices([{ ...serum, gstRate: "0" }], ADDED)).toEqual([
            "1000.00",
        ]);
        expect(prices([serum], { registered: false, mode: "ADDED" })).toEqual([
            "1000.00",
        ]);
    });

    it("rounds the GST to the paisa, half up", () => {
        // ₹99.99 at 5% is ₹4.9995 of GST: ₹5.00.
        expect(
            prices([{ ...serum, price: "99.99", gstRate: "5" }], ADDED),
        ).toEqual(["104.99"]);
    });
});
