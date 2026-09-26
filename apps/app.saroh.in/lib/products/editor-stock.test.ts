import { describe, expect, it } from "vitest";

import {
    stockCounting,
    stockDraftFrom,
    stockLayout,
    switchesToVariants,
} from "./editor-stock";
import type { ProductDetail, Variant } from "./service";

function variant(id: string, position: number, extra: Partial<Variant> = {}) {
    return {
        id,
        productId: "p1",
        sku: `SKU-${id}`,
        title: id,
        price: null,
        image: null,
        position,
        ...extra,
    } satisfies Variant;
}

type StockBits = Pick<
    ProductDetail,
    "inventory" | "stockMode" | "variants" | "variantPromises"
>;

describe("stockCounting", () => {
    it("reads a product counted per variant", () => {
        expect(stockCounting({ stockMode: "variant", inventory: null })).toBe(
            "variant",
        );
    });

    it("reads a whole-product count, even with variants (#525)", () => {
        // Platform Trolley: one variant, one count for the product.
        expect(
            stockCounting({
                stockMode: "product",
                inventory: { quantity: 16, reserved: 14, lowStockAlert: 5 },
            }),
        ).toBe("whole");
    });

    it("reads nothing counted yet", () => {
        expect(stockCounting({ stockMode: "product", inventory: null })).toBe(
            "none",
        );
    });
});

describe("stockLayout", () => {
    it("shows a whole count as one count, variants or not", () => {
        expect(stockLayout("whole", true, false)).toBe("whole");
        expect(stockLayout("whole", false, false)).toBe("whole");
    });

    it("splits a whole count per variant only when asked", () => {
        expect(stockLayout("whole", true, true)).toBe("lines");
        expect(switchesToVariants("whole", "lines")).toBe(true);
    });

    it("collapses until Add stock, then counts the way the product sells", () => {
        expect(stockLayout("none", true, false)).toBe("collapsed");
        expect(stockLayout("none", true, true)).toBe("lines");
        expect(stockLayout("none", false, true)).toBe("whole");
    });

    it("a product counted per variant needs no switch", () => {
        expect(stockLayout("variant", true, false)).toBe("lines");
        expect(switchesToVariants("variant", "lines")).toBe(false);
    });
});

describe("stockDraftFrom", () => {
    it("starts each variant at what it promises, the first with what was free", () => {
        const p: StockBits = {
            stockMode: "product",
            inventory: { quantity: 16, reserved: 14, lowStockAlert: 5 },
            variantPromises: { a: 10, b: 4 },
            variants: [variant("b", 1), variant("a", 0)],
        };
        const d = stockDraftFrom(p, "10");
        expect(d.quantity).toBe("16");
        expect(d.lines.map((l) => [l.variantId, l.quantity])).toEqual([
            ["a", "12"],
            ["b", "4"],
        ]);
        // Nothing lost or counted twice.
        expect(d.lines.reduce((n, l) => n + Number(l.quantity), 0)).toBe(16);
    });

    it("reads each variant's own count once it counts per variant", () => {
        const p: StockBits = {
            stockMode: "variant",
            inventory: null,
            variantPromises: {},
            variants: [
                variant("a", 0, {
                    inventory: { quantity: 3, reserved: 1, lowStockAlert: 2 },
                }),
            ],
        };
        expect(stockDraftFrom(p, "10").lines).toEqual([
            {
                variantId: "a",
                title: "a",
                quantity: "3",
                lowStockAlert: "2",
                promised: 1,
            },
        ]);
    });
});
