import { describe, expect, it } from "vitest";

import type { ProductOverview } from "@/lib/products/overview";
import type { ProductStock, SizeStock } from "@/lib/stock/product-stock";

import { sizeRows } from "./overview-stats";

const overview = {
    product: {
        price: "540",
        currency: "INR",
        option: { name: "Size" },
        variants: [
            { id: "v30", title: "30 litre", sku: "SC-30L", price: "540" },
            { id: "v45", title: "45 litre", sku: "SC-45L", price: "760" },
        ],
    },
} as unknown as ProductOverview;

const size = (variantId: string, canSell: number, warnAt = 50): SizeStock => ({
    variantId,
    onHand: canSell,
    promised: 0,
    canSell,
    short: 0,
    warnAt,
    shelves: [],
    word: { text: "", tone: "ok" },
});

const stock = (
    mode: ProductStock["mode"],
    sizes: SizeStock[],
): ProductStock => ({
    mode,
    sizes,
    totals: { onHand: 0, promised: 0, canSell: 0, short: 0 },
    split: false,
    byStore: [],
});

describe("sizeRows (HPProductVariantsDesk)", () => {
    it("lists each size with its own price, and says low or out", () => {
        const rows = sizeRows(
            overview,
            stock("variant", [size("v30", 96), size("v45", 44)]),
            false,
        );
        expect(
            rows.map((r) => [r.title, r.sku, r.price, r.canSell, r.flag]),
        ).toEqual([
            ["30 litre", "SC-30L", "₹540", 96, null],
            ["45 litre", "SC-45L", "₹760", 44, "low"],
        ]);
        expect(
            sizeRows(
                overview,
                stock("variant", [size("v30", 0), size("v45", 9)]),
                false,
            )[0].flag,
        ).toBe("out");
    });

    it("draws none when the product counts as a whole, has one size, or is archived", () => {
        const two = [size("v30", 96), size("v45", 44)];
        expect(sizeRows(overview, stock("product", two), false)).toEqual([]);
        expect(sizeRows(overview, stock("variant", [two[0]]), false)).toEqual(
            [],
        );
        expect(sizeRows(overview, stock("variant", two), true)).toEqual([]);
        expect(sizeRows(overview, null, false)).toEqual([]);
    });
});
