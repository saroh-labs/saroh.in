import { parseSectionContent } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate, TemplateInstantiationError } from "./instantiate";
import type { TemplateContext, TemplateManifest } from "./manifest";
import { getTemplate, listTemplates } from "./registry";
import {
    STARTER_TEMPLATE_ID,
    starterTemplate,
    starterTemplateV1,
} from "./templates/starter";

const sampleProfile: TemplateContext = {
    organizationName: "Acme Roasters",
    legalName: "Acme Roasters LLC",
    tagline: "Small-batch coffee, roasted with care.",
    contactEmail: "hello@acme.example",
};

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

function everySection(template: TemplateManifest, ctx: TemplateContext) {
    return instantiateTemplate(template, ctx).pages.flatMap(
        (page) => page.sections,
    );
}

describe("registry", () => {
    it("resolves the starter template by id (latest) and by exact version", () => {
        expect(starterTemplate.version).toBe(2);
        expect(getTemplate(STARTER_TEMPLATE_ID)).toBe(starterTemplate);
        expect(getTemplate(STARTER_TEMPLATE_ID, 2)).toBe(starterTemplate);
        // Sites built from v1 keep resolving it (KTD-12).
        expect(getTemplate(STARTER_TEMPLATE_ID, 1)).toBe(starterTemplateV1);
        expect(getTemplate(STARTER_TEMPLATE_ID, 99)).toBeUndefined();
        expect(getTemplate("does-not-exist")).toBeUndefined();
    });

    it("lists only the latest version of each template, for a new site", () => {
        expect(listTemplates()).toContain(starterTemplate);
        expect(listTemplates()).not.toContain(starterTemplateV1);
        const ids = listTemplates().map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("registers the DEC-070 templates beside the starter (K15)", () => {
        // First, ahead of the industry templates registered after them.
        expect(
            listTemplates()
                .slice(0, 4)
                .map((t) => `${t.id}@${t.version}`),
        ).toEqual(["starter@2", "personal@1", "portfolio@1", "writing@1"]);
        for (const id of ["personal", "portfolio", "writing"]) {
            expect(getTemplate(id)?.id).toBe(id);
            expect(getTemplate(id, 1)?.version).toBe(1);
        }
    });
});

describe("starter@2 — words that fit anyone, and no broken images (DEC-070)", () => {
    const profiles: [string, TemplateContext][] = [
        ["a full profile", sampleProfile],
        ["a name only", { organizationName: "Asha Rao" }],
        ["a name with markup characters", { organizationName: "Rye & Co." }],
    ];

    it.each(profiles)(
        "every section passes the contract, for %s",
        (_label, ctx) => {
            for (const section of everySection(starterTemplate, ctx)) {
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

    it.each(profiles)("carries no image at all, for %s", (_label, ctx) => {
        for (const section of everySection(starterTemplate, ctx)) {
            expect(imageSources(section.content)).toEqual([]);
            for (const text of strings(section.content)) {
                expect(text).not.toContain("/templates/starter/");
            }
        }
    });

    it.each(profiles)(
        "never speaks as a company to its customers, for %s",
        (_label, ctx) => {
            const copy = everySection(starterTemplate, ctx)
                .flatMap((s) => strings(s.content))
                .join(" ")
                .toLowerCase();
            expect(copy).not.toContain("customers");
            expect(copy).not.toContain("we build");
            expect(copy).not.toContain("our story");
            // Written about the owner by name, so a person or a firm reads it
            // the same: never "we", "our" or "us".
            expect(copy).not.toMatch(/\b(we|we're|our|us)\b/);
        },
    );

    it("lays down Home and About, with the gallery given way to words", () => {
        const { pages } = instantiateTemplate(starterTemplate, sampleProfile);
        expect(pages.map((p) => p.path)).toEqual(["/", "/about"]);
        expect(pages.filter((p) => p.isHome).map((p) => p.path)).toEqual(["/"]);
        const [home, about] = pages;
        expect(home.sections.map((s) => s.type)).toEqual([
            "hero",
            "richText",
            "richText",
            "cta",
        ]);
        expect(about.sections.map((s) => s.type)).toEqual(["hero", "richText"]);
        for (const page of pages) {
            expect(page.sections.map((s) => s.order)).toEqual(
                page.sections.map((_s, i) => i),
            );
        }
    });

    it("heads Home with the name and a centred hero that says what it does", () => {
        const [home, about] = instantiateTemplate(starterTemplate, {
            organizationName: "Asha Rao",
        }).pages;
        expect(home.sections[0]?.content).toMatchObject({
            variant: "centered",
            heading: "Asha Rao",
            subheading: "Welcome — here's what Asha Rao does.",
        });
        expect(about.sections[0]?.content).toMatchObject({
            variant: "centered",
            heading: "About Asha Rao",
        });
    });

    it("prefers the owner's own words for the subheading", () => {
        const hero = instantiateTemplate(starterTemplate, sampleProfile)
            .pages[0]?.sections[0]?.content;
        expect(hero).toMatchObject({
            subheading: "Small-batch coffee, roasted with care.",
            cta: { label: "Get in touch", href: "mailto:hello@acme.example" },
        });
    });

    it("sends every link somewhere real: the email, else its own About page", () => {
        const { pages } = instantiateTemplate(starterTemplate, {
            organizationName: "Asha Rao",
        });
        const paths = new Set(pages.map((p) => p.path));
        const hrefs = pages
            .flatMap((p) => p.sections)
            .flatMap((s) => {
                const c = s.content as {
                    href?: string;
                    cta?: { href?: string };
                };
                return [c.href, c.cta?.href].filter(
                    (h): h is string => typeof h === "string",
                );
            });
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
            expect(paths.has(href)).toBe(true);
        }
        expect(pages[0]?.sections[3]?.content).toMatchObject({
            label: "About Asha Rao",
            href: "/about",
        });
    });

    it("weaves the legal name into About, escaped as text", () => {
        const [, about] = instantiateTemplate(starterTemplate, {
            organizationName: "Rye & Co.",
            legalName: "Rye <&> Co. Pvt Ltd",
        }).pages;
        const story = about.sections[1].content as { value: string };
        expect(story.value).toContain("Rye &lt;&amp;&gt; Co. Pvt Ltd");
        expect(story.value).not.toContain("<&>");
    });
});

describe("starter@1 — kept as shipped for the sites built from it", () => {
    const result = instantiateTemplate(starterTemplateV1, sampleProfile);

    it("produces the expected pages with one home page", () => {
        expect(result.pages.map((p) => p.path)).toEqual(["/", "/about"]);
        const home = result.pages.filter((p) => p.isHome);
        expect(home).toHaveLength(1);
        expect(home[0]?.path).toBe("/");
    });

    it("lays down the expected section types per page in order", () => {
        const [home, about] = result.pages;
        expect(home.sections.map((s) => s.type)).toEqual([
            "hero",
            "richText",
            "cta",
            "gallery",
        ]);
        expect(about.sections.map((s) => s.type)).toEqual(["hero", "richText"]);
    });

    it("assigns order from array position", () => {
        for (const page of result.pages) {
            expect(page.sections.map((s) => s.order)).toEqual(
                page.sections.map((_s, i) => i),
            );
        }
    });

    it("EVERY produced section validates against the section contract", () => {
        for (const page of result.pages) {
            for (const section of page.sections) {
                const check = parseSectionContent(
                    section.type,
                    section.contractVersion,
                    section.content,
                );
                expect(check.success).toBe(true);
            }
        }
    });

    it("applies business-profile defaults (hero heading = org name)", () => {
        const heroContent = result.pages[0]?.sections[0]?.content as {
            heading: string;
            subheading?: string;
            cta?: { href: string };
        };
        expect(heroContent.heading).toBe("Acme Roasters");
        expect(heroContent.subheading).toBe(
            "Small-batch coffee, roasted with care.",
        );
        // contactEmail is threaded into the CTA as a mailto link.
        expect(heroContent.cta?.href).toBe("mailto:hello@acme.example");
    });

    it("stays valid for a minimal profile (name only)", () => {
        const minimal = instantiateTemplate(starterTemplateV1, {
            organizationName: "Solo Studio",
        });
        for (const page of minimal.pages) {
            for (const section of page.sections) {
                expect(
                    parseSectionContent(
                        section.type,
                        section.contractVersion,
                        section.content,
                    ).success,
                ).toBe(true);
            }
        }
        const hero = minimal.pages[0]?.sections[0]?.content as {
            cta?: { href: string };
        };
        // No email → CTA falls back to the /contact page.
        expect(hero.cta?.href).toBe("/contact");
    });
});

describe("instantiateTemplate — validation guard", () => {
    it("rejects a manifest whose section content violates the contract", () => {
        const broken: TemplateManifest = {
            id: "broken",
            version: 1,
            name: "Broken",
            pages: [
                {
                    path: "/",
                    title: "Home",
                    isHome: true,
                    sections: [
                        {
                            type: "hero",
                            contractVersion: 1,
                            // hero requires a non-empty `heading`.
                            content: { subheading: "no heading here" },
                        },
                    ],
                },
            ],
        };

        expect(() => instantiateTemplate(broken, sampleProfile)).toThrow(
            TemplateInstantiationError,
        );

        try {
            instantiateTemplate(broken, sampleProfile);
        } catch (err) {
            expect(err).toBeInstanceOf(TemplateInstantiationError);
            const e = err as TemplateInstantiationError;
            expect(e.pagePath).toBe("/");
            expect(e.sectionIndex).toBe(0);
            expect(e.contractError.code).toBe("INVALID_CONTENT");
        }
    });

    it("rejects a section targeting an unknown contract version", () => {
        const broken: TemplateManifest = {
            id: "broken-version",
            version: 1,
            name: "Broken Version",
            pages: [
                {
                    path: "/",
                    title: "Home",
                    sections: [
                        {
                            type: "hero",
                            contractVersion: 999,
                            content: { heading: "Hi" },
                        },
                    ],
                },
            ],
        };

        try {
            instantiateTemplate(broken, sampleProfile);
            expect.unreachable("should have thrown");
        } catch (err) {
            const e = err as TemplateInstantiationError;
            expect(e.contractError.code).toBe("UNKNOWN_CONTRACT");
        }
    });
});
