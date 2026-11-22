import { describe, expect, it } from "vitest";

import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

import {
    changedLeaves,
    changedWhen,
    describeChange,
    putBack,
} from "./look-changes";

/** "Changes to the look" (U24b): each change in words, and Undo of one. */

const options: SiteStyleOptions = {
    rows: [
        {
            key: "accent",
            label: "Accent",
            swatches: [
                { key: "clay", label: "Clay", hsl: "18 45% 45%" },
                { key: "rose", label: "Rose", hsl: "340 65% 55%" },
            ],
        },
    ],
    scalars: [],
    fontPairs: [
        { key: "system", name: "Your visitor's system font" },
        { key: "newsreader", name: "Newsreader" },
        { key: "fraunces", name: "Fraunces and Inter Tight" },
    ],
};
const base: SiteStyle = {
    colours: { accent: "clay" },
    scalars: {},
    fontPair: "newsreader",
};
const say = (a: SiteStyle, b: SiteStyle) =>
    describeChange(a, b, options, changedLeaves(a, b));

describe("a change in words", () => {
    it("names a kept pair from and to", () => {
        expect(say(base, { ...base, fontPair: "fraunces" })).toEqual({
            part: "Fonts",
            words: "Newsreader to Fraunces and Inter Tight",
        });
    });

    it("names one colour row by its swatches", () => {
        expect(say(base, { ...base, colours: { accent: "rose" } })).toEqual({
            part: "Accent",
            words: "Clay to Rose",
        });
    });

    it("names a component by its options", () => {
        expect(
            say(base, { ...base, components: { buttons: "pill" } }).part,
        ).toBe("Buttons and shapes");
    });
});

describe("Undo of one change", () => {
    it("puts back only the fields it changed", () => {
        const a = base;
        const b = { ...a, colours: { accent: "rose" } };
        const before = changedLeaves(a, b).map((leaf) => ({
            leaf,
            value: a.colours.accent,
        }));
        // A later change to the pair stays.
        const later = { ...b, fontPair: "fraunces" };
        expect(putBack(later, before)).toEqual({
            ...later,
            colours: { accent: "clay" },
        });
    });

    it("removes a field that was absent before", () => {
        const b = { ...base, brandColour: "#E8A0B4" };
        const leaves = changedLeaves(base, b);
        expect(leaves).toEqual([["brandColour"]]);
        expect(
            putBack(b, [{ leaf: leaves[0], value: undefined }]),
        ).not.toHaveProperty("brandColour");
    });
});

it("says when, in minutes", () => {
    expect(changedWhen(0, 30_000)).toBe("Just now");
    expect(changedWhen(0, 5 * 60_000)).toBe("5 min ago");
});
