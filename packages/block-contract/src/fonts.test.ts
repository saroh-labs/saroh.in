import { describe, expect, it } from "vitest";

import {
    DEFAULT_FONT_PAIR,
    findFontPair,
    FONT_PAIRS,
    fontPairFamilies,
    fontPairVariables,
    fontStack,
    isFontPairKey,
    SYSTEM_FONT_STACK,
} from "./fonts";

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
