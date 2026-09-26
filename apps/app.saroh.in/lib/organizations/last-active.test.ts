import { describe, expect, it } from "vitest";

import { lastActive } from "./last-active";

// Local noon, so a day either side stays on its own calendar day in any zone.
const now = new Date(2026, 8, 25, 12, 0, 0);
const at = (days: number, hours = 0, minutes = 0) =>
    new Date(2026, 8, 25 - days, 12 - hours, -minutes, 0).toISOString();

describe("lastActive", () => {
    it("says nothing when they hold no session", () => {
        expect(lastActive(null, now)).toBeNull();
        expect(lastActive(undefined, now)).toBeNull();
        expect(lastActive("not a date", now)).toBeNull();
    });

    it("is 'now' for a few minutes, then 'today'", () => {
        expect(lastActive(at(0, 0, 3), now)).toEqual({
            text: "Active now",
            stale: false,
        });
        expect(lastActive(at(0, 2), now)?.text).toBe("Active today");
    });

    it("counts calendar days, not 24-hour spans", () => {
        // 11pm yesterday is yesterday, though only 13 hours ago.
        expect(
            lastActive(new Date(2026, 8, 24, 23, 0).toISOString(), now)?.text,
        ).toBe("Active yesterday");
        expect(lastActive(at(2), now)?.text).toBe("Active 2 days ago");
        expect(lastActive(at(29), now)).toEqual({
            text: "Active 29 days ago",
            stale: false,
        });
    });

    it("turns stale from a month", () => {
        // Exactly 30 calendar days is the first stale one.
        expect(lastActive(at(30), now)).toEqual({
            text: "Last active 30 days ago",
            stale: true,
        });
        expect(lastActive(at(34), now)).toEqual({
            text: "Last active 34 days ago",
            stale: true,
        });
    });
});
