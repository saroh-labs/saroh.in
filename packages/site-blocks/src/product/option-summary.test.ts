import { describe, expect, it } from "vitest";

import { chooseLabel, optionSummary, plural } from "./option-summary";

/** A product card's options, summed up (DEC-073 #12): "2 sizes". */
describe("optionSummary", () => {
    it("counts the options by their name", () => {
        expect(optionSummary(["Small", "Large"], "Size")).toBe("2 sizes");
        expect(optionSummary(["Red", "Blue", "Green"], "Colour")).toBe(
            "3 colours",
        );
        expect(optionSummary(["50 ml", "100 ml"], "Volume")).toBe("2 volumes");
        expect(optionSummary(["A", "B"], "Pack size")).toBe("2 pack sizes");
        expect(optionSummary(["6", "7", "8"], "UK size")).toBe("3 UK sizes");
    });

    it("never lists the values", () => {
        expect(optionSummary(["Small", "Large"], "Size")).not.toMatch(
            /Small|Large/,
        );
    });

    it("names a single option, and says nothing for none", () => {
        expect(optionSummary(["250 g"], "Weight")).toBe("250 g");
        expect(optionSummary([], "Size")).toBe("");
        expect(optionSummary(["", " "], "Size")).toBe("");
    });

    it("says options when the name isn't known (an older API)", () => {
        expect(optionSummary(["S", "M"], undefined)).toBe("2 options");
        expect(optionSummary(["S", "M"], null)).toBe("2 options");
        expect(optionSummary(["S", "M"], "  ")).toBe("2 options");
    });
});

describe("plural", () => {
    it("stays fast on a long name that doesn't end in a letter (release #772)", () => {
        const hostile = `${"a".repeat(100_000)}1`;
        // The old regex takes seconds here (quadratic); a linear scan takes
        // about a millisecond. The bound leaves room for a busy machine.
        const started = performance.now();
        expect(plural(hostile)).toBe(hostile);
        expect(performance.now() - started).toBeLessThan(500);
    });

    it("keeps everything before the last word", () => {
        expect(plural("Pack size")).toBe("Pack sizes");
        expect(plural("Size 2")).toBe("Size 2");
        expect(plural("")).toBe("");
    });

    it("pluralises an option's name sensibly", () => {
        expect(plural("size")).toBe("sizes");
        expect(plural("shade")).toBe("shades");
        expect(plural("flavour")).toBe("flavours");
        expect(plural("box")).toBe("boxes");
        expect(plural("batch")).toBe("batches");
        expect(plural("finish")).toBe("finishes");
        expect(plural("glass")).toBe("glasses");
        expect(plural("variety")).toBe("varieties");
        expect(plural("tray")).toBe("trays");
        expect(plural("kids sizes")).toBe("kids sizes");
        expect(plural("250")).toBe("250");
    });
});

/**
 * The shop card's button for a product with several options: it names the
 * choice and never makes it.
 */
describe("chooseLabel", () => {
    it("asks for the choice by the option's own name", () => {
        expect(chooseLabel(["Small", "Large"], "Size")).toBe("Choose size");
        expect(chooseLabel(["Red", "Blue"], "Colour")).toBe("Choose colour");
        expect(chooseLabel(["6", "7"], "UK size")).toBe("Choose UK size");
    });

    it("says Choose options without a name, or with one too long for the card", () => {
        expect(chooseLabel(["A", "B"], null)).toBe("Choose options");
        expect(chooseLabel(["A", "B"], undefined)).toBe("Choose options");
        expect(chooseLabel(["A", "B"], "  ")).toBe("Choose options");
        expect(chooseLabel(["A", "B"], "Gift wrap style")).toBe(
            "Choose options",
        );
    });

    it("is null with one option or none: the card adds it itself", () => {
        expect(chooseLabel([], "Size")).toBeNull();
        expect(chooseLabel(["500 g"], "Size")).toBeNull();
        expect(chooseLabel(["500 g", " "], "Size")).toBeNull();
    });
});
