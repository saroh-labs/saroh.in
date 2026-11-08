import { describe, expect, it } from "vitest";

import { NAMED_LINE_BUSINESS_TYPES, taxExampleFor } from "./country-words";

describe("the tax-name example", () => {
    it("says each country's own tax", () => {
        expect(taxExampleFor("US")).toEqual({ name: "Sales tax", rate: null });
        expect(taxExampleFor("CA")).toEqual({ name: "GST/HST", rate: null });
        expect(taxExampleFor("GB")).toEqual({ name: "VAT", rate: 20 });
        expect(taxExampleFor("AU")).toEqual({ name: "GST", rate: 10 });
        expect(taxExampleFor("NZ")).toEqual({ name: "GST", rate: 15 });
        expect(taxExampleFor("SG")).toEqual({ name: "GST", rate: 9 });
        expect(taxExampleFor("AE")).toEqual({ name: "VAT", rate: 5 });
        expect(taxExampleFor("ZA")).toEqual({ name: "VAT", rate: 15 });
        expect(taxExampleFor(" de ")).toEqual({ name: "VAT", rate: 19 });
    });

    it("says only Tax for a country it doesn't know", () => {
        expect(taxExampleFor("BR")).toEqual({ name: "Tax", rate: null });
        expect(taxExampleFor(null)).toEqual({ name: "Tax", rate: null });
    });
});

describe("business types on a named tax line", () => {
    it("names the six stored codes without India's words", () => {
        expect(Object.keys(NAMED_LINE_BUSINESS_TYPES)).toEqual([
            "individual",
            "partnership",
            "llp",
            "pvt",
            "public",
            "trust",
        ]);
        expect(NAMED_LINE_BUSINESS_TYPES.pvt).toBe(
            "Private company (LLC, Ltd)",
        );
        for (const label of Object.values(NAMED_LINE_BUSINESS_TYPES)) {
            expect(label).not.toMatch(/limited|society/i);
        }
    });
});
