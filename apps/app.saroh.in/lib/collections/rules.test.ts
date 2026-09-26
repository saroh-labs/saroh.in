import { describe, expect, it } from "vitest";

import type { ProductPlacement } from "@/lib/products/overview-rules";

import type { SheetValues } from "./rules";
import {
    capacity,
    categoryChoices,
    categoryPath,
    COLLECTION_PRODUCTS_MAX,
    collectionNote,
    createBody,
    editChanges,
    membershipRows,
    movePicked,
    oneWebsiteLine,
    pickedIds,
    ruleNote,
    sheetProblem,
    togglePicked,
    websiteLine,
    whyIn,
} from "./rules";
import type { CollectionSummary } from "./service";

const categories = [
    { id: "bread", name: "Breads", parentId: null },
    { id: "sour", name: "Sourdough", parentId: "bread" },
    { id: "rye", name: "Rye", parentId: "sour" },
    { id: "cake", name: "Cakes", parentId: null },
];

const NOT_YET = { showsProducts: false, pages: [] };

function summary(over: Partial<CollectionSummary>): CollectionSummary {
    return {
        id: "c1",
        name: "Weekend bakes",
        slug: "weekend-bakes",
        description: null,
        kind: "HAND_PICKED",
        category: null,
        productCount: 4,
        website: NOT_YET,
        createdAt: "2026-09-20T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
        ...over,
    };
}

const BLANK: SheetValues = {
    name: "",
    description: "",
    kind: "HAND_PICKED",
    categoryId: "",
    productIds: [],
};

describe("a collection's card (#524)", () => {
    it("says how it fills and how many it shows, as the design does", () => {
        expect(collectionNote(summary({}))).toBe("4 products · picked by hand");
        expect(
            collectionNote(
                summary({
                    kind: "AUTOMATIC",
                    productCount: 1,
                    category: { id: "bread", name: "Breads" },
                }),
            ),
        ).toBe("1 product · fills itself: everything in Breads");
    });

    it("says the website doesn't show products yet — once, not on every card", () => {
        expect(websiteLine(NOT_YET)).toBe(
            "The website doesn't show products yet.",
        );
        expect(oneWebsiteLine([summary({}), summary({ id: "c2" })])).toMatch(
            /doesn't show products yet/,
        );
        expect(websiteLine(undefined)).toBeNull();
    });

    it("names the live pages once the website can show products", () => {
        const shown = {
            showsProducts: true,
            pages: [
                { siteId: "s", siteName: "Rye", path: "/", title: "Home" },
                { siteId: "s", siteName: "Rye", path: "/menu", title: "" },
            ],
        };
        expect(websiteLine(shown)).toBe("Shown on Home, /menu");
        expect(websiteLine({ showsProducts: true, pages: [] })).toBe(
            "No live page shows it.",
        );
        expect(oneWebsiteLine([summary({ website: shown })])).toBeNull();
    });
});

describe("the automatic rule: a category and the ones inside it", () => {
    it("writes each category with the ones above it, children under parents", () => {
        expect(categoryPath(categories, "rye")).toBe(
            "Breads › Sourdough › Rye",
        );
        expect(categoryChoices(categories).map((c) => c.label)).toEqual([
            "Breads",
            "Breads › Sourdough",
            "Breads › Sourdough › Rye",
            "Cakes",
        ]);
    });

    it("says what the rule reaches", () => {
        expect(ruleNote(categories, "bread")).toBe(
            "Everything in Breads and the 2 categories inside it. Products join and leave as their category changes.",
        );
        expect(ruleNote(categories, "cake")).toBe(
            "Everything in Cakes. Products join and leave as their category changes.",
        );
        expect(ruleNote(categories, "")).toBe(
            "Pick the category it fills itself from.",
        );
    });

    it("says why a product is in an automatic collection", () => {
        const auto = {
            kind: "AUTOMATIC" as const,
            category: { id: "bread", name: "Breads" },
        };
        expect(whyIn(auto, "bread", categories)).toBe("It's in Breads.");
        expect(whyIn(auto, "rye", categories)).toBe(
            "It's in Rye, inside Breads.",
        );
        expect(
            whyIn({ kind: "HAND_PICKED", category: null }, "rye", categories),
        ).toBeNull();
    });
});

