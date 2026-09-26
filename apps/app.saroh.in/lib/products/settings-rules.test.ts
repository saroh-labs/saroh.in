import { describe, expect, it } from "vitest";

import type { CatalogueView } from "./settings";
import {
    affected,
    changes,
    defaultsProblem,
    rowsFrom,
    suggestionText,
    toEntry,
} from "./settings-rules";

const view = {
    categories: [
        {
            id: "c1",
            name: "Serums",
            slug: "serums",
            parentId: null,
            productCount: 4,
        },
        {
            id: "c2",
            name: "Dresses",
            slug: "dresses",
            parentId: null,
            productCount: 6,
        },
    ],
    uncategorizedCount: 1,
    options: [],
    defaults: {
        entries: {
            all: {
                howToUse: null,
                lowStockAlert: 5,
                returnsMode: "STOREFRONT",
                returnsText: null,
            },
            c2: {
                howToUse: null,
                lowStockAlert: null,
                returnsMode: "OWN",
                returnsText: "Non-returnable",
            },
        },
        stillOnDefault: {
            all: { howToUse: 11, lowStockAlert: 9, returns: 11 },
            c1: { howToUse: 4, lowStockAlert: 3, returns: 4 },
            c2: { howToUse: 6, lowStockAlert: 6, returns: 5 },
        },
        productCounts: { all: 11, c1: 4, c2: 6 },
        suggestions: [],
    },
    canWrite: true,
} satisfies CatalogueView;

describe("product settings: defaults", () => {
    it("reads rows, with a category's empty field meaning All products", () => {
        const rows = rowsFrom(view);
        expect(rows.map((r) => r.key)).toEqual(["all", "c1", "c2"]);
        expect(rows[0]).toMatchObject({ low: "5", returns: "STOREFRONT" });
        expect(rows[1]).toMatchObject({ low: "", returns: "" });
        expect(rows[2]).toMatchObject({ returns: "OWN:Non-returnable" });
    });

    it("writes an entry back, empty as null", () => {
        const serums = rowsFrom(view)[1];
        expect(
            toEntry({ ...serums, howToUse: " Two drops ", low: "3" }),
        ).toEqual({
            key: "c1",
            howToUse: "Two drops",
            lowStockAlert: 3,
            returnsMode: null,
            returnsText: null,
        });
    });

    it("needs a whole number for All products, and allows a category to leave it empty", () => {
        const rows = rowsFrom(view);
        expect(defaultsProblem(rows)).toBe("");
        expect(defaultsProblem([{ ...rows[0], low: "" }])).toMatch(
            /whole number/,
        );
        expect(defaultsProblem([{ ...rows[1], low: "2.5" }])).toMatch(
            /whole number/,
        );
    });

    it("counts the saved products a save could update, never adding All on top", () => {
        const base = rowsFrom(view);
        const next = base.map((r) =>
            r.key === "c1"
                ? { ...r, low: "3" }
                : r.key === "c2"
                  ? { ...r, returns: "STOREFRONT" as const }
                  : r,
        );
        const changed = changes(next, base);
        expect(changed).toEqual([
            { key: "c1", field: "lowStockAlert" },
            { key: "c2", field: "returns" },
        ]);
        expect(
            affected(changed, view.defaults.stillOnDefault, {
                c1: "Serums",
                c2: "Dresses",
            }),
        ).toEqual({
            count: 8,
            where: "Serums 3, Dresses 5",
        });
        const allChanged = changes(
            base.map((r) => (r.key === "all" ? { ...r, low: "6" } : r)),
            base,
        );
        expect(
            affected(allChanged, view.defaults.stillOnDefault, {}).count,
        ).toBe(9);
    });

    it("words a suggestion", () => {
        expect(
            suggestionText(
                {
                    key: "c1",
                    field: "lowStockAlert",
                    value: 6,
                    count: 2,
                    total: 2,
                },
                "Serums",
            ),
        ).toBe("All 2 Serums warn at 6. Make it the default?");
        expect(
            suggestionText(
                {
                    key: "c1",
                    field: "howToUse",
                    value: "Two drops.",
                    count: 3,
                    total: 4,
                },
                "Serums",
            ),
        ).toBe("3 of your 4 Serums say “Two drops.” Make it the default?");
    });
});
