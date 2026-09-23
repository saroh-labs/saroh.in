import type { DefaultsEntry, ProductDefaults } from "./catalogue-defaults";
import {
    ALL_KEY,
    EMPTY_ENTRY,
    effectiveFor,
    stillOnDefault,
    suggestFor,
} from "./catalogue-defaults";

const entry = (over: Partial<DefaultsEntry>): DefaultsEntry => ({
    ...EMPTY_ENTRY,
    ...over,
});

describe("catalogue defaults", () => {
    const entries = {
        [ALL_KEY]: entry({ lowStockAlert: 5, returnsMode: "STOREFRONT" }),
        dresses: entry({
            returnsMode: "OWN",
            returnsText: "Exchange within 7 days, tags on",
        }),
        serums: entry({
            howToUse: "Two drops, morning and night.",
            lowStockAlert: 3,
        }),
    };

    it("takes the category's own value, else All products', else the built-in", () => {
        expect(effectiveFor(entries, "serums")).toEqual({
            howToUse: "Two drops, morning and night.",
            lowStockAlert: 3,
            returns: { mode: "STOREFRONT", text: null },
        });
        expect(effectiveFor(entries, "dresses")).toEqual({
            howToUse: null,
            lowStockAlert: 5,
            returns: { mode: "OWN", text: "Exchange within 7 days, tags on" },
        });
        // Uncategorized and a category with no row fall through to All.
        expect(effectiveFor(entries, null).lowStockAlert).toBe(5);
        expect(effectiveFor({}, "x")).toEqual({
            howToUse: null,
            lowStockAlert: 10,
            returns: { mode: "STOREFRONT", text: null },
        });
    });

    it("knows which saved products still hold the default", () => {
        const eff = effectiveFor(entries, "dresses");
        const dress = (over: Partial<ProductDefaults>): ProductDefaults => ({
            id: "p",
            categoryId: "dresses",
            howToUse: null,
            returns: { mode: "OWN", text: "Exchange within 7 days, tags on" },
            lowStockAlerts: [5, 5],
            ...over,
        });
        expect(stillOnDefault(dress({}), eff, "returns")).toBe(true);
        expect(stillOnDefault(dress({}), eff, "lowStockAlert")).toBe(true);
        expect(
            stillOnDefault(
                dress({ lowStockAlerts: [5, 2] }),
                eff,
                "lowStockAlert",
            ),
        ).toBe(false);
        expect(
            stillOnDefault(
                dress({ returns: { mode: "STOREFRONT", text: null } }),
                eff,
                "returns",
            ),
        ).toBe(false);
        // No stock rows: nothing to update, so not "on the default".
        expect(
            stillOnDefault(dress({ lowStockAlerts: [] }), eff, "lowStockAlert"),
        ).toBe(false);
    });

    it("suggests a value most of the category shares, at least three times", () => {
        const line = "Hand wash cold, dry in shade.";
        expect(
            suggestFor(
                "dresses",
                "howToUse",
                [line, line, line, line, line, null],
                null,
            ),
        ).toEqual({
            key: "dresses",
            field: "howToUse",
            value: line,
            count: 5,
            total: 6,
        });
        // Only two: not enough to call it a pattern.
        expect(
            suggestFor("dresses", "howToUse", [line, line, null], null),
        ).toBeNull();
        // Three of seven is not most of the category.
        expect(
            suggestFor("dresses", "lowStockAlert", [4, 4, 4, 2, 2, 1, 1], null),
        ).toBeNull();
        // Already the default: nothing to suggest.
        expect(suggestFor("serums", "lowStockAlert", [3, 3, 3], 3)).toBeNull();
    });
});
