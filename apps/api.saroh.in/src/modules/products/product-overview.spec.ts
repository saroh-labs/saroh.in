import {
    ratingSummary,
    stockLine,
    stockNeeds,
    stockTotals,
} from "./product-overview";

describe("product overview arithmetic", () => {
    it("can sell is on hand minus promised, never below zero", () => {
        expect(
            stockLine({ quantity: 20, reserved: 3, lowStockAlert: 6 }),
        ).toMatchObject({
            canSell: 17,
            word: "IN_STOCK",
        });
        expect(
            stockLine({ quantity: 2, reserved: 5, lowStockAlert: 0 }).canSell,
        ).toBe(0);
    });

    it("says low at the warning level and sold out at nothing to sell", () => {
        expect(
            stockLine({ quantity: 10, reserved: 4, lowStockAlert: 6 }).word,
        ).toBe("LOW");
        expect(
            stockLine({ quantity: 10, reserved: 3, lowStockAlert: 6 }).word,
        ).toBe("IN_STOCK");
        expect(
            stockLine({ quantity: 3, reserved: 3, lowStockAlert: 6 }).word,
        ).toBe("SOLD_OUT");
        // A warning level of 0 never warns.
        expect(
            stockLine({ quantity: 1, reserved: 0, lowStockAlert: 0 }).word,
        ).toBe("IN_STOCK");
    });

    it("totals the variants and adds promises the product row still holds", () => {
        const lines = [
            stockLine({ quantity: 20, reserved: 3, lowStockAlert: 6 }),
            stockLine({ quantity: 10, reserved: 1, lowStockAlert: 4 }),
            stockLine({ quantity: 0, reserved: 0, lowStockAlert: 4 }),
        ];
        expect(stockTotals(lines, null)).toEqual({
            onHand: 30,
            promised: 4,
            canSell: 26,
            lowCount: 1,
        });
        // An old order still holds 2 on the product row.
        expect(
            stockTotals(lines, { quantity: 0, reserved: 2, lowStockAlert: 10 }),
        ).toMatchObject({ onHand: 30, promised: 6, canSell: 26 });
    });

    it("counts lines short, and lines needing someone, for the Stock badge", () => {
        const line = (...needs: ("short" | "out" | "low" | null)[]) => ({
            cells: needs.map((need) => ({ need })),
        });
        expect(
            stockNeeds([
                // Short at one storefront, fine at the other.
                line("short", null),
                // Sold out at one, low at the other.
                line("out", "low"),
                line(null, null),
            ]),
        ).toEqual({ short: 1, low: 2 });
        expect(stockNeeds([])).toEqual({ short: 0, low: 0 });
    });

    it("summarises ratings: 8×5 + 3×4 + 1×3 is 4.6 from 12", () => {
        const ratings = [...Array(8).fill(5), 4, 4, 4, 3] as number[];
        expect(ratingSummary(ratings)).toEqual({
            average: 4.6,
            count: 12,
            distribution: [0, 0, 1, 3, 8],
        });
        expect(ratingSummary([])).toEqual({
            average: null,
            count: 0,
            distribution: [0, 0, 0, 0, 0],
        });
    });
});
