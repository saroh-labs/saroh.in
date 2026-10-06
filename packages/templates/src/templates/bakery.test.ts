import { isFontPairKey, parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import {
    TEMPLATE_KINDS,
    TEMPLATE_SHAPES,
    templateStylePreset,
} from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import {
    BAKERY_IMAGE_BRIEFS,
    BAKERY_TEMPLATE_ID,
    bakeryTemplate,
} from "./bakery";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

const withProducts: TemplateContext = {
    organizationName: "Rye & Co.",
    contactEmail: "hello@bakery.example",
    modules: ["WEBSITE", "COMMERCE"],
};
const withoutProducts: TemplateContext = {
    organizationName: "Sample Bakery",
    modules: ["WEBSITE"],
};
const nameOnly: TemplateContext = { organizationName: "Crumb <&> Co" };

const profiles: [string, TemplateContext][] = [
    ["Products on", withProducts],
    ["Products off", withoutProducts],
    ["a name only (modules unknown)", nameOnly],
];

function home(ctx: TemplateContext) {
    return instantiateTemplate(bakeryTemplate, ctx).pages[0];
}

describe("bakery@1 (industry templates U4)", () => {
    it("is registered and listed as the latest bakery", () => {
        expect(bakeryTemplate.id).toBe(BAKERY_TEMPLATE_ID);
        expect(bakeryTemplate.version).toBe(1);
        expect(getTemplate("bakery")).toBe(bakeryTemplate);
        expect(listTemplates()).toContain(bakeryTemplate);
    });

    it("describes itself for the picker and the gallery", () => {
        expect(bakeryTemplate).toMatchObject({
            name: "Bakery",
            slug: "bakery",
            kinds: ["food"],
            shape: "store",
            sample: { name: "Rye & Co.", host: "ryeandco.saroh.app" },
            uses: ["COMMERCE"],
        });
        for (const kind of bakeryTemplate.kinds ?? []) {
            expect(TEMPLATE_KINDS).toContain(kind);
        }
        expect(TEMPLATE_SHAPES).toContain(bakeryTemplate.shape);
    });

    it("comes in Crust, the default, and Porcelain, both in Fraunces and Inter Tight", () => {
        expect(bakeryTemplate.styles?.map((s) => [s.id, s.name])).toEqual([
            ["crust", "Crust"],
            ["porcelain", "Porcelain"],
        ]);
        expect(templateStylePreset(bakeryTemplate)?.id).toBe("crust");
        expect(templateStylePreset(bakeryTemplate, "porcelain")?.id).toBe(
            "porcelain",
        );
        for (const preset of bakeryTemplate.styles ?? []) {
            expect(preset.style.fontPair).toBe("fraunces-inter-tight");
            expect(isFontPairKey(preset.style.fontPair)).toBe(true);
            // Square corners: the design draws none.
            expect(preset.style.scalars?.cornerRadius).toBe(0);
        }
    });

    it.each(profiles)(
        "instantiates and every section passes the contract, with %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(bakeryTemplate, ctx);
            expect(pages.map((p) => p.path)).toEqual(["/"]);
            expect(pages[0].isHome).toBe(true);
            for (const section of pages.flatMap((p) => p.sections)) {
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

    it("lays the page down in the design's order, the bread only while Products is on", () => {
        const looks = (ctx: TemplateContext) =>
            home(ctx).sections.map((s) => [
                s.type,
                (s.content as { variant?: string }).variant,
            ]);
        expect(looks(withProducts)).toEqual([
            ["hero", "fullBleed"],
            ["productGrid", "default"],
            ["richText", undefined],
            ["hours", "default"],
            ["journal", "archive"],
        ]);
        expect(looks(withoutProducts).map(([type]) => type)).toEqual([
            "hero",
            "richText",
            "hours",
            "journal",
        ]);
        expect(looks(nameOnly).map(([type]) => type)).not.toContain(
            "productGrid",
        );
        // `order` counts only the sections laid down.
        expect(home(withoutProducts).sections.map((s) => s.order)).toEqual([
            0, 1, 2, 3,
        ]);
    });

    it("opens on the photo, with whether the bakery is open, and the design's headline", () => {
        expect(home(withProducts).sections[0].content).toEqual({
            variant: "fullBleed",
            heading: "Bread worth the walk",
            subheading:
                "What's on the shelf at Rye & Co. today, and when to come in.",
            imageBrief: BAKERY_IMAGE_BRIEFS.hero,
            onToday: true,
        });
        expect(
            home({ ...withProducts, tagline: "Sourdough on Hill Road." })
                .sections[0].content,
        ).toMatchObject({ subheading: "Sourdough on Hill Road." });
    });

    it("reads the bread, the hours and the posts from the business, never types them", () => {
        const [, grid, , hours, journal] = home(withProducts).sections;
        expect(grid.content).toEqual({
            variant: "default",
            title: "Today's bread",
            source: "newest",
            count: 5,
        });
        expect(hours.content).toEqual({
            variant: "default",
            title: "Come in the morning",
        });
        expect(journal.content).toEqual({
            variant: "archive",
            title: "From the bakery",
        });
        // The sample business's own name aside, which it is given.
        const copy = home({ ...withProducts, organizationName: "Sample" })
            .sections.flatMap((s) => strings(s.content))
            .join(" ");
        // No price, no clock time, no date: those are the business's.
        expect(copy).not.toMatch(/₹|\$|£|€|\d{1,2}:\d{2}|\b(19|20)\d{2}\b/);
        expect(copy).not.toMatch(/sourdough|rye|olive|milk bread|cardamom/i);
        expect(copy).not.toMatch(/Hill Road|Bandra|Priya/);
    });

    it("tells the story as a placeholder with the photo as a brief, and escapes the name", () => {
        const story = home(nameOnly).sections.find(
            (s) => s.type === "richText",
        );
        expect(story?.content).toMatchObject({
            format: "html",
            imageBrief: BAKERY_IMAGE_BRIEFS.story,
            imageSide: "right",
        });
        const html = (story?.content as { value: string }).value;
        expect(html).toContain(
            "<h2>Everything here begins in a clip-top jar</h2>",
        );
        expect(html).toContain("This is a placeholder");
        expect(html).toContain("Crumb &lt;&amp;&gt; Co");
        expect(html).not.toContain("<&>");
    });

    it("carries no image and no asset path: every photo is a brief", () => {
        for (const section of home(withProducts).sections) {
            expect(section.content).not.toHaveProperty("image");
            expect(JSON.stringify(section.content)).not.toMatch(
                /\.(png|jpe?g|webp|svg|gif)\b/i,
            );
        }
        for (const brief of Object.values(BAKERY_IMAGE_BRIEFS)) {
            expect(brief.length).toBeLessThanOrEqual(200);
        }
    });

    it("gives each site its own copy of literal content", () => {
        const a = home(withProducts).sections[1].content;
        const b = home(withProducts).sections[1].content;
        expect(a).toEqual(b);
        expect(a).not.toBe(b);
    });
});
