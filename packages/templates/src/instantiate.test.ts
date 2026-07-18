import { parseSectionContent } from "@saroh/database";
import { describe, expect, it } from "vitest";

import { instantiateTemplate, TemplateInstantiationError } from "./instantiate";
import type { TemplateContext, TemplateManifest } from "./manifest";
import { getTemplate, listTemplates } from "./registry";
import { STARTER_TEMPLATE_ID, starterTemplate } from "./templates/starter";

const sampleProfile: TemplateContext = {
    organizationName: "Acme Roasters",
    legalName: "Acme Roasters LLC",
    tagline: "Small-batch coffee, roasted with care.",
    contactEmail: "hello@acme.example",
};

describe("registry", () => {
    it("resolves the starter template by id (latest) and by exact version", () => {
        expect(getTemplate(STARTER_TEMPLATE_ID)).toBe(starterTemplate);
        expect(getTemplate(STARTER_TEMPLATE_ID, 1)).toBe(starterTemplate);
        expect(getTemplate(STARTER_TEMPLATE_ID, 99)).toBeUndefined();
        expect(getTemplate("does-not-exist")).toBeUndefined();
    });

    it("lists the registered templates", () => {
        expect(listTemplates()).toContain(starterTemplate);
    });
});

describe("instantiateTemplate — starter", () => {
    const result = instantiateTemplate(starterTemplate, sampleProfile);

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
        const minimal = instantiateTemplate(starterTemplate, {
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
