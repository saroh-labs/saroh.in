import { describe, expect, it } from "vitest";

import {
    MAX_STOREFRONTS,
    MAX_WEBSITES,
    mayAddStorefront,
    mayAddWebsite,
} from "./business-limits";

describe("one storefront and one website per business (ADR-006)", () => {
    it("is one of each, for now", () => {
        expect(MAX_STOREFRONTS).toBe(1);
        expect(MAX_WEBSITES).toBe(1);
    });

    it("offers the first and nothing after", () => {
        expect(mayAddStorefront(0)).toBe(true);
        expect(mayAddStorefront(1)).toBe(false);
        expect(mayAddWebsite(0)).toBe(true);
        expect(mayAddWebsite(1)).toBe(false);
    });

    it("offers nothing to a business that already has several", () => {
        expect(mayAddStorefront(3)).toBe(false);
        expect(mayAddWebsite(2)).toBe(false);
    });
});
