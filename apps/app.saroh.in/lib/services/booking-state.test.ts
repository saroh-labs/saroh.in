import { describe, expect, it } from "vitest";

import { isInNextWeek } from "./booking-state";

const NOW = Date.parse("2026-09-21T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** A 30-minute booking starting `days` from NOW. */
function at(days: number) {
    const start = NOW + days * DAY;
    return {
        startAt: new Date(start).toISOString(),
        endAt: new Date(start + 30 * 60 * 1000).toISOString(),
    };
}

describe("isInNextWeek", () => {
    it("leaves out a booking that ended yesterday (#360)", () => {
        expect(isInNextWeek(at(-1), NOW)).toBe(false);
    });

    it("leaves out one that ended three weeks ago", () => {
        expect(isInNextWeek(at(-21), NOW)).toBe(false);
    });

    it("keeps one that is happening right now", () => {
        const started = {
            startAt: new Date(NOW - 10 * 60 * 1000).toISOString(),
            endAt: new Date(NOW + 20 * 60 * 1000).toISOString(),
        };
        expect(isInNextWeek(started, NOW)).toBe(true);
    });

    it("keeps one later today and one six days out", () => {
        expect(isInNextWeek(at(0.25), NOW)).toBe(true);
        expect(isInNextWeek(at(6), NOW)).toBe(true);
    });

    it("keeps one exactly a week out, and not one eight days out", () => {
        expect(isInNextWeek(at(7), NOW)).toBe(true);
        expect(isInNextWeek(at(8), NOW)).toBe(false);
    });
});
