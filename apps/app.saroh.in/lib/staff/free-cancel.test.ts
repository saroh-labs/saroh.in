import { describe, expect, it } from "vitest";

import { freeCancelHoursFor, pastFreeCancel } from "./free-cancel";
import type { PersonRules } from "./types";

const own = (freeCancelHours: number | null): { rules: PersonRules } => ({
    rules: {
        bookAheadDays: null,
        latestBookingMinutes: null,
        freeCancelHours,
        gapMinutes: null,
    },
});

describe("freeCancelHoursFor", () => {
    it("takes the person's own rule over the business's", () => {
        expect(freeCancelHoursFor({ freeCancelHours: 24 }, own(2))).toBe(2);
        expect(freeCancelHoursFor({ freeCancelHours: 24 }, own(0))).toBe(0);
    });

    it("falls back to the business when they have none", () => {
        expect(freeCancelHoursFor({ freeCancelHours: 24 }, own(null))).toBe(24);
        expect(freeCancelHoursFor({ freeCancelHours: 24 }, {})).toBe(24);
        expect(freeCancelHoursFor({ freeCancelHours: 24 }, null)).toBe(24);
        expect(freeCancelHoursFor(null, null)).toBeNull();
    });
});

describe("pastFreeCancel", () => {
    const start = "2026-10-20T10:00:00.000Z";
    const at = (iso: string) => Date.parse(iso);
    it("is past once inside the window, never with no rule", () => {
        expect(pastFreeCancel(2, start, at("2026-10-20T07:59:00Z"))).toBe(
            false,
        );
        expect(pastFreeCancel(2, start, at("2026-10-20T08:01:00Z"))).toBe(true);
        expect(pastFreeCancel(null, start, at("2026-10-20T09:59:00Z"))).toBe(
            false,
        );
    });
});
