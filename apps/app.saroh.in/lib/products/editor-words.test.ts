import { describe, expect, it } from "vitest";

import {
    createdMessage,
    heldOverLimit,
    optionPlural,
    suggestedPath,
} from "./editor-sections";
import { UNTRACKED_NOTE } from "./tracking";

/** The editor's words after the products audit (16 Oct 2026). */
describe("the editor's words", () => {
    it("names an option's things in the plural, or 'variants'", () => {
        expect(optionPlural("Shade")).toBe("shades");
        expect(optionPlural("Size")).toBe("sizes");
        expect(optionPlural("Box")).toBe("boxes");
        expect(optionPlural("Variety")).toBe("varieties");
        expect(optionPlural("Size · cover · pages")).toBe("variants");
        expect(optionPlural(null)).toBe("variants");
    });

    it("says what to do after Create, with the option's own word", () => {
        expect(
            createdMessage({
                live: false,
                optionName: "Shade",
                tracksStock: true,
                photosOk: true,
            }),
        ).toBe("Created as a draft. Add shades and stock next, then Publish.");
        expect(
            createdMessage({
                live: true,
                optionName: null,
                tracksStock: false,
                photosOk: false,
            }),
        ).toBe(
            "Created and live. Add variants next if it needs them. The photos didn't save. Add them again.",
        );
    });

    it("holds a line saved over its limit as a note until it is changed", () => {
        const long = "x".repeat(395);
        expect(heldOverLimit(long, long, 300)).toBe(
            "395 characters. The shop shows 300. Shorten it when you next save.",
        );
        expect(heldOverLimit(`${long}y`, long, 300)).toBe("");
        expect(heldOverLimit("short", "short", 300)).toBe("");
    });

    it("reads the free path out of a refusal, for its Use button", () => {
        expect(
            suggestedPath(
                "Packing Tape already uses this path. Try packing-tape-2.",
            ),
        ).toBe("packing-tape-2");
        expect(suggestedPath("Only lowercase letters.")).toBe("");
        expect(suggestedPath(undefined)).toBe("");
    });

    it("says tracking turns on from 0, for a product never tracked too", () => {
        expect(UNTRACKED_NOTE).toContain(
            "Turning tracking on starts from 0, so count it first.",
        );
        expect(UNTRACKED_NOTE).not.toContain("back on");
    });
});
