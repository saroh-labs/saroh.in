import { describe, expect, it } from "vitest";

import {
    MAX_WEBSITES,
    mayAddStorefront,
    mayAddWebsite,
} from "./business-limits";

describe("one website per business (ADR-006)", () => {
    it("is one, for now", () => {
        expect(MAX_WEBSITES).toBe(1);
    });

    it("offers the first and nothing after", () => {
        expect(mayAddWebsite(0)).toBe(true);
        expect(mayAddWebsite(1)).toBe(false);
        expect(mayAddWebsite(2)).toBe(false);
    });
});

describe("storefronts up to the plan (ADR-010)", () => {
    it("offers another while under the plan's number", () => {
        expect(mayAddStorefront({ used: 0, limit: 5 })).toBe(true);
        expect(mayAddStorefront({ used: 1, limit: 5 })).toBe(true);
        expect(mayAddStorefront({ used: 4, limit: 5 })).toBe(true);
    });

    it("offers nothing at the plan's number, or past it", () => {
        expect(mayAddStorefront({ used: 5, limit: 5 })).toBe(false);
        expect(mayAddStorefront({ used: 3, limit: 2 })).toBe(false);
    });

    it("offers it when the allowance could not be read — the API decides", () => {
        expect(mayAddStorefront(null)).toBe(true);
    });
});
