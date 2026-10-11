import { describe, expect, it } from "vitest";

import { instantiateTemplate, TemplateInstantiationError } from "./instantiate";
import type { TemplateManifest } from "./manifest";
import { listTemplates } from "./registry";

/**
 * What a template sets beside its blocks (industry templates, polish pass):
 * a section's anchor, menu label and band, and the footer it starts with.
 */

const text = (extra: Record<string, unknown>) => ({
    type: "richText" as const,
    contractVersion: 1 as const,
    content: { format: "html", value: "<p>Hello</p>", ...extra },
});

const manifest = (
    sections: ReturnType<typeof text>[],
    extra: Partial<TemplateManifest> = {},
): TemplateManifest => ({
    id: "frame-test",
    version: 1,
    name: "Frame test",
    pages: [{ path: "/", title: "Home", isHome: true, sections }],
    ...extra,
});

describe("a template's section frames", () => {
    it("lays down a section's anchor, menu label and band", () => {
        const { pages } = instantiateTemplate(
            manifest([
                text({ anchor: "visit", navLabel: "Visit", band: "inverse" }),
            ]),
            { organizationName: "Rye & Co." },
        );
        expect(pages[0].sections[0].content).toMatchObject({
            anchor: "visit",
            navLabel: "Visit",
            band: "inverse",
        });
    });

    it("refuses a page that repeats an anchor, naming the section", () => {
        let error: unknown;
        try {
            instantiateTemplate(
                manifest([
                    text({ anchor: "visit" }),
                    text({ anchor: "visit" }),
                ]),
                { organizationName: "Rye & Co." },
            );
        } catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(TemplateInstantiationError);
        expect((error as TemplateInstantiationError).sectionIndex).toBe(1);
        expect((error as Error).message).toMatch(/"visit"/);
    });
});

/**
 * Words that say what kind of business a site is. A template's starting
 * words are saved as the merchant's own, so one offered to a kind of
 * business must not name another: "when the studio is open" on a bakery's
 * site (Store, offered to every shop).
 */
const TRADE_WORDS: readonly [string, RegExp][] = [
    ["studio", /\bstudios?\b/i],
    ["clinic", /\bclinics?\b/i],
    ["salon", /\bsalons?\b/i],
    ["gym", /\bgyms?\b/i],
    ["bakery", /\bbaker(y|ies)\b/i],
    ["kitchen", /\bkitchens?\b/i],
    ["café", /\bcaf[eé]s?\b/i],
    ["menu", /\bmenus?\b/i],
    ["patient", /\bpatients?\b/i],
    ["class", /\bclass(es)?\b/i],
    ["shop", /\bshops?\b/i],
    ["store", /\bstores?\b/i],
];

/**
 * The trade words a text names that the template's own name does not: a
 * template called "Clinic" may say "clinic", one called "Store" may not say
 * "studio".
 */
function wrongTrades(template: TemplateManifest, text: string): string[] {
    return TRADE_WORDS.filter(
        ([, re]) => re.test(text) && !re.test(template.name),
    ).map(([word]) => word);
}

/** Every string inside a value, however deep. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

describe("a template's starting words fit the business it is applied to", () => {
    it.each(listTemplates().map((t) => [`${t.id}@${t.version}`, t] as const))(
        "%s: the footer names no other kind of business",
        (_, template) => {
            const line = template.footer?.line ?? "";
            expect(wrongTrades(template, line), line).toEqual([]);
        },
    );

    // A template with no `kinds` is offered to any business, so nothing it
    // lays down may name a kind of business at all.
    it.each(
        listTemplates()
            .filter((t) => (t.kinds?.length ?? 0) === 0)
            .map((t) => [`${t.id}@${t.version}`, t] as const),
    )("%s, for anyone: names no kind of business anywhere", (_, template) => {
        const { pages } = instantiateTemplate(template, {
            organizationName: "Rehearsal Bakery",
            tagline: undefined,
            modules: ["WEBSITE", ...(template.uses ?? [])],
        });
        const own = /\bRehearsal Bakery\b/g;
        const text = [
            template.footer?.line ?? "",
            ...strings(pages).map((s) => s.replace(own, "")),
        ].join("\n");
        expect(
            TRADE_WORDS.filter(([, re]) => re.test(text)).map(([w]) => w),
        ).toEqual([]);
    });

    it("gives a bakery that starts from Store a footer that fits it", () => {
        const store = listTemplates().find((t) => t.slug === "store");
        if (!store) throw new Error("Store is not registered");
        expect(store.kinds).toContain("shop");
        const line = store.footer?.line ?? "";
        expect(line).toBe("Your area and town · when you are open");
        expect(wrongTrades(store, line)).toEqual([]);
    });
});

describe("every registered template's footer", () => {
    it("is one plain line, if it sets one", () => {
        for (const template of listTemplates()) {
            const line = template.footer?.line;
            if (line === undefined) continue;
            expect(line.trim()).not.toBe("");
            expect(line).not.toMatch(/[\n<>]/);
            expect(line.length).toBeLessThanOrEqual(120);
        }
    });
});
