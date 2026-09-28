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
