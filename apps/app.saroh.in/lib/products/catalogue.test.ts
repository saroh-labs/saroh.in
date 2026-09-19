import { describe, expect, it } from "vitest";

import type { CatalogueRow } from "./catalogue";
import { inStorefront, mergeCatalogue } from "./catalogue";
import type { ProductListItem } from "./service";

function product(
    over: Partial<ProductListItem> & { id: string; storeId: string },
): ProductListItem {
    return {
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
        inventory: { quantity: 42, lowStockAlert: 5 },
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

const STORES = [
    { id: "market", name: "Market Street" },
    { id: "online", name: "Online" },
];

describe("mergeCatalogue", () => {
    it("makes one row of a SKU sold in two storefronts", () => {
        const rows = mergeCatalogue(STORES, {
            market: [product({ id: "p1", storeId: "market" })],
            online: [
                product({
                    id: "p9",
                    storeId: "online",
                    price: "5.20",
                    inventory: { quantity: 30, lowStockAlert: 10 },
                    updatedAt: "2026-09-18T08:02:00.000Z",
                }),
            ],
        });
        const row = only(rows);
        expect(row.places.map((p) => p.storeName)).toEqual([
            "Market Street",
            "Online",
        ]);
        // Price differs by storefront: say "varies", never pick a winner.
        expect(row.varies).toBe(true);
        expect(row.stock).toBe(72);
        expect(row.lowStockAlert).toBe(5);
        expect(row.updatedAt).toBe("2026-09-18T08:02:00.000Z");
    });

    it("keeps a product with no SKU as its own row", () => {
        const rows = mergeCatalogue(STORES, {
            market: [product({ id: "a", storeId: "market", sku: null })],
            online: [product({ id: "b", storeId: "online", sku: null })],
        });
        expect(rows).toHaveLength(2);
    });

    it("is live when live anywhere, archived only when archived everywhere", () => {
        const mixed = only(
            mergeCatalogue(STORES, {
                market: [
                    product({ id: "p1", storeId: "market", status: "DRAFT" }),
                ],
                online: [product({ id: "p2", storeId: "online" })],
            }),
        );
        expect(mixed.status).toBe("PUBLISHED");
        const gone = only(
            mergeCatalogue(STORES, {
                market: [
                    product({
                        id: "p1",
                        storeId: "market",
                        status: "ARCHIVED",
                    }),
                ],
                online: [
                    product({ id: "p2", storeId: "online", status: "DRAFT" }),
                ],
            }),
        );
        expect(gone.status).toBe("DRAFT");
    });

    it("reads stock as unknown when no place tracks it", () => {
        const row = only(
            mergeCatalogue(STORES, {
                market: [
                    product({ id: "p1", storeId: "market", inventory: null }),
                ],
            }),
        );
        expect(row.stock).toBeNull();
    });
});

describe("inStorefront", () => {
    it("shows one storefront's price and stock, and keeps where it is sold", () => {
        const row = only(
            mergeCatalogue(STORES, {
                market: [product({ id: "p1", storeId: "market" })],
                online: [
                    product({ id: "p2", storeId: "online", price: "5.20" }),
                ],
            }),
        );
        const online = inStorefront(row, "online");
        expect(online?.price).toBe("5.20");
        expect(online?.places).toHaveLength(2);
        expect(online?.varies).toBe(true);
        expect(inStorefront(row, "elsewhere")).toBeNull();
    });
});
