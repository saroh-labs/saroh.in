import {
    contrastRatio,
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
    STUDIO_PROJECT_BRIEFS,
    STUDIO_TEMPLATE_ID,
    studioTemplate,
} from "./studio";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

const full: TemplateContext = {
    organizationName: "Sample Studio",
    tagline: "Identity, packaging and signage.",
    contactEmail: "hello@studio.example",
    modules: ["WEBSITE", "CRM"],
};
const nameOnly: TemplateContext = { organizationName: "Sample Maker" };
const markup: TemplateContext = {
    organizationName: "Form & <Room>",
    contactEmail: "hi@form.example",
};

const profiles: [string, TemplateContext][] = [
    ["a full profile", full],
    ["a name only", nameOnly],
    ["Website alone", { ...nameOnly, modules: ["WEBSITE"] }],
    ["a name with markup characters", markup],
    ["an email that is not an address", { ...nameOnly, contactEmail: "n/a" }],
    ["a malformed email", { ...nameOnly, contactEmail: 42 as never }],
];

function home(ctx: TemplateContext) {
    return instantiateTemplate(studioTemplate, ctx).pages[0];
}

describe("studio@1, the gallery's Portfolio (U10)", () => {
    it("is registered as the latest studio and offered in the picker", () => {
        expect(studioTemplate.id).toBe(STUDIO_TEMPLATE_ID);
        expect(studioTemplate.version).toBe(1);
        expect(getTemplate("studio")).toBe(studioTemplate);
        expect(listTemplates()).toContain(studioTemplate);
    });

    it("carries the gallery's facts: a portfolio for creators, on the Website and CRM", () => {
        expect(studioTemplate).toMatchObject({
            name: "Studio",
            slug: "studio",
            kinds: ["creator"],
            shape: "portfolio",
            sample: { name: "Studio Neue", host: "studioneue.saroh.app" },
            uses: ["WEBSITE", "CRM"],
        });
    });

    it("has the design's two colourways, Mono first, in Archivo alone", () => {
        const styles = studioTemplate.styles ?? [];
        expect(styles.map((s) => [s.id, s.name])).toEqual([
            ["mono", "Mono"],
            ["ivory", "Ivory"],
        ]);
        expect(templateStylePreset(studioTemplate)?.id).toBe("mono");
        for (const s of styles) {
            expect(isFontPairKey(s.style.fontPair)).toBe(true);
            expect(s.style.fontPair).toBe("archivo");
            expect(s.style.scalars?.cornerRadius).toBe(0);
            // Ink on a pale ground: the design's near-black and near-white.
            expect(s.style.colours?.text).toBe("ink");
        }
        expect(styles[0].style.colours?.pageGround).toBe("bone");
        expect(styles[1].style.colours?.pageGround).toBe("sand");
    });

    it("draws the design's exact colours, with no coloured accent: the accent is the ink", () => {
        const [mono, ivory] = studioTemplate.styles ?? [];
        expect(mono.style.palette).toMatchObject({
            bg: "#F7F7F6",
            surface: "#E8E8E6",
            fg: "#131313",
        });
        expect(ivory.style.palette).toMatchObject({
            bg: "#FDF6EE",
            surface: "#EEE6DF",
            fg: "#17120D",
        });
        for (const preset of [mono, ivory]) {
            const palette = preset.style.palette;
            expect(palette?.accent).toBe(palette?.fg);
            expect(palette?.accentFg).toBe(palette?.bg);
            const parsed = parsePalette(palette);
            expect(parsed.ok).toBe(true);
            if (parsed.ok) {
                expect(
                    contrastRatio(parsed.palette.muted, parsed.palette.bg),
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it("sets a 1320px frame with 3px between photographs", () => {
        for (const preset of studioTemplate.styles ?? []) {
            expect(preset.style.type).toMatchObject({
                contentWidth: 1320,
                labelStyle: "eyebrow",
            });
            expect(parseTypeScale(preset.style.type).ok).toBe(true);
            expect(preset.style.scalars?.gridGap).toBe(3);
        }
    });

    it("leads the header with Work, Studio and Contact, and starts the footer on a line to write over", () => {
        expect(inPageNavigation(home(full).sections)).toEqual([
            { label: "Work", href: "/#work" },
            { label: "Studio", href: "/#studio" },
            { label: "Contact", href: "/#contact" },
        ]);
        expect(studioTemplate.footer).toEqual({
            line: "Your studio's street and city",
            layout: "left",
        });
    });

    it.each(profiles)(
        "instantiates and every section passes the contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(studioTemplate, ctx);
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

    it("opens on the work: the name small, then the projects, the studio and contact", () => {
        const page = home(full);
        expect(page).toMatchObject({ path: "/", isHome: true });
        expect(
            page.sections.map((s) => [
                s.type,
                (s.content as { variant?: string }).variant,
            ]),
        ).toEqual([
            ["hero", "none"],
            ["projects", "rhythm"],
            ["richText", "left"],
            ["enquiry", undefined],
            ["contact", undefined],
        ]);
        expect(page.sections.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
    });

    it.each([
        ["no email", nameOnly],
        [
            "an email that is not an address",
            { ...nameOnly, contactEmail: "n/a" },
        ],
        ["a blank email", { ...nameOnly, contactEmail: "  " }],
    ] as [string, TemplateContext][])(
        "lays down no contact details with %s, and the form still",
        (_label, ctx) => {
            expect(home(ctx).sections.map((s) => s.type)).toEqual([
                "hero",
                "projects",
                "richText",
                "enquiry",
            ]);
        },
    );

    it("shows the business's own email beside the form", () => {
        const contact = home(full).sections.find((s) => s.type === "contact");
        expect(contact?.content).toEqual({ email: "hello@studio.example" });
    });

    it("keeps the page's h1 for screen readers only: the first project is the top", () => {
        expect(home(full).sections[0].content).toEqual({
            variant: "none",
            heading: "Sample Studio",
            titleVisible: false,
        });
        expect(home(nameOnly).sections[0].content).toEqual({
            variant: "none",
            heading: "Sample Maker",
            titleVisible: false,
        });
    });

    it("ships five placeholder projects, each with the design's photograph as a brief and no image", () => {
        const projects = home(full).sections.find((s) => s.type === "projects");
        const items = (
            projects?.content as {
                items: {
                    title: string;
                    summary: string;
                    caption: string;
                    imageBrief: string;
                }[];
            }
        ).items;
        // Over the photo, in the rhythm's lead, pair and offset order.
        expect(projects?.content).toMatchObject({
            variant: "rhythm",
            captionPlacement: "over",
        });
        expect(items).toHaveLength(5);
        expect(items.map((i) => i.imageBrief)).toEqual([
            ...STUDIO_PROJECT_BRIEFS,
        ]);
        for (const item of items) {
            expect(item.title).toMatch(/^Your \w+ project$/);
            expect(item.summary).toMatch(/^A placeholder\./);
            expect(item.caption).toBe("What you made · the year");
            expect(item).not.toHaveProperty("image");
            expect(item).not.toHaveProperty("link");
        }
        expect(JSON.stringify(home(full).sections)).not.toMatch(
            /"src"|\.(png|jpe?g|webp|svg|gif)\b/i,
        );
    });

    it.each(profiles)(
        "names no client, price or sample fact, for %s",
        (_l, ctx) => {
            const copy = home(ctx)
                .sections.flatMap((s) => strings(s.content))
                .filter(
                    (s) =>
                        !(STUDIO_PROJECT_BRIEFS as readonly string[]).includes(
                            s,
                        ),
                )
                .join(" ");
            expect(copy).not.toMatch(/₹|\bRs\b|\d[\d,]*\.\d\d|\d{3,}/);
            // The sample's clients, people, town and dates are Studio Neue's.
            expect(copy).not.toMatch(
                /kadak|meridian|northwind|halcyon|kiln|rye & co|objectry|form room|iron & oak/i,
            );
            expect(copy).not.toMatch(
                /anaya|rohan|bandra|mumbai|st leo|studioneue|january/i,
            );
            expect(copy).not.toMatch(/worked with/i);
        },
    );

    it("says plainly that the studio's words are placeholders, and lists three facts", () => {
        const html = strings(
            home(nameOnly).sections.find((s) => s.type === "richText")?.content,
        ).join(" ");
        expect(html).toContain("<h2>Studio</h2>");
        expect(html).toContain("This is a placeholder");
        expect(html).toContain("Replace all three paragraphs with your own.");
        expect(html.match(/<p>/g)).toHaveLength(3);
        expect(html.match(/<dt>/g)).toHaveLength(3);
        for (const label of ["Studio", "Who", "Since"]) {
            expect(html).toContain(`<dt>${label}</dt>`);
        }
    });

    it("escapes the name where it is woven into HTML", () => {
        const html = strings(
            home(markup).sections.find((s) => s.type === "richText")?.content,
        ).join(" ");
        expect(html).toContain("Form &amp; &lt;Room&gt;");
        expect(html).not.toContain("<Room>");
    });

    it("asks for the problem in an enquiry with an email to reply to", () => {
        const enquiry = home(nameOnly).sections.find(
            (s) => s.type === "enquiry",
        )?.content as { title: string; fields: { type: string }[] };
        expect(enquiry.title).toBe(
            "If you have something that needs drawing, describe it badly.",
        );
        expect(enquiry.fields.map((f) => f.type)).toEqual([
            "text",
            "email",
            "textarea",
        ]);
        expect(enquiry).not.toHaveProperty("formId");
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
