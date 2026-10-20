import { PAPER_INK } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { mayUpdateBusiness } from "./paper-access";
import {
    colourMoved,
    hasOwnLook,
    lookOf,
    lookWords,
    PAPER_SWATCHES,
    typedColour,
} from "./paper-look";

/**
 * A draft's look (DEC-173, U15 #1127): its own choice, else the business's
 * default, each of style and colour on its own; a colour never refused,
 * only drawn deeper where it must be to read.
 */
const DEFAULT = { style: "COMPACT", colour: "#6B3F1D" } as const;

describe("the look a draft is drawn in", () => {
    it("follows the default while it chooses nothing", () => {
        expect(lookOf({}, DEFAULT)).toEqual(DEFAULT);
        expect(lookOf({ paperStyle: "", paperColour: "" }, DEFAULT)).toEqual(
            DEFAULT,
        );
        expect(hasOwnLook({ paperStyle: "", paperColour: "" })).toBe(false);
    });

    it("takes its own style and colour, each falling back on its own", () => {
        expect(lookOf({ paperStyle: "BAND" }, DEFAULT)).toEqual({
            style: "BAND",
            colour: "#6B3F1D",
        });
        expect(lookOf({ paperColour: "#2f5d50" }, DEFAULT)).toEqual({
            style: "COMPACT",
            colour: "#2F5D50",
        });
        expect(hasOwnLook({ paperStyle: "BAND", paperColour: "" })).toBe(true);
    });

    it("says a look in a few words", () => {
        expect(lookWords({ style: "CLASSIC", colour: null })).toBe(
            "Classic · ink",
        );
        expect(lookWords({ style: "BAND", colour: PAPER_INK })).toBe(
            "Band · ink",
        );
        expect(lookWords({ style: "BAND", colour: "#6b3f1d" })).toBe(
            "Band · #6B3F1D",
        );
    });
});

describe("a colour", () => {
    it("is read as typed, with or without its #, in capitals", () => {
        expect(typedColour("#6b3f1d")).toBe("#6B3F1D");
        expect(typedColour(" 2F5D50 ")).toBe("#2F5D50");
        expect(typedColour("brown")).toBeNull();
        expect(typedColour("#12345")).toBeNull();
    });

    it("that can't be read on white is drawn deeper, and the panel can say so", () => {
        // A pale yellow as the title and rules: moved toward ink.
        expect(colourMoved("CLASSIC", "#F6E7A1")).toBe(true);
        // The board's own colours read as they are.
        for (const hex of PAPER_SWATCHES) {
            expect(colourMoved("CLASSIC", hex), hex).toBe(false);
        }
        // No colour, nothing moved.
        expect(colourMoved("BAND", null)).toBe(false);
    });

    it("on Band, a pale fill is kept (ink reads on it); a mid grey is moved", () => {
        expect(colourMoved("BAND", "#F6E7A1")).toBe(false);
        expect(colourMoved("BAND", "#777777")).toBe(true);
    });
});

describe("who may set the business's default", () => {
    it("is whoever holds org:update, never a role's name", () => {
        expect(mayUpdateBusiness({ actions: ["org:update"] })).toBe(true);
        expect(mayUpdateBusiness({ actions: ["invoice:write"] })).toBe(false);
        expect(mayUpdateBusiness(null)).toBe(false);
        expect(mayUpdateBusiness({})).toBe(false);
    });
});
