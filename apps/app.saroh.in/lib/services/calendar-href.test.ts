import { describe, expect, it } from "vitest";

import { calendarHref } from "./calendar-href";

/**
 * The calendar's address: the day, the layout, whose bookings, and whether
 * cancelled bookings are drawn. The layout is always written (DEC-170): an
 * address without one opens where the person starts Bookings.
 */
describe("the calendar's address", () => {
    it("names the day and the layout, Day too", () => {
        expect(calendarHref("day", "2026-09-29")).toBe(
            "/bookings?date=2026-09-29&layout=day",
        );
        expect(calendarHref("week", "2026-09-29")).toBe(
            "/bookings?date=2026-09-29&layout=week",
        );
    });

    it("opens a layout on today when no day is given", () => {
        expect(calendarHref("day")).toBe("/bookings?layout=day");
        expect(calendarHref("agenda")).toBe("/bookings?layout=agenda");
    });

    it("keeps whose bookings are shown", () => {
        expect(calendarHref("week", "2026-09-29", { person: "arjun" })).toBe(
            "/bookings?date=2026-09-29&layout=week&person=arjun",
        );
        expect(calendarHref("day", null, { person: "all" })).toBe(
            "/bookings?layout=day&person=all",
        );
    });

    it("keeps cancelled bookings drawn only when asked", () => {
        expect(calendarHref("day", "2026-09-29", { cancelled: true })).toBe(
            "/bookings?date=2026-09-29&layout=day&cancelled=1",
        );
        expect(calendarHref("day", "2026-09-29", { cancelled: false })).toBe(
            "/bookings?date=2026-09-29&layout=day",
        );
    });
});
