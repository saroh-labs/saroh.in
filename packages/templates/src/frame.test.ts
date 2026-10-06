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
