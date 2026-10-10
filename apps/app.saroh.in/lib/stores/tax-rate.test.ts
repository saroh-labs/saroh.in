import { describe, expect, it } from "vitest";

import { taxRateField, taxRateSays, taxRateValid } from "./tax-rate";

/** Payments' read-first Tax rate row and its sheet's bounds. */
describe("the tax rate", () => {
    it("the row's sentence drops the zeros the API stores", () => {
        expect(taxRateSays("18.00")).toBe(
            "18% of each order's items, before delivery",
        );
        expect(taxRateSays("12.50")).toBe(
            "12.5% of each order's items, before delivery",
        );
        expect(taxRateField("0.00")).toBe("0");
    });

    it("takes 0 to 100 with up to 2 decimals", () => {
        for (const ok of ["0", "5", "18", "12.5", "12.55", "100", " 18 "]) {
            expect(taxRateValid(ok)).toBe(true);
        }
        for (const bad of ["", "140", "100.5", "12.555", "-1", "abc", "18%"]) {
            expect(taxRateValid(bad)).toBe(false);
        }
    });
});
