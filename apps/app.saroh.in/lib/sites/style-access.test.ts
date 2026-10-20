import { describe, expect, it } from "vitest";

import type { SiteStyle, SiteStyleOptions } from "./style";
import type { SiteStyleAccess } from "./style-access";
import { ALL_FREE, paidRefusalWords, styleChoiceRules } from "./style-access";

/** DEC-177: what the Style panel marks paid and refuses, from the API's answer. */

const options: SiteStyleOptions = {
    rows: [],
    scalars: [],
    fontPairs: [
        { key: "system", name: "System" },
        { key: "own", name: "Own" },
        { key: "paid", name: "Paid" },
    ],
    colourways: [
        {
            id: "kesar",
            name: "Kesar",
            style: { colours: {}, scalars: {}, palette: { bg: "#ffffff" } },
            chips: [],
        },
        {
            id: "mauve",
            name: "Mauve",
            style: { colours: {}, scalars: {}, palette: { bg: "#eeeeee" } },
            chips: [],
        },
    ] as unknown as SiteStyleOptions["colourways"],
};

const saved: SiteStyle = {
    colours: {},
    scalars: {},
    fontPair: "own",
    palette: { bg: "#ffffff" },
} as unknown as SiteStyle;

const access = (paidIncluded: boolean): SiteStyleAccess => ({
    free: {
        looks: ["quiet", "folio", "live"],
        fontPairs: ["system", "own"],
        colourways: ["kesar"],
    },
    paidIncluded,
});

describe("styleChoiceRules", () => {
    it("marks what isn't free, and refuses it on a plan without themes", () => {
        const rules = styleChoiceRules(access(false), saved, options);
        expect(rules.isPaid("fontPair", "paid")).toBe(true);
        expect(rules.isPaid("fontPair", "own")).toBe(false);
        expect(rules.isPaid("look", "folio")).toBe(false);
        expect(rules.refuses("fontPair", "paid")).toBe(true);
        expect(rules.refuses("colourway", "mauve")).toBe(true);
        expect(rules.refuses("colourway", "kesar")).toBe(false);
    });

    it("opens every paid one on a plan with themes, still marked", () => {
        const rules = styleChoiceRules(access(true), saved, options);
        expect(rules.isPaid("fontPair", "paid")).toBe(true);
        expect(rules.refuses("fontPair", "paid")).toBe(false);
        expect(rules.refuses("colourway", "mauve")).toBe(false);
    });

    it("never refuses what the server holds, or the live site's look", () => {
        const has = {
            ...saved,
            fontPair: "paid",
            palette: { bg: "#eeeeee" },
        } as unknown as SiteStyle;
        const paidLooks = {
            ...access(false),
            free: { ...access(false).free, looks: [] },
        };
        const rules = styleChoiceRules(paidLooks, has, options, "folio");
        expect(rules.refuses("fontPair", "paid")).toBe(false);
        expect(rules.refuses("colourway", "mauve")).toBe(false);
        expect(rules.refuses("look", "folio")).toBe(false);
        expect(rules.refuses("look", "live")).toBe(true);
    });

    it("reads an API without the answer as all free", () => {
        expect(styleChoiceRules(null, saved, options)).toBe(ALL_FREE);
        expect(ALL_FREE.refuses("fontPair", "paid")).toBe(false);
    });

    it("says why in one plain line", () => {
        expect(paidRefusalWords("Archivo")).toBe(
            "Archivo comes with a paid plan. Your site keeps what it has.",
        );
    });
});
