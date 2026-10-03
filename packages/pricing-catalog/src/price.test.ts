import { describe, expect, it } from "vitest";

import {
    formatInr,
    gstPaise,
    monthlyEquivalentPaise,
    planPricePaise,
    withGstPaise,
    yearlyPaise,
} from "./price";

// The rupee sign, built from its code point so no file but the seed spells it.
const R = String.fromCodePoint(0x20b9);

describe("catalogue money", () => {
    it("adds GST once per line, rounded half-up to the paisa", () => {
        // 18% of 833.33 is 149.9994: one rounding, to 150.00.
        expect(gstPaise(83_333)).toBe(15_000);
        expect(withGstPaise(83_333)).toBe(98_333);
        // 18% of 0.25 is 0.045: half-up to 0.05; 0.03 → 0.0054 → 0.01.
        expect(gstPaise(25)).toBe(5);
        expect(gstPaise(3)).toBe(1);
        expect(gstPaise(2)).toBe(0);
        expect(gstPaise(0)).toBe(0);
    });

    it("refuses anything but whole, non-negative paise", () => {
        expect(() => gstPaise(1.5)).toThrow(RangeError);
        expect(() => gstPaise(-1)).toThrow(RangeError);
    });

    it("prices a year as N paid months, and its month half-up", () => {
        expect(yearlyPaise(11_100, 9)).toBe(99_900);
        expect(monthlyEquivalentPaise(99_900)).toBe(8_325);
        expect(monthlyEquivalentPaise(100)).toBe(8); // 8.33 → 8
        expect(monthlyEquivalentPaise(102)).toBe(9); // 8.5 → 9
        expect(
            planPricePaise(
                { yearly: { on: true, paid: 9 } },
                { pricePaise: 11_100 },
                "year",
            ),
        ).toBe(99_900);
        expect(
            planPricePaise(
                { yearly: { on: true, paid: 9 } },
                { pricePaise: 11_100 },
                "month",
            ),
        ).toBe(11_100);
    });

    it("formats rupees the Indian way, with paise only when there are some", () => {
        expect(formatInr(11_100)).toBe(`${R}111`);
        expect(formatInr(12_345_600)).toBe(`${R}1,23,456`);
        expect(formatInr(83_333)).toBe(`${R}833.33`);
        expect(formatInr(0)).toBe(`${R}0`);
    });
});
