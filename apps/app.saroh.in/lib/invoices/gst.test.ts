import { describe, expect, it } from "vitest";

import {
    GST_RATE_CHOICES,
    GSTIN_SHAPE,
    isHsnSac,
    MAIN_GST_RATES,
    OTHER_GST_RATE_CHOICES,
    PREFIX_SHAPE,
    rateOption,
} from "./gst";

describe("GST in the editors", () => {
    it("reads a saved rate as its option, whatever its decimals", () => {
        expect(rateOption("18.00")).toBe("18");
        expect(rateOption("0.25")).toBe("0.25");
        expect(rateOption("0")).toBe("0");
        expect(rateOption(null)).toBe("");
        expect(rateOption("7")).toBe("");
    });

    it("splits the one list of rates into the main buttons and Other", () => {
        expect(MAIN_GST_RATES).toEqual(["0", "5", "18", "40"]);
        const other = OTHER_GST_RATE_CHOICES.map((o) => o.value);
        expect(other).toEqual(
            expect.arrayContaining(["0.25", "3", "12", "28"]),
        );
        expect(
            other.some((v) =>
                (MAIN_GST_RATES as readonly string[]).includes(v),
            ),
        ).toBe(false);
        // Every rate is in exactly one of the two rows, and Not set in neither.
        expect([...MAIN_GST_RATES, ...other].sort()).toEqual(
            GST_RATE_CHOICES.map((o) => o.value).sort(),
        );
    });

    it("takes an HSN or SAC of four to eight digits, spaces as printed", () => {
        expect(isHsnSac("1905 90 10")).toBe(true);
        expect(isHsnSac("996813")).toBe(true);
        expect(isHsnSac("123")).toBe(false);
        expect(isHsnSac("19A5")).toBe(false);
    });

    it("knows a GSTIN's shape and a prefix's", () => {
        expect(GSTIN_SHAPE.test("29AAGCR4375J1ZU")).toBe(true);
        expect(GSTIN_SHAPE.test("29AAGCR4375J1Z")).toBe(false);
        expect(PREFIX_SHAPE.test("RC")).toBe(true);
        expect(PREFIX_SHAPE.test("RYEC")).toBe(false);
    });
});
