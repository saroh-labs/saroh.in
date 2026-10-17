import { describe, expect, it } from "vitest";

import type { CatalogueRow } from "./catalogue";
import { catalogueRows, rowFacts, stockWords } from "./catalogue";
import { catalogueProduct } from "./catalogue.fixture";
import type { NeedDetail } from "./needs-you";

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
            // One variant is the product itself: nothing to say.
            variants: null,
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

    it("marks a row past the plan's cut as paused (#800), and none without one", () => {
        const old = {
            ...catalogueProduct({ id: "p_old" }),
            createdAt: "2026-01-01T00:00:00.000Z",
        };
        const kept = {
            ...catalogueProduct({ id: "p_new" }),
            createdAt: "2026-06-01T00:00:00.000Z",
        };
        const cut = { createdAt: "2026-06-01T00:00:00.000Z", id: "p_new" };
        const rows = catalogueRows([old, kept], cut);
        expect(rows.map((r) => [r.id, r.paused])).toEqual([
            ["p_old", true],
            ["p_new", false],
        ]);
        expect(catalogueRows([old]).map((r) => r.paused)).toEqual([false]);
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
        expect(
            stockWords(row, {
                productId: "p1",
                name: "p1",
                kind: "short",
                short: 2,
                canSell: 0,
            }),
        ).toEqual({ text: "2 short for orders", tone: "danger" });
    });
});

describe("stockWords — what can be sold, and the worst shelf", () => {
    const at = (stock: number, promised = 0) => ({
        stock,
        canSell: Math.max(0, stock - promised),
        promised,
        soldOut: false,
    });
    const need = (
        kind: NeedDetail["kind"],
        over: Partial<NeedDetail> = {},
    ): NeedDetail => ({
        productId: "p",
        name: "p",
        kind,
        short: 0,
        canSell: 0,
        where: null,
        ...over,
    });

    it("says plain 'to sell' when every shelf is fine", () => {
        expect(stockWords(at(18))).toEqual({
            text: "18 to sell",
            tone: "plain",
        });
        // Promised units come off: 4 on hand, 1 promised.
        expect(stockWords(at(4, 1)).text).toBe("3 to sell");
    });

    it("says what is promised when nothing is left to sell", () => {
        expect(stockWords(at(156, 156), need("out"))).toEqual({
            text: "0 to sell · 156 promised",
            tone: "danger",
        });
        expect(stockWords(at(0), need("out"))).toEqual({
            text: "Out of stock",
            tone: "danger",
        });
    });

    it("says how many are short for orders", () => {
        expect(stockWords(at(13, 15), need("short", { short: 2 }))).toEqual({
            text: "2 short for orders",
            tone: "danger",
        });
    });

    it("names the variants that are out, by the product's option", () => {
        expect(
            stockWords(
                at(167),
                need("out", {
                    where: ["7.44 Intense Copper Blonde"],
                    option: "Shade",
                    variants: { worst: 1, of: 28 },
                    places: [],
                }),
            ),
        ).toEqual({ text: "167 to sell · 1 shade out", tone: "danger" });
        expect(
            stockWords(
                at(40),
                need("low", {
                    where: ["S", "M"],
                    option: null,
                    variants: { worst: 2, of: 4 },
                    places: [],
                }),
            ),
        ).toEqual({ text: "40 to sell · 2 variants low", tone: "warn" });
    });

    it("names the place when it is out at only some", () => {
        expect(
            stockWords(
                at(95),
                need("out", {
                    where: ["Online"],
                    variants: { worst: 0, of: 0 },
                    places: ["Online"],
                }),
            ),
        ).toEqual({ text: "Out at Online", tone: "danger" });
    });

    it("takes the accent at its warning level, from Needs you", () => {
        expect(stockWords(at(3), need("low", { canSell: 3 }))).toEqual({
            text: "3 to sell",
            tone: "warn",
        });
    });

    it("stays calm about what Needs you leaves out (a draft)", () => {
        expect(stockWords(at(0))).toEqual({
            text: "Out of stock",
            tone: "muted",
        });
    });
});
