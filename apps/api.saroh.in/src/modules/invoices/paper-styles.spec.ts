/**
 * Invoice styles (DEC-173, #1118), the API's side: which look a paper is
 * drawn in, and what a write may store. The colour rule itself is
 * `@saroh/block-contract`'s (`invoice-paper.test.ts`).
 */
import { BadRequestException } from "@nestjs/common";

import { paperLook } from "./invoice-paper-view";
import {
    bandTextTone,
    PAPER_STYLES,
    paperWrite,
    PLAIN_PAPER,
    resolvePaper,
    RULE_46_FIELDS,
} from "./paper-styles";

const FIELDS = { style: "paperStyle", colour: "paperColour" };

function refusal(run: () => unknown): { message: string; field: string } {
    try {
        run();
    } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
            message: string;
            details: { field: string };
        };
        return { message: body.message, field: body.details.field };
    }
    throw new Error("expected a refusal");
}

describe("the look a paper is drawn in", () => {
    it("nothing chosen anywhere is Classic in ink", () => {
        expect(resolvePaper(null)).toEqual(PLAIN_PAPER);
        expect(resolvePaper({ style: null, colour: null }, null)).toEqual({
            style: "CLASSIC",
            colour: null,
        });
    });

    it("a draft's own choice wins, else the business's default", () => {
        const business = { style: "BAND", colour: "#6B3F1D" };
        expect(resolvePaper({}, business)).toEqual({
            style: "BAND",
            colour: "#6B3F1D",
        });
        expect(
            resolvePaper({ style: "COMPACT", colour: "#1f3a5f" }, business),
        ).toEqual({ style: "COMPACT", colour: "#1F3A5F" });
    });

    it("style and colour fall back on their own", () => {
        expect(
            resolvePaper({ style: "COMPACT" }, { colour: "#6B3F1D" }),
        ).toEqual({ style: "COMPACT", colour: "#6B3F1D" });
    });

    it("a stored value that is not a style or colour reads as none", () => {
        expect(resolvePaper({ style: "FANCY", colour: "brown" })).toEqual(
            PLAIN_PAPER,
        );
    });

    it("the band's text tone is worked out from its colour", () => {
        expect(bandTextTone("#F5E6A8")).toBe("INK");
        expect(bandTextTone("#1F3A5F")).toBe("WHITE");
        expect(paperLook({ style: "BAND", colour: "#F5E6A8" }).band?.tone).toBe(
            "INK",
        );
        expect(paperLook({ style: "BAND", colour: "#1F3A5F" }).band?.tone).toBe(
            "WHITE",
        );
        expect(paperLook({ style: "CLASSIC", colour: "#1F3A5F" }).band).toBe(
            null,
        );
    });

    it("lists the three styles and Rule 46's particulars", () => {
        expect(PAPER_STYLES).toEqual(["CLASSIC", "BAND", "COMPACT"]);
        expect(RULE_46_FIELDS.length).toBeGreaterThan(10);
    });
});

describe("what a write may store", () => {
    it("absent leaves both as they are", () => {
        expect(paperWrite({}, FIELDS)).toEqual({});
    });

    it("a style and a colour are kept, the colour in capitals", () => {
        expect(
            paperWrite({ style: "BAND", colour: "#6b3f1d" }, FIELDS),
        ).toEqual({ style: "BAND", colour: "#6B3F1D" });
    });

    it('"" or null clears either, back to the default', () => {
        expect(paperWrite({ style: "", colour: "" }, FIELDS)).toEqual({
            style: null,
            colour: null,
        });
        expect(paperWrite({ style: null, colour: null }, FIELDS)).toEqual({
            style: null,
            colour: null,
        });
    });

    it("a colour that isn't #RRGGBB is refused on its field", () => {
        for (const colour of [
            "red",
            "#FFF",
            "6B3F1D",
            "#GGGGGG",
            "#6B3F1D00",
        ]) {
            expect(refusal(() => paperWrite({ colour }, FIELDS))).toEqual({
                message: "A colour like #6B3F1D",
                field: "paperColour",
            });
        }
    });

    it("a style that isn't one of the three is refused on its field", () => {
        expect(
            refusal(() =>
                paperWrite(
                    { style: "band" },
                    {
                        style: "invoiceStyle",
                        colour: "invoiceColour",
                    },
                ),
            ),
        ).toEqual({
            message: "Choose Classic, Band or Compact",
            field: "invoiceStyle",
        });
    });
});
