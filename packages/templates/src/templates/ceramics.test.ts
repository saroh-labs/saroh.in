import {
    inPageNavigation,
    isFontPairKey,
    parsePalette,
    parseSectionContent,
    parseTypeScale,
} from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { templateStylePreset } from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import {
    CERAMICS_COLLECTION_COUNT,
    CERAMICS_FOOTER_LINE,
    CERAMICS_TEMPLATE_ID,
    ceramicsTemplate,
} from "./ceramics";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

const selling: TemplateContext = {
    organizationName: "Sample Pottery",
    tagline: "Stoneware, thrown and fired in small runs.",
    contactEmail: "hello@pottery.example",
    modules: ["WEBSITE", "COMMERCE"],
};
const nameOnly: TemplateContext = { organizationName: "Sample Maker" };
const markup: TemplateContext = {
    organizationName: "Clay & <Co>",
    modules: ["COMMERCE"],
};

const profiles: [string, TemplateContext][] = [
    ["Commerce on, with a tagline", selling],
    ["a name only (no modules known)", nameOnly],
    ["Commerce off", { ...nameOnly, modules: ["WEBSITE", "CRM"] }],
    ["a name with markup characters", markup],
    ["a malformed module list", { ...nameOnly, modules: "COMMERCE" as never }],
];

function home(ctx: TemplateContext) {
    const { pages } = instantiateTemplate(ceramicsTemplate, ctx);
    return pages[0];
}

