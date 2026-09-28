import { describe, expect, it } from "vitest";

import {
    BUSINESS_TYPE_OPTIONS,
    businessTypeForApi,
    businessTypeLabel,
    businessTypeOf,
} from "./business-types";

describe("business types (F10)", () => {
    it("offers the design's six, after Not set", () => {
        expect(BUSINESS_TYPE_OPTIONS.map((o) => o.label)).toEqual([
            "Not set",
            "Individual / sole proprietor",
            "Partnership",
            "LLP",
            "Private limited company",
            "Public limited company",
            "Trust or society",
        ]);
    });

    it("reads an existing company as Private limited", () => {
        expect(businessTypeOf("company")).toBe("pvt");
        expect(businessTypeLabel("company")).toBe("Private limited company");
        expect(businessTypeLabel("pvt")).toBe("Private limited company");
    });

    it("reads none, or a type it does not know, as Not set", () => {
        expect(businessTypeOf(null)).toBe("");
        expect(businessTypeOf(undefined)).toBe("");
        expect(businessTypeOf("cooperative")).toBe("");
        expect(businessTypeLabel(null)).toBeNull();
        expect(businessTypeLabel("cooperative")).toBeNull();
    });

    it("sends Private limited as company this release, the rest as chosen", () => {
        expect(businessTypeForApi("pvt")).toBe("company");
        expect(businessTypeForApi("llp")).toBe("llp");
        expect(businessTypeForApi("")).toBe("");
    });
});
