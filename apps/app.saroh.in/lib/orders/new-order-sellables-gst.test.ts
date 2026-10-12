import { describe, expect, it } from "vitest";

import { sellablesOfProduct } from "@/lib/orders/new-order-sellables";
import type { ProductListItem } from "@/lib/products/service";

/**
 * The counter's prices are the amount to pay (12 Oct 2026): GST on top
 * where the business, or the product, has "GST is added", by the API's own
 * rule. A preview: the order the API makes is the truth.
 */
const serum = (over: Partial<ProductListItem> = {}): ProductListItem =>
    ({
        id: "p1",
        name: "Vitamin C serum",
        price: "1000.00",
        status: "PUBLISHED",
        storeId: "s1",
        gstRate: "18",
        gstPriceMode: null,
        variants: [],
        inventory: null,
        ...over,
    }) as ProductListItem;

const prices = (
    p: ProductListItem,
    terms?: { registered: boolean; mode: "INCLUDED" | "ADDED" },
) => sellablesOfProduct(p, "s1", terms).map((s) => s.priceCents);

const ADDED = { registered: true, mode: "ADDED" } as const;
const INCLUDED = { registered: true, mode: "INCLUDED" } as const;

describe("what the counter lists a product at", () => {
    it("is the typed price when prices include GST, or nothing says otherwise", () => {
        expect(prices(serum())).toEqual([100_000]);
        expect(prices(serum(), INCLUDED)).toEqual([100_000]);
    });

    it("has the GST on top when the business adds GST to its prices", () => {
        expect(prices(serum(), ADDED)).toEqual([118_000]);
        expect(prices(serum({ price: "99.99" }), ADDED)).toEqual([11_799]);
    });

    it("follows the product's own way over the business's, both ways", () => {
        expect(prices(serum({ gstPriceMode: "INCLUDED" }), ADDED)).toEqual([
            100_000,
        ]);
        expect(prices(serum({ gstPriceMode: "ADDED" }), INCLUDED)).toEqual([
            118_000,
        ]);
    });

    it("adds nothing with no rate, at 0%, or for a business that isn't registered", () => {
        expect(prices(serum({ gstRate: null }), ADDED)).toEqual([100_000]);
        expect(prices(serum({ gstRate: "0" }), ADDED)).toEqual([100_000]);
        expect(
            prices(serum({ gstPriceMode: "ADDED" }), {
                registered: false,
                mode: "ADDED",
            }),
        ).toEqual([100_000]);
    });

    it("prices each variant by its own price, at the product's rate and way", () => {
        const sized = serum({
            variants: [
                { id: "v30", sku: "S-30", title: "30 ml", price: null },
                { id: "v50", sku: "S-50", title: "50 ml", price: "1500.00" },
            ],
        });
        expect(prices(sized, ADDED)).toEqual([118_000, 177_000]);
        expect(prices(sized, INCLUDED)).toEqual([100_000, 150_000]);
    });
});