describe("ceramics@1, the gallery's Store (U5)", () => {
    it("is registered as the latest ceramics and offered in the picker", () => {
        expect(ceramicsTemplate.id).toBe(CERAMICS_TEMPLATE_ID);
        expect(ceramicsTemplate.version).toBe(1);
        expect(getTemplate("ceramics")).toBe(ceramicsTemplate);
        expect(listTemplates()).toContain(ceramicsTemplate);
    });

    it("carries the gallery's facts: Store, for shops and creators, on Products", () => {
        expect(ceramicsTemplate).toMatchObject({
            name: "Store",
            slug: "store",
            kinds: ["shop", "creator"],
            shape: "store",
            sample: { name: "Kiln", host: "kiln.saroh.app" },
            uses: ["COMMERCE"],
        });
    });

    it("has the design's two colourways, Green first, in Fraunces + Inter Tight", () => {
        const styles = ceramicsTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["green", "Green"],
            ["oxblood", "Oxblood"],
        ]);
        expect(templateStylePreset(ceramicsTemplate)?.id).toBe("green");
        for (const s of styles) {
            expect(isFontPairKey(s.style.fontPair)).toBe(true);
            expect(s.style.fontPair).toBe("fraunces-inter-tight");
            // Hairlines, not cards.
            expect(s.style.scalars?.cornerRadius).toBe(0);
        }
        expect(styles[0].style.colours).toMatchObject({
            pageGround: "sand",
            accent: "moss",
        });
        expect(styles[1].style.colours).toMatchObject({
            pageGround: "mist",
            accent: "clay",
        });
    });

    it("draws each colourway in the design's exact colours, every pairing at 4.5:1", () => {
        const [green, oxblood] = ceramicsTemplate.styles ?? [];
        expect(green.style.palette).toMatchObject({
            bg: "#F4F1E8",
            surface: "#EAE6DB",
            fg: "#1A1815",
            body: "#3B362E",
            muted: "#6E685E",
            border: "#DFDACD",
            accent: "#1F3D2B",
        });
        expect(oxblood.style.palette).toMatchObject({
            bg: "#F1F1F4",
            surface: "#DADADE",
            accent: "#4F2927",
        });
        for (const s of ceramicsTemplate.styles ?? []) {
            expect(parsePalette(s.style.palette)).toMatchObject({ ok: true });
            expect(parseTypeScale(s.style.type)).toEqual({
                ok: true,
                type: {
                    bodySize: 16,
                    measure: 62,
                    contentWidth: 1180,
                    labelStyle: "eyebrowAccent",
                },
            });
            // The hairlines between plates and photographs.
            expect(s.style.scalars?.gridGap).toBe(1);
        }
    });

    it("starts the footer as one left-set line that says what to write", () => {
        expect(ceramicsTemplate.footer).toEqual({
            line: CERAMICS_FOOTER_LINE,
            layout: "left",
        });
        expect(CERAMICS_FOOTER_LINE).toMatch(/^Your [^—]+ — /);
    });

    it("leads the header menu with Collection and Material, Collection only while it is laid down", () => {
        expect(inPageNavigation(home(selling).sections)).toEqual([
            { label: "Collection", href: "/#collection" },
            { label: "Material", href: "/#material" },
        ]);
        expect(inPageNavigation(home(nameOnly).sections)).toEqual([
            { label: "Material", href: "/#material" },
        ]);
    });

    it.each(profiles)(
        "instantiates and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(ceramicsTemplate, ctx);
            expect(pages).toHaveLength(1);
            for (const section of pages[0].sections) {
                expect(
                    parseSectionContent(
                        section.type,
                        section.contractVersion,
                        section.content,
                    ),
                ).toMatchObject({ success: true });
            }
        },
    );

    it("with Commerce on: the name, the collection, Material, its photos and the studio, in order", () => {
        const page = home(selling);
        expect(page).toMatchObject({ path: "/", isHome: true });
        expect(
            page.sections.map((s) => [
                s.type,
                (s.content as { variant?: string }).variant,
            ]),
        ).toEqual([
            ["hero", "none"],
            ["productGrid", "plates"],
            ["features", "grid"],
            ["gallery", "grid"],
            ["richText", undefined],
        ]);
        expect(page.sections.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
    });

    it.each([
        ["no modules known", nameOnly],
        ["Commerce off", { ...nameOnly, modules: ["WEBSITE"] }],
        ["a malformed module list", { ...nameOnly, modules: "COMMERCE" }],
    ] as [string, TemplateContext][])(
        "lays down no collection with %s",
        (_label, ctx) => {
            expect(home(ctx).sections.map((s) => s.type)).toEqual([
                "hero",
                "features",
                "gallery",
                "richText",
            ]);
        },
    );

    it("binds the collection to the catalogue: the newest pieces, typed in by nobody", () => {
        const grid = home(selling).sections.find(
            (s) => s.type === "productGrid",
        );
        expect(grid?.content).toEqual({
            variant: "plates",
            anchor: "collection",
            navLabel: "Collection",
            title: "Current collection",
            source: "newest",
            count: CERAMICS_COLLECTION_COUNT,
            showPrices: true,
            showAvailability: true,
            note: "Everything not marked sold out can be bought here.",
        });
        expect(grid?.content).not.toHaveProperty("productIds");
    });

    it.each(profiles)(
        "types no price, product or stockist, for %s",
        (_l, ctx) => {
            const copy = home(ctx)
                .sections.flatMap((s) => strings(s.content))
                .join(" ");
            expect(copy).not.toMatch(/₹|\bRs\b|\d[\d,]*\.\d\d|\d{3,}/);
            expect(copy).not.toMatch(
                /celadon dinner plate|ash-glazed mug|serving bowl|tumbler/i,
            );
            expect(copy).not.toMatch(/stocked|stockist|objectry|form room/i);
            // Kiln's own facts are the sample's, not the template's.
            expect(copy).not.toMatch(/nashik|koregaon|pune|anjali|kiln\.in/i);
        },
    );

    it("gives the page its h1 for screen readers only: the header already shows the name", () => {
        for (const ctx of [selling, nameOnly]) {
            expect(home(ctx).sections[0].content).toEqual({
                variant: "none",
                heading: ctx.organizationName,
                titleVisible: false,
            });
        }
    });

    it("ships its photographs as the design's briefs, and no image", () => {
        const sections = home(selling).sections;
        const gallery = sections.find((s) => s.type === "gallery");
        const shelf = gallery?.content as {
            images: unknown[];
            imageBrief?: string;
        };
        expect(shelf.images).toEqual([]);
        expect(gallery?.content).toMatchObject({ captionPlacement: "below" });
        expect(shelf.imageBrief).toMatch(/grog.*glaze.*kiln shelf/);
        const studio = sections.find((s) => s.type === "richText");
        expect(studio?.content).toMatchObject({
            imageBrief:
                "The wheel mid-throw, clay-covered hands and forearms, shallow depth of field",
            imageSide: "left",
        });
        expect(studio?.content).not.toHaveProperty("image");
        expect(JSON.stringify(sections)).not.toMatch(
            /"src"|\.(png|jpe?g|webp|svg|gif)\b/i,
        );
    });

    it("says plainly that the words about the work are placeholders", () => {
        const sections = home(nameOnly).sections;
        const material = sections.find((s) => s.type === "features");
        const items = (
            material?.content as { items: { title: string; body: string }[] }
        ).items;
        expect(items.map((i) => i.title)).toEqual([
            "The clay",
            "The glaze",
            "The firing",
        ]);
        for (const item of items) expect(item.body).toMatch(/^A placeholder\./);
        const studio = strings(
            sections.find((s) => s.type === "richText")?.content,
        ).join(" ");
        expect(studio).toContain("<h2>The studio</h2>");
        expect(studio).toContain("This is a placeholder");
        expect(studio).toContain("Replace both paragraphs with your own.");
        // The facts are a definition list, each value saying what to write.
        expect(studio).toContain(
            "<dl><dt>Studio</dt><dd>Your area and town — ",
        );
        expect(studio).toContain("<dt>Throwing since</dt>");
    });

    it("escapes the name where it is woven into HTML", () => {
        const html = strings(
            home(markup).sections.find((s) => s.type === "richText")?.content,
        ).join(" ");
        expect(html).toContain("Clay &amp; &lt;Co&gt;");
        expect(html).not.toContain("<Co>");
    });

    it.each(profiles)("speaks for no one but the owner, for %s", (_l, ctx) => {
        const copy = home(ctx)
            .sections.flatMap((s) => strings(s.content))
            .join(" ")
            .toLowerCase();
        expect(copy).not.toMatch(/\bwe('ll|'re|ve)?\b|\bour\b|\bus\b/);
        expect(copy).not.toMatch(/award|trusted|years of|best/);
    });
});
