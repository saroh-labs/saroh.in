import { describe, expect, it } from "vitest";

import { GSTIN_SHAPE, isHsnSac, PREFIX_SHAPE, rateOption } from "./gst";

describe("GST in the editors", () => {
    it("reads a saved rate as its option, whatever its decimals", () => {
        expect(rateOption("18.00")).toBe("18");
        expect(rateOption("0.25")).toBe("0.25");
        expect(rateOption("0")).toBe("0");
        expect(rateOption(null)).toBe("");
        expect(rateOption("7")).toBe("");
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
