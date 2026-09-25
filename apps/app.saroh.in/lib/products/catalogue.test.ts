import { describe, expect, it } from "vitest";

import type { CatalogueRow } from "./catalogue";
import { catalogueRows, inStorefront } from "./catalogue";
import type { CatalogueProduct } from "./service";

function product(
    over: Partial<CatalogueProduct> & { id: string },
): CatalogueProduct {
    return {
        storeId: "market",
        name: "Sourdough loaf",
        slug: "sourdough",
        description: null,
        image: null,
        categoryId: null,
        price: "4.80",
        currency: "GBP",
        status: "PUBLISHED",
        updatedAt: "2026-09-18T07:10:00.000Z",
        variantCount: 2,
        sku: "SD-800",
        variants: [],
        inventory: { quantity: 72, promised: 0, lowStockAlert: 5 },
        listings: [
            {
                storeId: "market",
                storeName: "Market Street",
                inventory: { quantity: 42, promised: 0, lowStockAlert: 5 },
                variants: [],
            },
            {
                storeId: "online",
                storeName: "Online",
                inventory: { quantity: 30, promised: 0, lowStockAlert: 10 },
                variants: [],
            },
        ],
        ...over,
    };
}

/** The single row a case expects; fails the test when there is not exactly one. */
function only(rows: CatalogueRow[]): CatalogueRow {
    const row = rows.at(0);
    if (!row || rows.length !== 1) {
        throw new Error(`expected one row, got ${rows.length}`);
    }
    return row;
}

describe("catalogueRows (#531)", () => {
    it("is one row per catalogue product, naming every storefront that sells it", () => {
        const row = only(catalogueRows([product({ id: "p1" })]));
        expect(row.key).toBe("p1");
        expect(row.places.map((p) => p.storeName)).toEqual([
            "Market Street",
            "Online",
        ]);
        expect(row.stock).toBe(72);
        expect(row.lowStockAlert).toBe(5);
    });

    it("never merges two products, even with the same SKU", () => {
        const rows = catalogueRows([
            product({ id: "a" }),
            product({ id: "b" }),
        ]);
        expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
    });

    it("reads stock as unknown when no storefront tracks it", () => {
        const row = only(
            catalogueRows([
                product({
                    id: "p1",
                    listings: [
                        {
                            storeId: "market",
                            storeName: "Market Street",
                            inventory: null,
                            variants: [],
                        },
                    ],
                }),
            ]),
        );
        expect(row.stock).toBeNull();
        expect(row.lowStockAlert).toBeNull();
    });

    it("keeps a product no storefront sells just now", () => {
        const row = only(catalogueRows([product({ id: "p1", listings: [] })]));
        expect(row.places).toEqual([]);
        expect(row.stock).toBeNull();
    });

    it("is in a collection when it has a category", () => {
        expect(
            only(catalogueRows([product({ id: "p1", categoryId: "c1" })]))
                .inCollection,
        ).toBe(true);
    });
});

describe("inStorefront", () => {
    it("filters by listing: that storefront's stock, and still where it is sold", () => {
        const row = only(catalogueRows([product({ id: "p1" })]));
        const online = inStorefront(row, "online");
        expect(online?.stock).toBe(30);
        expect(online?.lowStockAlert).toBe(10);
        expect(online?.places).toHaveLength(2);
        expect(inStorefront(row, "elsewhere")).toBeNull();
    });

    it("is the whole row for a business with one storefront", () => {
        const row = only(
            catalogueRows([
                product({
                    id: "p1",
                    listings: [
                        {
                            storeId: "market",
                            storeName: "Market Street",
                            inventory: {
                                quantity: 42,
                                promised: 0,
                                lowStockAlert: 5,
                            },
                            variants: [],
                        },
                    ],
                }),
            ]),
        );
        expect(inStorefront(row, "market")).toEqual(row);
    });
});
