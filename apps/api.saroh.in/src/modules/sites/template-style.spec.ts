import {
    BadRequestException,
    InternalServerErrorException,
} from "@nestjs/common";
import type { TemplateManifest } from "@saroh/templates";
import { listTemplates, TEMPLATE_KINDS } from "@saroh/templates";

import { MODULE_KEYS } from "../capabilities/module-registry";
import { WAITLIST_KINDS } from "../waitlist/waitlist-keys";
import { planTemplateStyle } from "./site-create";
import { defaultSiteStyle, parseSiteStyle } from "./site-style";

/**
 * A template's colourway is the look its new site starts in (industry
 * templates plan, KTD-1, U1).
 */
const template: Pick<TemplateManifest, "id" | "version" | "styles"> = {
    id: "bakery",
    version: 1,
    styles: [
        {
            id: "original",
            name: "Original",
            style: {
                colours: { pageGround: "bone", accent: "clay" },
                scalars: { cornerRadius: 8 },
                fontPair: "fraunces-inter-tight",
            },
        },
        {
            id: "night",
            name: "Night",
            style: { colours: { pageGround: "slate", text: "chalk" } },
        },
    ],
};

describe("planTemplateStyle", () => {
    it("starts the site in the template's first colourway", () => {
        const style = planTemplateStyle(template);
        expect(style?.id).toBe("original");
        expect(style?.value.colours.pageGround).toBe("bone");
        expect(style?.value.scalars.cornerRadius).toBe(8);
        expect(style?.value.fontPair).toBe("fraunces-inter-tight");
        // Everything the colourway leaves out is the default.
        expect(style?.value.colours.text).toBe(defaultSiteStyle().colours.text);
    });

    it("starts it in the colourway asked for", () => {
        const style = planTemplateStyle(template, "night");
        expect(style?.id).toBe("night");
        expect(style?.value.colours.pageGround).toBe("slate");
        expect(style?.value).not.toHaveProperty("fontPair");
    });

    it("refuses a colourway the template does not have, on the field", () => {
        expect(() => planTemplateStyle(template, "neon")).toThrow(
            BadRequestException,
        );
        try {
            planTemplateStyle(template, "neon");
        } catch (error) {
            expect((error as BadRequestException).getResponse()).toMatchObject({
                details: { field: "styleId" },
            });
        }
    });

    it("gives a template without colourways no style: the default look", () => {
        expect(
            planTemplateStyle({ id: "starter", version: 2 }),
        ).toBeUndefined();
    });

    it("reports a shipped colourway that breaks the style rules as a server fault", () => {
        const broken = {
            id: "broken",
            version: 1,
            styles: [
                {
                    id: "x",
                    name: "X",
                    style: { colours: { accent: "chartreuse" } },
                },
            ],
        };
        expect(() => planTemplateStyle(broken)).toThrow(
            InternalServerErrorException,
        );
    });
});

describe("every registered template's metadata", () => {
    it("uses the waitlist's kinds, so the gallery and the waitlist agree", () => {
        expect([...TEMPLATE_KINDS]).toEqual([...WAITLIST_KINDS]);
    });

    it.each(listTemplates().map((t) => [t.id, t] as const))(
        "%s: every colourway is a valid style and every module is real",
        (_id, t) => {
            for (const preset of t.styles ?? []) {
                expect(() => parseSiteStyle(preset.style)).not.toThrow();
            }
            for (const key of t.uses ?? []) {
                expect(MODULE_KEYS as readonly string[]).toContain(key);
            }
        },
    );
});
