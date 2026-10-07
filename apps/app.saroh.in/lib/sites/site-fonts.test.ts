import {
    FONT_PAIRS,
    fontPairFamilies,
    fontPairStacks,
} from "@saroh/site-blocks";
import { describe, expect, it, vi } from "vitest";

import { SITE_FACES } from "./site-fonts";

// Hoisted above the import: next/font only runs inside Next's compiler; here each loader answers with
// a hashed-looking family, as it does in a build.
vi.mock("next/font/google", () => {
    const loader = (name: string) => () => ({
        className: `__className_${name}`,
        style: { fontFamily: `'__${name}_x1', '__${name}_Fallback_x1'` },
    });
    const names = [
        "Archivo",
        "Archivo_Narrow",
        "Fraunces",
        "Geist",
        "IBM_Plex_Mono",
        "IBM_Plex_Sans",
        "Inter",
        "Inter_Tight",
        "JetBrains_Mono",
        "Newsreader",
        "Source_Serif_4",
    ];
    return Object.fromEntries(names.map((n) => [n, loader(n)]));
});

describe("the renderer's faces (KTD-2)", () => {
    it("loads every family the font pairs name", () => {
        // Mono faces included: a pair's third role loads like the others.
        const families = FONT_PAIRS.flatMap((p) => fontPairFamilies(p));
        for (const family of families) {
            expect(SITE_FACES).toHaveProperty([family]);
        }
    });

    it("loads nothing the list does not name", () => {
        const named = new Set(FONT_PAIRS.flatMap((p) => fontPairFamilies(p)));
        for (const family of Object.keys(SITE_FACES)) {
            expect(named.has(family)).toBe(true);
        }
    });

    it("maps a pair's key to the loaded families", () => {
        const stacks = fontPairStacks("geist", SITE_FACES);
        expect(stacks?.heading).toMatch(
            /^'__Geist_x1', '__Geist_Fallback_x1', /,
        );
        // Geist for the body too (U9): the design's mono is an accent,
        // never the paragraphs' face.
        expect(stacks?.body).toMatch(/^'__Geist_x1', /);
        // Its mono role is JetBrains Mono, for machine facts only.
        expect(stacks?.mono).toMatch(/^'__JetBrains_Mono_x1', /);
    });
});
