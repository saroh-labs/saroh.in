import { describe, expect, it } from "vitest";

import {
    counterProducts,
    sellablesOfProduct,
} from "@/lib/orders/new-order-sellables";
import type { CatalogueProduct } from "@/lib/products/service";

/**
 * The counter picker's stock (UX-026): a product counted per variant reads
 * each size's own shelf at the storefront, never the product's sum, and
 * drafts aren't listed.
 */
const kurta = (over: Partial<CatalogueProduct> = {}): CatalogueProduct =>
    ({
        id: "p1",
        name: "Linen kurta",
        price: "1299.00",
        status: "PUBLISHED",
        storeId: "s1",
        variants: [
            { id: "vS", sku: "K-S", title: "S", price: null },
            { id: "vM", sku: "K-M", title: "M", price: null },
            { id: "vL", sku: "K-L", title: "L", price: null },
        ],
        // The variants' sum, as the list row sends it.
        inventory: { quantity: 5, promised: 0, lowStockAlert: 1 },
        listings: [
            {
                storeId: "s1",
                storeName: "Hill Road",
                inventory: { quantity: 5, promised: 0, lowStockAlert: 1 },
                variants: [
                    {
                        variantId: "vS",
                        soldHere: true,
                        inventory: {
                            quantity: 5,
                            promised: 1,
                            lowStockAlert: 1,
                        },
                    },
                    {
                        variantId: "vM",
                        soldHere: true,
                        inventory: {
                            quantity: 0,
                            promised: 0,
                            lowStockAlert: 1,
                        },
                    },
                    {
                        variantId: "vL",
                        soldHere: true,
                        inventory: {
                            quantity: 1,
                            promised: 1,
                            lowStockAlert: 1,
                        },
                    },
                ],
            },
        ],
        ...over,
    }) as CatalogueProduct;

describe("the counter picker's stock per variant (UX-026)", () => {
    it("reads each size's own shelf, not the product's sum", () => {
        const [s, m, l] = sellablesOfProduct(kurta(), "s1");
        expect(s).toMatchObject({ variantTitle: "S", left: 4, soldOut: false });
        expect(m).toMatchObject({ variantTitle: "M", left: 0, soldOut: true });
        // On hand 1, promised 1: nothing to sell.
        expect(l).toMatchObject({ variantTitle: "L", left: 0, soldOut: true });
    });

    it("uses the product's count when it isn't counted per variant", () => {
        const p = kurta({
            listings: [
                {
                    storeId: "s1",
                    storeName: "Hill Road",
                    inventory: { quantity: 3, promised: 0, lowStockAlert: 1 },
                    variants: [
                        { variantId: "vS", soldHere: true, inventory: null },
                        { variantId: "vM", soldHere: true, inventory: null },
                        { variantId: "vL", soldHere: true, inventory: null },
                    ],
                },
            ],
            inventory: { quantity: 3, promised: 0, lowStockAlert: 1 },
        });
        expect(sellablesOfProduct(p, "s1").map((x) => x.left)).toEqual([
            3, 3, 3,
        ]);
    });

    it("leaves an uncounted product open, and a hand-marked one sold out", () => {
        const open = kurta({ inventory: null, listings: [], variants: [] });
        expect(sellablesOfProduct(open, "s1")[0]).toMatchObject({
            left: null,
            soldOut: false,
        });
        const marked = kurta({ inventory: null, listings: [], soldOut: true });
        expect(sellablesOfProduct(marked, "s1").every((x) => x.soldOut)).toBe(
            true,
        );
    });
});

describe("what the counter lists (UX-026)", () => {
    it("lists published products only", () => {
        const list = counterProducts([
            kurta({ id: "a", status: "PUBLISHED" }),
            kurta({ id: "b", status: "DRAFT" }),
            kurta({ id: "c", status: "ARCHIVED" }),
        ]);
        expect(list.map((p) => p.id)).toEqual(["a"]);
    });
});

describe("a picker chip's words (UX-026)", () => {
    it("says Sold out in words, and how few are left", async () => {
        const { chipWords } = await import("@/lib/orders/new-order");
        expect(chipWords("M", "₹1,299", 0)).toBe("M · Sold out");
        expect(chipWords("S", "₹1,299", 2)).toBe("S · ₹1,299 · 2 left");
        expect(chipWords("S", "₹1,299", 9)).toBe("S · ₹1,299");
        expect(chipWords(null, "₹80", null)).toBe("Add · ₹80");
    });
});
