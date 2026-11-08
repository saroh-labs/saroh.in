import { describe, expect, it, vi } from "vitest";

import {
    BUSINESS_TYPE_OPTIONS,
    businessTypeLabel,
    businessTypeOf,
} from "./business-types";

describe("business types (F10, F10b)", () => {
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

    it("never offers the old company spelling, so a save sends pvt (F10b)", () => {
        const values: readonly string[] = BUSINESS_TYPE_OPTIONS.map(
            (o) => o.value,
        );
        expect(values).toContain("pvt");
        expect(values).not.toContain("company");
    });
});

describe("business types on a named tax line (Global)", () => {
    it("names the six generically, keeping their codes", async () => {
        vi.resetModules();
        vi.doMock("@/lib/edition", async () => {
            const { editionProfile } = await import("@saroh/edition");
            return { PROFILE: editionProfile("GLOBAL") };
        });
        const global = await import("./business-types");
        expect(global.BUSINESS_TYPE_OPTIONS.map((o) => o.label)).toEqual([
            "Not set",
            "Sole proprietor",
            "Partnership",
            "LLP",
            "Private company (LLC, Ltd)",
            "Public company",
            "Non-profit or trust",
        ]);
        expect(global.businessTypeLabel("pvt")).toBe(
            "Private company (LLC, Ltd)",
        );
        vi.doUnmock("@/lib/edition");
    });
});
