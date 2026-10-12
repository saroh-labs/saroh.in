import { describe, expect, it } from "vitest";

import { isMrpSaving, percentOff, shownSaving } from "./mrp-saving";

/**
 * The saving a page shows against an MRP (GST is part of MRP, 12 Oct
 * 2026): the API's answer is the truth, and a page with no answer compares
 * the MRP only with an amount to pay it actually holds.
 */
describe("shownSaving", () => {
    const served = { mrp: "1475.00", percent: 20 };

    it("is the API's saving when it sent one", () => {
        // Whatever the page holds, the API's sum is the one shown.
        expect(shownSaving(served, "1000.00", "1475.00")).toEqual(served);
        expect(shownSaving(served, null, null)).toEqual(served);
    });

    it("is none when the API says none: the amount to pay is the MRP or more", () => {
        expect(shownSaving(null, "1000.00", "1475.00")).toBeNull();
    });

    it("is none for an answer that isn't a saving", () => {
        expect(shownSaving("20%", "1000.00", "1475.00")).toBeNull();
        expect(shownSaving({ mrp: 1475 }, "1000.00", "1475.00")).toBeNull();
        expect(
            shownSaving({ mrp: "1475.00", percent: -3 }, "1000.00", "1475.00"),
        ).toBeNull();
    });

    it("with no answer, compares the MRP with the amount to pay the page holds", () => {
        // 1,475 - 1,180 = 295; 295 / 1,475 = 20%.
        expect(shownSaving(undefined, "1180.00", "1475.00")).toEqual({
            mrp: "1475.00",
            percent: 20,
        });
        // 1,475 - 1,000 = 475; 475 / 1,475 = 32.2%, rounded down.
        expect(shownSaving(undefined, "1000.00", "1475.00")).toEqual({
            mrp: "1475.00",
            percent: 32,
        });
    });

    it("with no answer, is none at the MRP, above it, with no MRP, or with no amount to pay to compare", () => {
        expect(shownSaving(undefined, "1180.00", "1180.00")).toBeNull();
        expect(shownSaving(undefined, "1180.00", "1100.00")).toBeNull();
        expect(shownSaving(undefined, "1180.00", null)).toBeNull();
        expect(shownSaving(undefined, null, "1475.00")).toBeNull();
    });
});

describe("percentOff", () => {
    it("rounds down, and is null when nothing is off", () => {
        expect(percentOff("649", "999")).toBe(35);
        expect(percentOff("799", "799")).toBeNull();
        expect(percentOff("800", "799")).toBeNull();
        expect(percentOff("799", null)).toBeNull();
    });
});

describe("isMrpSaving", () => {
    it("takes an MRP as a string with a whole percent, and nothing else", () => {
        expect(isMrpSaving({ mrp: "1475.00", percent: 20 })).toBe(true);
        expect(isMrpSaving({ mrp: "1475.00", percent: 0 })).toBe(true);
        expect(isMrpSaving(null)).toBe(false);
        expect(isMrpSaving({ mrp: "1475.00" })).toBe(false);
        expect(isMrpSaving({ mrp: "1475.00", percent: Number.NaN })).toBe(
            false,
        );
    });
});
