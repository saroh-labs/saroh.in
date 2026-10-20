import { describe, expect, it } from "vitest";

import {
    bandTextTone,
    isPaperStyle,
    PAPER_INK,
    PAPER_STYLES,
    PAPER_WHITE,
    paperColourOf,
    paperColours,
    paperStyleOf,
    RULE_46_FIELDS,
} from "./invoice-paper";
import { contrastRatio } from "./palette";

/** The band a Band paper in `colour` draws. */
function bandOf(colour: string | null) {
    const band = paperColours("BAND", colour).band;
    if (!band) throw new Error("Band draws a band");
    return band;
}

describe("invoice paper styles (DEC-173, #1118)", () => {
    it("has three styles, and anything else reads as Classic", () => {
        expect(PAPER_STYLES).toEqual(["CLASSIC", "BAND", "COMPACT"]);
        expect(paperStyleOf("BAND")).toBe("BAND");
        expect(paperStyleOf(null)).toBe("CLASSIC");
        expect(paperStyleOf("band")).toBe("CLASSIC");
        expect(isPaperStyle("COMPACT")).toBe(true);
        expect(isPaperStyle("FANCY")).toBe(false);
    });

    it("keeps a colour only as #RRGGBB, in capitals", () => {
        expect(paperColourOf("#6b3f1d")).toBe("#6B3F1D");
        expect(paperColourOf(" #1F3A5F ")).toBe("#1F3A5F");
        expect(paperColourOf("6B3F1D")).toBeNull();
        expect(paperColourOf("#FFF")).toBeNull();
        expect(paperColourOf("red")).toBeNull();
        expect(paperColourOf(null)).toBeNull();
    });
});

describe("the band's text", () => {
    it("a pale yellow takes ink, a dark blue white", () => {
        expect(bandTextTone("#F5E6A8")).toBe("INK");
        expect(bandTextTone("#1F3A5F")).toBe("WHITE");
        expect(paperColours("BAND", "#F5E6A8").band).toEqual({
            fill: "#F5E6A8",
            text: PAPER_INK,
            tone: "INK",
        });
        expect(paperColours("BAND", "#1F3A5F").band).toEqual({
            fill: "#1F3A5F",
            text: PAPER_WHITE,
            tone: "WHITE",
        });
    });

    it("reads at 4.5:1 or better on every colour, a mid grey included", () => {
        for (const colour of [
            "#808080",
            "#777777",
            "#FF0000",
            "#00AA00",
            "#F0A92B",
            "#FFFFFF",
            "#000000",
            "#6B3F1D",
            "#9B2C4A",
            "#3B4A8C",
        ]) {
            const band = bandOf(colour);
            expect(contrastRatio(band.text, band.fill)).toBeGreaterThanOrEqual(
                4.5,
            );
        }
    });

    it("a mid grey neither tone reads on is moved, not refused", () => {
        const band = bandOf("#777777");
        expect(band.fill).not.toBe("#777777");
        expect(contrastRatio(band.text, band.fill)).toBeGreaterThanOrEqual(4.5);
    });

    it("no colour is an ink band with white text", () => {
        const band = bandOf(null);
        expect(band).toEqual({
            fill: PAPER_INK,
            text: PAPER_WHITE,
            tone: "WHITE",
        });
    });
});

describe("the colour as text on the paper", () => {
    it("a pale colour is darkened until it reads on white", () => {
        const { accent, coloured } = paperColours("CLASSIC", "#F5E6A8");
        expect(coloured).toBe(true);
        expect(accent).not.toBe("#F5E6A8");
        expect(contrastRatio(accent, PAPER_WHITE)).toBeGreaterThanOrEqual(4.5);
    });

    it("a dark colour is kept as it is", () => {
        expect(paperColours("COMPACT", "#1F3A5F").accent).toBe("#1F3A5F");
    });

    it("no colour is ink, and Classic draws as it always has", () => {
        expect(paperColours("CLASSIC", null)).toEqual({
            accent: PAPER_INK,
            coloured: false,
            band: null,
        });
    });
});

describe("Rule 46's fields", () => {
    it("lists every particular a tax invoice must carry, once each", () => {
        const keys = RULE_46_FIELDS.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const key of [
            "sellerName",
            "sellerAddress",
            "sellerGstin",
            "number",
            "date",
            "buyerName",
            "buyerGstin",
            "placeOfSupply",
            "hsn",
            "taxableValue",
            "rate",
            "taxSplit",
            "signature",
        ]) {
            expect(keys).toContain(key);
        }
    });
});
