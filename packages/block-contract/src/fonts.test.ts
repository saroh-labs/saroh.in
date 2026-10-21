import { describe, expect, it } from "vitest";

import {
    DEFAULT_FONT_PAIR,
    findFontPair,
    FONT_PAIRS,
    fontFaceKey,
    fontPairFaceKeys,
    fontPairFamilies,
    fontPairVariables,
    fontStack,
    isFontPairKey,
    PICKABLE_FONT_PAIRS,
    SYSTEM_FONT_STACK,
} from "./fonts";
import { LOOK_IDS, LOOKS } from "./looks";

describe("FONT_PAIRS", () => {
    it("has unique keys", () => {
        const keys = FONT_PAIRS.map((p) => p.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("starts with the system default, which loads nothing", () => {
        expect(FONT_PAIRS[0].key).toBe(DEFAULT_FONT_PAIR);
        expect(FONT_PAIRS[0].heading.family).toBeNull();
        expect(fontStack(FONT_PAIRS[0].body)).toBe(SYSTEM_FONT_STACK);
    });

    it("carries the template designs' pairs", () => {
        for (const key of [
            "fraunces-inter-tight",
            "newsreader",
            "ibm-plex",
            "archivo-narrow",
            "source-serif-inter",
            "geist",
            "archivo",
            "inter-tight",
        ]) {
            expect(isFontPairKey(key)).toBe(true);
        }
    });

    it("sets the Developer pair's body in Geist, not in a code face (U9)", () => {
        const pair = findFontPair("geist");
        expect(pair?.heading.family).toBe("Geist");
        expect(pair?.body.family).toBe("Geist");
        // The code face is the mono accent, for machine facts only.
        expect(pair?.mono?.family).toBe("JetBrains Mono");
        expect(pair?.name).toBe("Geist and JetBrains Mono");
    });

    it("sets the Clinic pair's headings in Inter Tight over Inter (U11)", () => {
        const pair = findFontPair("inter-tight");
        expect(pair?.heading.family).toBe("Inter Tight");
        expect(pair?.body.family).toBe("Inter");
        expect(pair?.mono).toBeUndefined();
    });

    it("gives the gym's pair IBM Plex Mono for its times", () => {
        expect(findFontPair("archivo-narrow")?.mono?.family).toBe(
            "IBM Plex Mono",
        );
    });

    it("no longer knows the unreleased geist-jetbrains key", () => {
        expect(isFontPairKey("geist-jetbrains")).toBe(false);
    });

    it("keeps keys to a shape a URL and an id can carry, and names plain", () => {
        for (const pair of FONT_PAIRS) {
            expect(pair.key).toMatch(/^[a-z][a-z0-9-]*$/);
            // Plain names: "and", never a plus sign or a key.
            expect(pair.name).not.toMatch(/\+|-/);
        }
    });

    it("refuses anything that is not a listed key", () => {
        expect(isFontPairKey("comic-sans")).toBe(false);
        expect(isFontPairKey(undefined)).toBe(false);
        expect(findFontPair("Fraunces")).toBeUndefined();
    });
});

it("names a Devanagari face in every fallback (DEC-046)", () => {
    for (const pair of FONT_PAIRS) {
        expect(pair.heading.fallback).toMatch(/Devanagari/);
        expect(pair.body.fallback).toMatch(/Devanagari/);
        const mono = findFontPair(pair.key)?.mono;
        if (mono) expect(mono.fallback).toMatch(/Devanagari/);
    }
});

describe("fontPairFamilies", () => {
    it("lists the mono family with the other two", () => {
        const geist = FONT_PAIRS.find((p) => p.key === "geist");
        const system = FONT_PAIRS[0];
        expect(geist && fontPairFamilies(geist)).toEqual([
            "Geist",
            "Geist",
            "JetBrains Mono",
        ]);
        expect(fontPairFamilies(system)).toEqual([]);
    });
});

describe("fontPairVariables", () => {
    it("emits the key for each role the pair fills", () => {
        expect(fontPairVariables("geist")).toEqual({
            "--site-font-heading": "geist",
            "--site-font-body": "geist",
            "--site-font-mono": "geist",
        });
    });

    it("leaves mono out for a pair without one", () => {
        expect(fontPairVariables("newsreader")).toEqual({
            "--site-font-heading": "newsreader",
            "--site-font-body": "newsreader",
        });
    });

    it("emits nothing for the default pair or an unknown key", () => {
        expect(fontPairVariables("system")).toEqual({});
        expect(fontPairVariables("comic-sans")).toEqual({});
        expect(fontPairVariables(undefined)).toEqual({});
    });
});

describe("fontStack", () => {
    const fraunces = FONT_PAIRS[1];

    it("names the family before its fallback", () => {
        expect(fontStack(fraunces.heading)).toMatch(/^"Fraunces", Georgia/);
    });

    it("uses the loader's registered family when given one", () => {
        expect(fontStack(fraunces.heading, "'__Fraunces_1a2b'")).toMatch(
            /^'__Fraunces_1a2b', Georgia/,
        );
    });
});

/**
 * The looks' pairs (DEC-172, U3): two families each, and only the weights the
 * look's type sets. Pinned as literals: a weight added here is a file every
 * site in that look may fetch.
 */
/** A listed pair, or the test fails here. */
function pairOf(key: string) {
    const pair = findFontPair(key);
    if (!pair) throw new Error(`no pair ${key}`);
    return pair;
}

describe("the looks' pairs", () => {
    const PINNED = {
        folio: {
            name: "Newsreader and Hanken Grotesk",
            heading: ["Newsreader", [300, 400], ["normal", "italic"]],
            body: ["Hanken Grotesk", [400, 500, 600], undefined],
        },
        quiet: {
            name: "Cormorant Garamond and Jost",
            // Light (300) is for 48px and up only; 400 and 500 below.
            heading: [
                "Cormorant Garamond",
                [300, 400, 500],
                ["normal", "italic"],
            ],
            body: ["Jost", [400, 500], undefined],
        },
        live: {
            name: "Bricolage Grotesque and Figtree",
            heading: ["Bricolage Grotesque", [700, 800], undefined],
            body: ["Figtree", [400, 500, 600, 700], undefined],
        },
    } as const;

    it.each(LOOK_IDS)("%s's pair is listed and is the look's", (id) => {
        expect(isFontPairKey(LOOKS[id].fontPair)).toBe(true);
        expect(findFontPair(LOOKS[id].fontPair)?.look).toBe(true);
    });

    it.each(LOOK_IDS)(
        "%s names two families and no weight beyond its own",
        (id) => {
            const pair = findFontPair(id);
            const pin = PINNED[id];
            expect(pair?.name).toBe(pin.name);
            expect(pair?.mono).toBeUndefined();
            for (const role of ["heading", "body"] as const) {
                const face = pair?.[role];
                const [family, weights, styles] = pin[role];
                expect(face?.family).toBe(family);
                expect(face?.weights).toEqual(weights);
                expect(face?.styles).toEqual(styles);
                // Never empty: an empty list is a variable font's full range.
                expect(face?.weights.length).toBeGreaterThan(0);
            }
            expect(new Set(pair && fontPairFamilies(pair)).size).toBe(2);
        },
    );

    it("loads the rupee's set only for faces that draw one", () => {
        // Checked against the fonts' files: Newsreader, Cormorant Garamond,
        // Bricolage Grotesque and Figtree have U+20B9 in latin-ext;
        // Hanken Grotesk and Jost have it in no set.
        const withRupee = FONT_PAIRS.filter((p) => "look" in p)
            .flatMap((p) => [p.heading, p.body])
            .filter((f) => f.subsets?.includes("latin-ext"))
            .map((f) => f.family);
        expect(withRupee).toEqual([
            "Newsreader",
            "Cormorant Garamond",
            "Bricolage Grotesque",
            "Figtree",
        ]);
    });

    it("files each look's faces under their own keys", () => {
        expect(fontPairFaceKeys(pairOf("folio"))).toEqual([
            "folio:heading",
            "folio:body",
        ]);
        // The first pairs keep their family names, so their loaded faces
        // are found exactly as before.
        expect(fontPairFaceKeys(pairOf("archivo-narrow"))).toEqual([
            "Archivo Narrow",
            "Archivo",
            "IBM Plex Mono",
        ]);
        expect(fontFaceKey(FONT_PAIRS[0].heading)).toBeNull();
    });

    it("emits the look's key for both roles and no mono", () => {
        expect(fontPairVariables("quiet")).toEqual({
            "--site-font-heading": "quiet",
            "--site-font-body": "quiet",
        });
    });

    it("keeps the looks' pairs out of the Typeface picker", () => {
        const keys = PICKABLE_FONT_PAIRS.map((p) => p.key);
        expect(keys[0]).toBe(DEFAULT_FONT_PAIR);
        for (const id of LOOK_IDS) expect(keys).not.toContain(id);
        expect(keys).toHaveLength(FONT_PAIRS.length - LOOK_IDS.length);
    });

    it("never sets a look in Saroh's own faces", () => {
        for (const id of LOOK_IDS) {
            for (const family of fontPairFamilies(pairOf(id))) {
                expect(family).not.toMatch(/Geist|Space Grotesk|JetBrains/);
            }
        }
    });
});
