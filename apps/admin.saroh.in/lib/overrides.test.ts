import { describe, expect, it } from "vitest";

import { endOfDayIso, overrideKindWords, rupeesToPaise } from "./overrides";

describe("rupeesToPaise", () => {
    it("reads whole rupees, paise and grouping without floating point", () => {
        expect(rupeesToPaise("12")).toBe(1200);
        expect(rupeesToPaise("1,234.5")).toBe(123_450);
        expect(rupeesToPaise("₹ 0.07")).toBe(7);
        expect(rupeesToPaise("0")).toBe(0);
    });

    it("refuses what isn't an amount", () => {
        expect(rupeesToPaise("")).toBeNull();
        expect(rupeesToPaise("-3")).toBeNull();
        expect(rupeesToPaise("1.234")).toBeNull();
        expect(rupeesToPaise("ten")).toBeNull();
    });
});

describe("endOfDayIso", () => {
    it("lasts through the day in India time", () => {
        expect(endOfDayIso("2030-01-31")).toBe("2030-01-31T18:29:59.999Z");
    });

    it("is undefined for an empty or malformed date", () => {
        expect(endOfDayIso("")).toBeUndefined();
        expect(endOfDayIso("31/01/2030")).toBeUndefined();
    });
});

describe("overrideKindWords", () => {
    it("says each kind in words, and an unknown one as itself", () => {
        expect(overrideKindWords("grant")).toBe("Granted");
        expect(overrideKindWords("odd")).toBe("odd");
    });
});
