import { parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { WRITING_TEMPLATE_ID, writingTemplate } from "./writing";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/** Every `src` anywhere in a section's content: the images it would draw. */
function imageSources(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(imageSources);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) =>
            k === "src" && typeof v === "string" ? [v] : imageSources(v),
        );
    }
    return [];
}

/** Every `href` anywhere in a section's content: where its links go. */
function hrefs(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(hrefs);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) =>
            k === "href" && typeof v === "string" ? [v] : hrefs(v),
        );
    }
    return [];
}

const profiles: [string, TemplateContext][] = [
    [
        "a full profile",
        {
            organizationName: "Example Notes",
            legalName: "Example Notes Ltd",
            tagline: "Short essays on making things.",
            contactEmail: "hello@notes.example",
        },
    ],
    ["a name only", { organizationName: "Sample Writer" }],
    ["a name with markup characters", { organizationName: "Ink & <Paper>" }],
];

function sections(ctx: TemplateContext) {
    return instantiateTemplate(writingTemplate, ctx).pages.flatMap(
        (p) => p.sections,
    );
}

describe("writing@1 (DEC-070, K13)", () => {
    it("is the first version of the writing template", () => {
        expect(writingTemplate.id).toBe(WRITING_TEMPLATE_ID);
        expect(WRITING_TEMPLATE_ID).toBe("writing");
        expect(writingTemplate.version).toBe(1);
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

    it("lays down Home (hero, journal), About (words) and Contact (enquiry)", () => {
        const { pages } = instantiateTemplate(writingTemplate, profiles[0][1]);
        expect(pages.map((p) => p.path)).toEqual(["/", "/about", "/contact"]);
        expect(pages.filter((p) => p.isHome).map((p) => p.path)).toEqual(["/"]);
        expect(pages.map((p) => p.sections.map((s) => s.type))).toEqual([
            ["hero", "journal"],
            ["hero", "richText"],
            ["enquiry"],
        ]);
    });

    it("stores how the journal shows posts, never a post", () => {
        const journal = sections(profiles[1][1]).find(
            (s) => s.type === "journal",
        );
        expect(journal?.content).toEqual({
            title: "Latest writing",
            count: 6,
            layout: "list",
            showExcerpts: true,
            showImages: false,
        });
    });

    it.each(profiles)(
        "promises no posts, no reply time and no feature it lacks, for %s",
        (_label, ctx) => {
            const copy = sections(ctx)
                .filter((s) => s.type !== "journal")
                .flatMap((s) => strings(s.content))
                .join(" ")
                .toLowerCase();
            // Home's journal draws nothing live until a post is published,
            // so nothing else on the site points at posts below it.
            expect(copy).not.toMatch(/below|latest|new post|every week/);
            expect(copy).not.toMatch(/subscribe|newsletter|within a day/);
            expect(copy).not.toContain("customers");
            expect(copy).not.toMatch(/\bwe('ll|'re)?\b|\bour\b/);
        },
    );

    it.each(profiles)("carries no image, for %s", (_label, ctx) => {
        for (const section of sections(ctx)) {
            expect(imageSources(section.content)).toEqual([]);
        }
    });

    it("links to an email when there is one, else to the Contact page it makes", () => {
        const paths = writingTemplate.pages.map((p) => p.path);
        for (const [, ctx] of profiles) {
            for (const href of sections(ctx).flatMap((s) => hrefs(s.content))) {
                if (ctx.contactEmail) {
                    expect(href).toBe(`mailto:${ctx.contactEmail}`);
                } else {
                    expect(paths).toContain(href);
                }
            }
        }
    });

    it("heads Home with the name, and the owner's own words when given", () => {
        const [plain] = instantiateTemplate(
            writingTemplate,
            profiles[1][1],
        ).pages;
        expect(plain.sections[0]?.content).toMatchObject({
            variant: "centered",
            heading: "Sample Writer",
            subheading: "Writing by Sample Writer.",
        });
        const [own] = instantiateTemplate(
            writingTemplate,
            profiles[0][1],
        ).pages;
        expect(own.sections[0]?.content).toMatchObject({
            subheading: "Short essays on making things.",
        });
    });

    it("says plainly that About's words are a placeholder", () => {
        const about = instantiateTemplate(writingTemplate, profiles[1][1])
            .pages[1];
        expect(strings(about.sections[1]?.content).join(" ")).toContain(
            "This is a placeholder",
        );
    });

    it("escapes the name where it is woven into HTML", () => {
        const about = instantiateTemplate(writingTemplate, profiles[2][1])
            .pages[1];
        const html = strings(about.sections[1]?.content).join(" ");
        expect(html).toContain("Ink &amp; &lt;Paper&gt;");
        expect(html).not.toContain("<Paper>");
    });

    it("asks for a way to reply, and names no Form until the editor makes one", () => {
        const enquiry = sections(profiles[1][1]).find(
            (s) => s.type === "enquiry",
        );
        expect(enquiry?.content).not.toHaveProperty("formId");
        expect(enquiry?.content).toMatchObject({
            title: "Write to Sample Writer",
            fields: [
                { name: "name", type: "text" },
                { name: "email", type: "email", required: true },
                { name: "message", type: "textarea" },
            ],
        });
    });
});
