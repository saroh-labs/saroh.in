import { isFontPairKey } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import type { TemplateManifest } from "./manifest";
import {
    TEMPLATE_KINDS,
    TEMPLATE_SHAPES,
    templateStylePreset,
} from "./manifest";
import { listTemplates } from "./registry";

const withStyles: Pick<TemplateManifest, "styles"> = {
    styles: [
        {
            id: "original",
            name: "Original",
            style: {
                colours: { accent: "clay" },
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

describe("templateStylePreset", () => {
    it("starts a site in the first colourway when none is asked for", () => {
        expect(templateStylePreset(withStyles)?.id).toBe("original");
    });

    it("gives the colourway asked for", () => {
        expect(templateStylePreset(withStyles, "night")?.id).toBe("night");
    });

    it("answers null for a colourway the template does not have", () => {
        expect(templateStylePreset(withStyles, "neon")).toBeNull();
    });

    it("leaves a template without styles in the default look", () => {
        expect(templateStylePreset({})).toBeUndefined();
        expect(templateStylePreset({}, "night")).toBeNull();
    });
});

describe("registered templates' metadata", () => {
    it.each(listTemplates().map((t) => [t.id, t] as const))(
        "%s names only known kinds, shapes, pairs and unique style ids",
        (_id, template) => {
            for (const kind of template.kinds ?? []) {
                expect(TEMPLATE_KINDS).toContain(kind);
            }
            if (template.shape) {
                expect(TEMPLATE_SHAPES).toContain(template.shape);
            }
            const ids = (template.styles ?? []).map((s) => s.id);
            expect(new Set(ids).size).toBe(ids.length);
            for (const preset of template.styles ?? []) {
                if (preset.style.fontPair !== undefined) {
                    expect(isFontPairKey(preset.style.fontPair)).toBe(true);
                }
            }
        },
    );
});
