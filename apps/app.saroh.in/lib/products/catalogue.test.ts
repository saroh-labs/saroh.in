import { describe, expect, it } from "vitest";

import type { CatalogueRow } from "./catalogue";
import {
    catalogueRows,
    initials,
    priceRange,
    rowFacts,
    stockWords,
} from "./catalogue";
import { catalogueProduct } from "./catalogue.fixture";

/** The single row a case expects; fails the test when there is not exactly one. */
function only(rows: CatalogueRow[]): CatalogueRow {
    const row = rows.at(0);
    if (!row || rows.length !== 1) {
        throw new Error(`expected one row, got ${rows.length}`);
    }
    return row;
}

describe("the row's second line (#524)", () => {
    const places = [
        { storeName: "Hill Road" },
        { storeName: "Online" },
    ] as CatalogueRow["places"];

    it("says its variants, SKU and storefronts, as the design does", () => {
        expect(
            rowFacts({ variantCount: 1, sku: "RYE-800", places }, true),
        ).toEqual({
            variants: "1 variant",
            sku: "RYE-800",
            places: "Hill Road · Online",
        });
        expect(rowFacts({ variantCount: 3, sku: null, places }, false)).toEqual(
            { variants: "3 variants", sku: null, places: null },
        );
    });

    it("never says 0 variants", () => {
        expect(rowFacts({ variantCount: 0, sku: null, places }, true)).toEqual({
            variants: null,
            sku: null,
            places: "Hill Road · Online",
        });
        expect(
            rowFacts({ variantCount: 0, sku: null, places: [] }, true),
        ).toEqual({ variants: null, sku: null, places: null });
    });
});

describe("catalogueRows (#531, #519)", () => {
    it("is one row per catalogue product, naming every storefront that sells it", () => {
        const row = only(catalogueRows([catalogueProduct({ id: "p1" })]));
        expect(row.key).toBe("p1");
        expect(row.places.map((p) => p.storeName)).toEqual([
            "Market Street",
            "Online",
        ]);
        expect(row.stock).toBe(72);
        expect(row.canSell).toBe(72);
        expect(row.lowStockAlert).toBe(5);
    });

    it("never merges two products, even with the same SKU", () => {
        const rows = catalogueRows([
            catalogueProduct({ id: "a" }),
            catalogueProduct({ id: "b" }),
        ]);
        expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
    });

    it("reads stock as unknown when nothing counts it", () => {
        const row = only(
            catalogueRows([catalogueProduct({ id: "p1", inventory: null })]),
        );
        expect(row.stock).toBeNull();
        expect(row.canSell).toBeNull();
        expect(stockWords(row)).toEqual({
            text: "Not tracked",
            tone: "muted",
        });
    });

    it("says Sold out for an untracked product marked sold out by hand (#515)", () => {
        const row = only(
            catalogueRows([
                catalogueProduct({ id: "p1", inventory: null, soldOut: true }),
            ]),
        );
        expect(stockWords(row)).toEqual({ text: "Sold out", tone: "danger" });
    });

    it("takes what is promised off what can be sold", () => {
        const row = only(
            catalogueRows([
                catalogueProduct({
                    id: "p1",
                    inventory: { quantity: 4, promised: 6, lowStockAlert: 5 },
                }),
            ]),
        );
        expect(row.canSell).toBe(0);
        expect(stockWords(row)).toEqual({
            text: "4 in stock",
            tone: "danger",
        });
    });
});

describe("stockWords", () => {
    const at = (stock: number, lowStockAlert: number, promised = 0) => ({
        stock,
        canSell: Math.max(0, stock - promised),
        lowStockAlert,
        soldOut: false,
    });

    it("is out of stock at nothing on the shelf", () => {
        expect(stockWords(at(0, 5))).toEqual({
            text: "Out of stock",
            tone: "danger",
        });
    });

    it("warns at the product's own level, not a fixed five", () => {
        expect(stockWords(at(8, 10)).tone).toBe("warn");
        expect(stockWords(at(4, 3)).tone).toBe("plain");
        // A level of 0 never warns.
        expect(stockWords(at(1, 0)).tone).toBe("plain");
    });
});

describe("priceRange", () => {
    it("is the variants' range, a variant without a price selling at the product's", () => {
        expect(priceRange("260", [{ price: null }, { price: "480" }])).toEqual({
            low: "260",
            high: "480",
        });
    });

    it("is null with one variant or one price", () => {
        expect(priceRange("260", [{ price: "300" }])).toBeNull();
        expect(
            priceRange("260", [{ price: null }, { price: "260.00" }]),
        ).toBeNull();
    });
});

describe("initials", () => {
    it("takes two words, skipping symbols", () => {
        expect(initials("Rye & caraway loaf")).toBe("RC");
        expect(initials("Mug")).toBe("M");
    });
});
