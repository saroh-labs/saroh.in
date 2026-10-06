import { describe, expect, it } from "vitest";

import {
    DEFAULT_FONT_PAIR,
    findFontPair,
    FONT_PAIRS,
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
            "geist-jetbrains",
            "archivo",
        ]) {
            expect(isFontPairKey(key)).toBe(true);
        }
    });

    it("sets the Developer pair's body in Geist, not in a code face (U9)", () => {
        const pair = findFontPair("geist-jetbrains");
        expect(pair?.heading.family).toBe("Geist");
        expect(pair?.body.family).toBe("Geist");
        expect(pair?.name).toBe("Geist");
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
    }
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
