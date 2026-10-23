import {
    STYLE_ACCESS_FIXTURE as F,
    siteFreeStyles,
    STYLE_ACCESS_CASES,
} from "@saroh/block-contract";
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
        // Classic is the only free look (DEC-177, owner 21 Oct).
        looks: [],
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
        expect(rules.isPaid("look", "folio")).toBe(true);
        expect(rules.refuses("look", "quiet")).toBe(true);
        expect(rules.refuses("fontPair", "paid")).toBe(true);
        expect(rules.refuses("colourway", "mauve")).toBe(true);
        expect(rules.refuses("colourway", "kesar")).toBe(false);
    });

    it("opens every paid one on a plan with themes, still marked", () => {
        const rules = styleChoiceRules(access(true), saved, options);
        expect(rules.isPaid("fontPair", "paid")).toBe(true);
        expect(rules.refuses("fontPair", "paid")).toBe(false);
        expect(rules.refuses("colourway", "mauve")).toBe(false);
        expect(rules.refuses("look", "quiet")).toBe(false);
    });

    it("frees a look the owner ticks in admin", () => {
        const ticked = {
            ...access(false),
            free: { ...access(false).free, looks: ["quiet" as const] },
        };
        const rules = styleChoiceRules(ticked, saved, options);
        expect(rules.refuses("look", "quiet")).toBe(false);
        expect(rules.refuses("look", "folio")).toBe(true);
    });

    it("never refuses what the server holds, or the live site's look", () => {
        const has = {
            ...saved,
            fontPair: "paid",
            palette: { bg: "#eeeeee" },
        } as unknown as SiteStyle;
        const rules = styleChoiceRules(access(false), has, options, "folio");
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

/**
 * The same fixtures the API's save runs (review #22,
 * `site-style-free.spec.ts`): what the panel marks and refuses is what the
 * save refuses.
 */
describe("styleChoiceRules, on the shared fixtures", () => {
    const bgs = ["#ffffff", "#eeeeee", "#dddddd"];
    const shared: SiteStyleOptions = {
        rows: [],
        scalars: [],
        // A list whose first isn't the system font: no pair saved is still
        // the system font, as the API holds it.
        fontPairs: [
            { key: "archivo", name: "Archivo" },
            { key: "system", name: "System" },
        ],
        colourways: F.colourwayIds.map((id, i) => ({
            id,
            name: id,
            style: { colours: {}, scalars: {}, palette: { bg: bgs[i] } },
            chips: [],
        })) as unknown as SiteStyleOptions["colourways"],
    };
    const template = {
        id: F.templateId,
        styles: F.colourwayIds.map((id) => ({
            id,
            style: { fontPair: F.ownPair },
        })),
    };
    const stored = {
        colours: {},
        scalars: {},
        fontPair: F.ownPair,
        palette: { bg: bgs[0] },
    } as unknown as SiteStyle;

    it.each(STYLE_ACCESS_CASES)("$name", (c) => {
        const rules = styleChoiceRules(
            {
                free: siteFreeStyles(F.lists, template, F.startColourway),
                paidIncluded: false,
            },
            stored,
            shared,
            c.liveLook ?? null,
        );
        expect(rules.isPaid(c.kind, c.id)).toBe(c.paid);
        expect(rules.refuses(c.kind, c.id)).toBe(c.refused);
    });

    it("never refuses going back to the system font when no pair is saved", () => {
        const { fontPair: _pair, ...noPair } = stored;
        const rules = styleChoiceRules(
            {
                free: { looks: [], fontPairs: [], colourways: [] },
                paidIncluded: false,
            },
            noPair,
            shared,
        );
        expect(rules.refuses("fontPair", "system")).toBe(false);
        expect(rules.refuses("fontPair", "archivo")).toBe(true);
    });
});
