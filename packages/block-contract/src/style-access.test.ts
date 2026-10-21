import { describe, expect, it } from "vitest";

import type { SitePalette } from "./palette";
import type { StyleChoiceHeld } from "./style-access";
import {
    colourwayOfPalette,
    STYLE_ACCESS_FIXTURE as F,
    heldStyleIds,
    paidStyleParts,
    siteFreeStyles,
    STYLE_ACCESS_CASES,
} from "./style-access";

/** The one free/paid style rule the API's save and the app's panel run. */

const palette = (bg: string) => ({ bg }) as unknown as SitePalette;
const colourways = [
    { id: "first", palette: palette("#ffffff") },
    { id: "freed", palette: palette("#eeeeee") },
    { id: "paid", palette: palette("#dddddd") },
];
const template = {
    id: F.templateId,
    styles: F.colourwayIds.map((id) => ({
        id,
        style: { fontPair: F.ownPair },
    })),
};
const free = siteFreeStyles(F.lists, template, F.startColourway);
const stored: StyleChoiceHeld = {
    fontPair: F.ownPair,
    palette: palette("#ffffff"),
};

function next(kind: string, id: string): StyleChoiceHeld {
    if (kind === "look") return { ...stored, look: id as "live" };
    if (kind === "fontPair") return { ...stored, fontPair: id };
    return {
        ...stored,
        palette: colourways.find((c) => c.id === id)?.palette,
    };
}

describe("the shared style rule", () => {
    it.each(STYLE_ACCESS_CASES)("$name", (c) => {
        const parts = paidStyleParts(next(c.kind, c.id), {
            stored,
            liveLook: c.liveLook,
            templateId: F.templateId,
            colourways,
            free,
        });
        expect(parts.length > 0).toBe(c.refused);
    });

    it("holds the system font when no pair is saved, never a list's first", () => {
        expect(heldStyleIds({}, colourways).fontPair).toBe("system");
    });

    it("tells a colourway by its exact palette, and none without one", () => {
        expect(colourwayOfPalette(palette("#eeeeee"), colourways)).toBe(
            "freed",
        );
        expect(colourwayOfPalette(palette("#123456"), colourways)).toBe(null);
        expect(colourwayOfPalette(undefined, colourways)).toBe(null);
    });

    it("charges no colourway on a site with no template", () => {
        expect(
            paidStyleParts(next("colourway", "paid"), {
                stored,
                templateId: null,
                colourways,
                free,
            }),
        ).toEqual([]);
    });
});
