import { parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { getTemplate } from "../registry";
import { PORTFOLIO_TEMPLATE_ID, portfolioTemplate } from "./portfolio";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/** Every value under `key` anywhere in a section's content. */
function valuesAt(value: unknown, key: string): unknown[] {
    if (Array.isArray(value)) {
        return value.flatMap((v: unknown) => valuesAt(v, key));
    }
    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(
            ([k, v]): unknown[] => (k === key ? [v] : valuesAt(v, key)),
        );
    }
    return [];
}

/** Every `href` and project `link`: everywhere the site's links go. */
function links(value: unknown): unknown[] {
    return [...valuesAt(value, "href"), ...valuesAt(value, "link")];
}

const profiles: [string, TemplateContext][] = [
    [
        "a full profile",
        {
            organizationName: "Example Studio",
            legalName: "Example Studio Ltd",
            tagline: "Identity and print for small places.",
            contactEmail: "hello@studio.example",
        },
    ],
    ["a name only", { organizationName: "Sample Maker" }],
    ["a name with markup characters", { organizationName: "Ink & <Paper>" }],
];

function sections(ctx: TemplateContext) {
    return instantiateTemplate(portfolioTemplate, ctx).pages.flatMap(
        (p) => p.sections,
    );
}

function projectsBlocks(ctx: TemplateContext) {
    return sections(ctx).filter((s) => s.type === "projects");
}

describe("portfolio@1 (DEC-070, K12)", () => {
    it("is the first version of the portfolio template", () => {
        expect(portfolioTemplate.id).toBe(PORTFOLIO_TEMPLATE_ID);
        expect(PORTFOLIO_TEMPLATE_ID).toBe("portfolio");
        expect(portfolioTemplate.version).toBe(1);
    });

    it("is not registered yet: K15 registers it", () => {
        expect(getTemplate(PORTFOLIO_TEMPLATE_ID)).toBeUndefined();
    });

    it.each(profiles)(
        "instantiates and every section passes the contract, for %s",
        (_label, ctx) => {
            for (const section of sections(ctx)) {
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

    it("lays down Home (hero, projects, enquiry), Work (projects) and About (words, contact)", () => {
        const { pages } = instantiateTemplate(
            portfolioTemplate,
            profiles[0][1],
        );
        expect(pages.map((p) => p.path)).toEqual(["/", "/work", "/about"]);
        expect(pages.filter((p) => p.isHome).map((p) => p.path)).toEqual(["/"]);
        expect(pages.map((p) => p.sections.map((s) => s.type))).toEqual([
            ["hero", "projects", "enquiry"],
            ["hero", "projects"],
            ["hero", "richText", "cta"],
        ]);
    });

    it("shows cards on Home and one project per row on Work", () => {
        const [home, work] = projectsBlocks(profiles[1][1]);
        expect(home.content).toMatchObject({
            variant: "cards",
            title: "Selected work",
        });
        expect(work.content).toMatchObject({ variant: "list" });
    });

    it("lays down three sample projects that read as placeholders", () => {
        for (const block of projectsBlocks(profiles[1][1])) {
            const items = (block.content as { items: unknown[] }).items;
            expect(items).toHaveLength(3);
            for (const item of items as {
                title: string;
                summary: string;
            }[]) {
                expect(item.title).toMatch(
                    /^Your (first|second|third) project$/,
                );
                expect(item.summary).toMatch(/^A placeholder\./);
            }
        }
    });

    it("gives each block its own copy of the projects", () => {
        const [home, work] = projectsBlocks(profiles[1][1]);
        const homeItems = (home.content as { items: unknown[] }).items;
        const workItems = (work.content as { items: unknown[] }).items;
        expect(homeItems).toEqual(workItems);
        expect(homeItems).not.toBe(workItems);
        expect(homeItems[0]).not.toBe(workItems[0]);
    });

    it.each(profiles)(
        "claims no client, result or feature, for %s",
        (_label, ctx) => {
            const copy = sections(ctx)
                .flatMap((s) => strings(s.content))
                .join(" ")
                .toLowerCase();
            expect(copy).not.toContain("customers");
            expect(copy).not.toMatch(/\bwe('ll|'re|ve)?\b|\bour\b|\bus\b/);
            expect(copy).not.toMatch(/award|trusted|years of|within a day/);
            expect(copy).not.toMatch(/subscribe|newsletter/);
        },
    );

    it.each(profiles)(
        "carries no image and no asset path, for %s",
        (_label, ctx) => {
            for (const section of sections(ctx)) {
                expect(valuesAt(section.content, "image")).toEqual([]);
                expect(valuesAt(section.content, "src")).toEqual([]);
                expect(JSON.stringify(section.content)).not.toMatch(
                    /\/templates\/|\.(png|jpe?g|webp|svg|gif)\b/i,
                );
            }
        },
    );

    it("links to an email when there is one, else only to pages it makes", () => {
        const paths = portfolioTemplate.pages.map((p) => p.path);
        for (const [, ctx] of profiles) {
            for (const href of sections(ctx).flatMap((s) => links(s.content))) {
                if (typeof href === "string" && href.startsWith("mailto:")) {
                    expect(href).toBe(`mailto:${ctx.contactEmail}`);
                } else {
                    expect(paths).toContain(href);
                }
            }
        }
    });

    it("sends About's Get in touch to the email, else to Home's form", () => {
        const cta = (ctx: TemplateContext) =>
            instantiateTemplate(portfolioTemplate, ctx).pages[2]?.sections[2]
                ?.content;
        expect(cta(profiles[0][1])).toMatchObject({
            label: "Get in touch",
            href: "mailto:hello@studio.example",
        });
        expect(cta(profiles[1][1])).toMatchObject({
            label: "Get in touch",
            href: "/",
        });
    });

    it("heads Home with the name, and the owner's own words when given", () => {
        const [plain] = instantiateTemplate(
            portfolioTemplate,
            profiles[1][1],
        ).pages;
        expect(plain.sections[0].content).toMatchObject({
            variant: "centered",
            heading: "Sample Maker",
            subheading: "Selected work by Sample Maker.",
            cta: { label: "See the work", href: "/work" },
        });
        const [own] = instantiateTemplate(
            portfolioTemplate,
            profiles[0][1],
        ).pages;
        expect(own.sections[0].content).toMatchObject({
            subheading: "Identity and print for small places.",
        });
    });

    it("says plainly that About's words are a placeholder", () => {
        const about = instantiateTemplate(portfolioTemplate, profiles[1][1])
            .pages[2];
        expect(strings(about.sections[1].content).join(" ")).toContain(
            "This is a placeholder",
        );
    });

    it("escapes the name where it is woven into HTML", () => {
        const about = instantiateTemplate(portfolioTemplate, profiles[2][1])
            .pages[2];
        const html = strings(about.sections[1].content).join(" ");
        expect(html).toContain("Ink &amp; &lt;Paper&gt;");
        expect(html).not.toContain("<Paper>");
    });

    it("asks for a way to reply, and names no Form until the editor makes one", () => {
        const enquiry = sections(profiles[1][1]).find(
            (s) => s.type === "enquiry",
        );
        expect(enquiry?.content).not.toHaveProperty("formId");
        expect(enquiry?.content).toMatchObject({
            title: "Work with Sample Maker",
            fields: [
                { name: "name", type: "text" },
                { name: "email", type: "email", required: true },
                { name: "message", type: "textarea" },
            ],
        });
    });
});
