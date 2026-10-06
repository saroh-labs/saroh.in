import { isFontPairKey, parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { getTemplate, listTemplates } from "../registry";
import { BLOGS_TEMPLATE_ID, blogsTemplate } from "./blogs";

/** Every string anywhere in a section's content, however deeply nested. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

const profiles: [string, TemplateContext][] = [
    [
        "a full profile",
        {
            organizationName: "Example Notes",
            tagline: "Writing about practice, mostly",
            contactEmail: "hello@notes.example",
            modules: ["WEBSITE"],
        },
    ],
    ["a name only", { organizationName: "Sample Writer" }],
    [
        "a name with markup characters",
        { organizationName: "Ink & <Paper>", contactEmail: "a&b@x.example" },
    ],
    [
        "every module on",
        {
            organizationName: "Sample Writer",
            modules: ["WEBSITE", "COMMERCE", "APPOINTMENTS", "PAYMENTS"],
        },
    ],
];

function pages(ctx: TemplateContext) {
    return instantiateTemplate(blogsTemplate, ctx).pages;
}

describe("blogs@1 (industry templates U8)", () => {
    it("is registered as the latest blogs template", () => {
        expect(BLOGS_TEMPLATE_ID).toBe("blogs");
        expect(getTemplate("blogs")).toBe(blogsTemplate);
        expect(listTemplates()).toContain(blogsTemplate);
    });

    it("says what the gallery shows: a journal for creators and coaches", () => {
        expect(blogsTemplate).toMatchObject({
            name: "Blogs",
            slug: "blogs",
            shape: "journal",
            kinds: ["creator", "coach"],
            sample: { name: "Meera Shah", host: "meera.saroh.app" },
            uses: ["WEBSITE"],
        });
    });

    it("ships Red then Indigo, both in Newsreader", () => {
        const styles = blogsTemplate.styles ?? [];
        expect(styles.map((s) => s.id)).toEqual(["red", "indigo"]);
        for (const preset of styles) {
            expect(preset.style.fontPair).toBe("newsreader");
            expect(isFontPairKey(preset.style.fontPair ?? "")).toBe(true);
        }
    });

    it.each(profiles)(
        "instantiates and every section passes the contract, for %s",
        (_label, ctx) => {
            for (const section of pages(ctx).flatMap((p) => p.sections)) {
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

    it("lays down Home then Archive, in the design's order", () => {
        const laid = pages({ organizationName: "Sample Writer" }).map((p) => ({
            path: p.path,
            sections: p.sections.map((s) => [
                s.type,
                (s.content as { variant?: string }).variant ?? null,
            ]),
        }));
        expect(laid).toEqual([
            {
                path: "/",
                sections: [
                    ["hero", "none"],
                    ["journal", null],
                    ["richText", null],
                ],
            },
            {
                path: "/archive",
                sections: [
                    ["hero", "none"],
                    ["journal", "archive"],
                ],
            },
        ]);
    });

    it("binds the posts rather than typing any: words only, no photos", () => {
        const journals = pages({ organizationName: "Sample Writer" })
            .flatMap((p) => p.sections)
            .filter((s) => s.type === "journal");
        expect(journals.map((s) => s.content)).toEqual([
            {
                title: "Recent",
                count: 3,
                layout: "list",
                showExcerpts: true,
                showImages: false,
            },
            {
                variant: "archive",
                title: "By date",
                showExcerpts: false,
                showImages: false,
            },
        ]);
    });

    it("types none of the design's sample writing, and claims no feed or reading time", () => {
        const text = strings(
            pages(profiles[0][1]).flatMap((p) => p.sections),
        ).join("\n");
        expect(text).not.toMatch(
            /Meera|Bengaluru|studio|retainer|minutes|feed|newsletter|subscribe/i,
        );
    });

    it("escapes the owner's name and email in About", () => {
        const about = pages(profiles[2][1])[0].sections.find(
            (s) => s.type === "richText",
        );
        const value = (about?.content as { value: string }).value;
        expect(value).toContain("Ink &amp; &lt;Paper&gt;");
        expect(value).toContain('href="mailto:a&amp;b@x.example"');
        expect(value).not.toContain("<Paper>");
    });

    it("gives About no contact line without an email, and the masthead no line without one", () => {
        const home = pages({ organizationName: "Sample Writer" })[0];
        const hero = home.sections[0].content as { subheading?: string };
        expect(hero.subheading).toBeUndefined();
        const about = home.sections[2].content as { value: string };
        expect(about.value).not.toContain("mailto:");
    });
});