describe("picking by hand, up to 500", () => {
    it("picks, unpicks and reorders", () => {
        expect(togglePicked(["a"], "b")).toEqual(["a", "b"]);
        expect(togglePicked(["a", "b"], "a")).toEqual(["b"]);
        expect(movePicked(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
        expect(movePicked(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    });

    it("won't pick past the cap, and says it is full", () => {
        const full = Array.from(
            { length: COLLECTION_PRODUCTS_MAX },
            (_, i) => `p${i}`,
        );
        expect(togglePicked(full, "one-more")).toHaveLength(
            COLLECTION_PRODUCTS_MAX,
        );
        expect(capacity(full.length)).toMatchObject({
            full: true,
            words: "Full — a collection holds up to 500 products.",
        });
        expect(capacity(12)).toMatchObject({ left: 488, words: "12 of 500" });
        expect(
            sheetProblem({
                ...BLANK,
                name: "Big",
                productIds: [...full, "x"],
            }),
        ).toMatchObject({ field: "productIds" });
    });
});

describe("the collection sheet", () => {
    it("needs a name, and a category for an automatic one", () => {
        expect(sheetProblem(BLANK)).toMatchObject({ field: "name" });
        expect(sheetProblem({ ...BLANK, name: "—" })).toMatchObject({
            field: "name",
            message: "Use a few letters or numbers in the name.",
        });
        expect(
            sheetProblem({ ...BLANK, name: "Bread", kind: "AUTOMATIC" }),
        ).toMatchObject({ field: "categoryId" });
        expect(sheetProblem({ ...BLANK, name: "Gifts" })).toBeNull();
    });

    it("makes a new one with a category or products, never both", () => {
        expect(
            createBody({
                ...BLANK,
                name: " Bread ",
                kind: "AUTOMATIC",
                categoryId: "bread",
                productIds: ["p1"],
            }),
        ).toEqual({ name: "Bread", categoryId: "bread" });
        expect(
            createBody({ ...BLANK, name: "Gifts", productIds: ["p1", "p2"] }),
        ).toEqual({ name: "Gifts", productIds: ["p1", "p2"] });
    });

    it("sends only what an edit changed, and the list whole when it moved", () => {
        const before = { ...BLANK, name: "Gifts", productIds: ["a", "b"] };
        expect(editChanges(before, before)).toEqual({
            patch: {},
            products: null,
        });
        expect(
            editChanges(before, {
                ...before,
                description: "For giving",
                productIds: ["b", "a"],
            }),
        ).toEqual({
            patch: { description: "For giving" },
            products: ["b", "a"],
        });
        expect(
            editChanges(
                { ...before, description: "Old" },
                { ...before, description: " " },
            ).patch,
        ).toEqual({ description: null });
    });
});

describe("the product page's Edit collections", () => {
    const all = [
        summary({ id: "gifts", name: "Gifts" }),
        summary({
            id: "bread",
            name: "Bread",
            kind: "AUTOMATIC",
            category: { id: "bread", name: "Breads" },
        }),
        summary({
            id: "full",
            name: "Everything",
            productCount: COLLECTION_PRODUCTS_MAX,
        }),
    ];
    const placement: ProductPlacement = {
        collections: [
            {
                id: "bread",
                name: "Bread",
                kind: "AUTOMATIC",
                category: { id: "bread", name: "Breads" },
                showing: true,
            },
            {
                id: "gifts",
                name: "Gifts",
                kind: "HAND_PICKED",
                category: null,
                showing: true,
            },
        ],
        website: NOT_YET,
    };

    it("ticks what it is in, locks automatic and full ones, and saves only hand-picked", () => {
        const rows = membershipRows(all, placement);
        expect(rows.map((r) => [r.id, r.on, r.locked])).toEqual([
            ["gifts", true, false],
            ["bread", true, true],
            ["full", false, true],
        ]);
        expect(rows[1]?.note).toBe(
            "Fills itself from the category Breads — change the product's category to change this.",
        );
        expect(rows[2]?.note).toMatch(/^Full/);
        expect(pickedIds(rows, all)).toEqual(["gifts"]);
    });
});
