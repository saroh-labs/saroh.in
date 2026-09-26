import { needsFrom } from "./catalogue-needs";

/** The Products list's "Needs you" (#519): which products, and why. */
const shelf = (
    productId: string,
    onHand: number,
    promised = 0,
    lowStockAlert = 5,
) => ({ productId, name: productId, onHand, promised, lowStockAlert });

describe("needsFrom", () => {
    it("adds a product's shelves up before judging it", () => {
        // Sold out at one storefront, 4 at the other: 4 left, low at 5.
        expect(needsFrom([shelf("bun", 0), shelf("bun", 4)])).toEqual([
            {
                productId: "bun",
                name: "bun",
                kind: "low",
                short: 0,
                canSell: 4,
            },
        ]);
    });

    it("says short before out, and out before low", () => {
        const needs = needsFrom([
            shelf("low", 3),
            shelf("out", 0),
            shelf("short", 1, 3),
            shelf("fine", 40),
        ]);
        expect(needs.map((n) => [n.productId, n.kind])).toEqual([
            ["short", "short"],
            ["out", "out"],
            ["low", "low"],
        ]);
        expect(needs[0]).toMatchObject({ short: 2, canSell: 0 });
    });

    it("counts what can be sold, not what is on the shelf", () => {
        // 6 on hand, all 6 promised: nothing left to sell, nobody short.
        expect(needsFrom([shelf("loaf", 6, 6)])).toEqual([
            expect.objectContaining({ kind: "out", canSell: 0, short: 0 }),
        ]);
    });

    it("never warns at a warning level of 0", () => {
        expect(needsFrom([shelf("mug", 1, 0, 0)])).toEqual([]);
    });

    it("warns at the lowest level among the shelves", () => {
        // 3 left against levels of 2 and 8: the list row warns at 2.
        expect(
            needsFrom([shelf("jam", 3, 0, 2), shelf("jam", 0, 0, 8)]),
        ).toEqual([]);
        expect(
            needsFrom([shelf("jam", 1, 0, 2), shelf("jam", 1, 0, 8)]),
        ).toEqual([expect.objectContaining({ kind: "low", canSell: 2 })]);
    });
});
