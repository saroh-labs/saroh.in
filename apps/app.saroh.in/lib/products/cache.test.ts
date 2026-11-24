import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { catalogueProduct } from "@/lib/products/catalogue.fixture";
import type { ProductOverview } from "@/lib/products/overview-rules";
import type { CataloguePage } from "@/lib/products/service";

import { applyQuick, patchOverview, patchPage, patchPageMany } from "./cache";
import type { ProductRead } from "./queries";
import { productRead, productsListRead } from "./queries";

const page = (): CataloguePage => ({
    items: [
        catalogueProduct({ id: "a" }),
        catalogueProduct({ id: "b", name: "Rye" }),
    ],
    nextCursor: null,
    total: 2,
    pageSize: 50,
    counts: { all: 2, collections: 0, inventory: 2 },
    storefronts: { everywhere: 2, byStorefront: [] },
    needs: [],
});

const overview = {
    product: { id: "a", status: "PUBLISHED", price: "4.80" },
    price: { min: "4.80", max: "4.80", mrp: null, savingPercent: null },
    stock: {
        mode: "product",
        variants: [],
        product: {
            onHand: 10,
            promised: 2,
            canSell: 8,
            warnAt: 5,
            word: "IN_STOCK",
        },
        totals: { onHand: 10, promised: 2, canSell: 8, lowCount: 0 },
    },
} as unknown as ProductOverview;

describe("the quick edits' optimistic patches", () => {
    it("sets a status on the one product and leaves the rest", () => {
        const next = patchPage(page(), "a", { status: "ARCHIVED" });
        expect(next.items.map((p) => p.status)).toEqual([
            "ARCHIVED",
            "PUBLISHED",
        ]);
    });

    it("sets a status on several (bulk Archive)", () => {
        const next = patchPageMany(page(), ["a", "b"], { status: "ARCHIVED" });
        expect(next.items.every((p) => p.status === "ARCHIVED")).toBe(true);
    });

    it("adds received units to the row and to that storefront's shelf", () => {
        const [a] = patchPage(page(), "a", {
            stockAdd: { storeId: "online", units: 5 },
        }).items;
        expect(a.inventory?.quantity).toBe(77);
        expect(a.listings.map((l) => l.inventory?.quantity)).toEqual([42, 35]);
    });

    it("does not change the page it was given", () => {
        const before = page();
        patchPage(before, "a", { status: "ARCHIVED" });
        expect(before.items[0]?.status).toBe("PUBLISHED");
    });

    it("moves the overview's status, price and stock", () => {
        const next = patchOverview(overview, {
            status: "ARCHIVED",
            price: "5.50",
            stockAdd: { storeId: "s", units: 4 },
        });
        expect(next.product.status).toBe("ARCHIVED");
        expect(next.price).toMatchObject({ min: "5.50", max: "5.50" });
        expect(next.stock.product).toMatchObject({ onHand: 14, canSell: 12 });
        expect(next.stock.totals).toMatchObject({ onHand: 14, canSell: 12 });
    });
});

const listKey = (orgId: string, filter: object) =>
    productsListRead.key(orgId, filter);
const productKey = (orgId: string, storefront?: string) =>
    productRead.key(orgId, { productId: "a", storefront });

describe("a quick edit in the cache", () => {
    it("writes an edit into every cached list page and the product's reads, and puts it back", () => {
        const qc = new QueryClient();
        qc.setQueryData(listKey("org1", {}), page());
        qc.setQueryData(listKey("org1", { q: "rye" }), page());
        qc.setQueryData<ProductRead>(productKey("org1"), {
            overview,
            stock: null,
        });
        qc.setQueryData<ProductRead>(productKey("org1", "s2"), {
            overview,
            stock: null,
        });
        const undo = applyQuick(qc, "org1", ["a"], { status: "ARCHIVED" });
        const status = (f: object) =>
            qc.getQueryData<CataloguePage>(listKey("org1", f))?.items[0]
                ?.status;
        const pageStatus = (s?: string) =>
            qc.getQueryData<ProductRead>(productKey("org1", s))?.overview
                .product.status;
        expect([status({}), status({ q: "rye" })]).toEqual([
            "ARCHIVED",
            "ARCHIVED",
        ]);
        expect([pageStatus(), pageStatus("s2")]).toEqual([
            "ARCHIVED",
            "ARCHIVED",
        ]);
        undo();
        expect([status({}), status({ q: "rye" })]).toEqual([
            "PUBLISHED",
            "PUBLISHED",
        ]);
        expect([pageStatus(), pageStatus("s2")]).toEqual([
            "PUBLISHED",
            "PUBLISHED",
        ]);
    });

    it("never touches another business's entries", () => {
        const qc = new QueryClient();
        qc.setQueryData(listKey("org1", {}), page());
        qc.setQueryData(listKey("org2", {}), page());
        applyQuick(qc, "org1", ["a"], { status: "ARCHIVED" });
        expect(
            qc.getQueryData<CataloguePage>(listKey("org2", {}))?.items[0]
                ?.status,
        ).toBe("PUBLISHED");
    });

    it("keys every query under the business", () => {
        expect(listKey("org1", {}).slice(0, 2)).toEqual(["products", "org1"]);
        expect(productKey("org1", "s").slice(0, 2)).toEqual([
            "products",
            "org1",
        ]);
    });
});
