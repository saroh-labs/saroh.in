import { describe, expect, it } from "vitest";

import { calendarHref } from "./calendar-href";

/**
 * The calendar's address: the layout, the day, and whether cancelled
 * bookings are drawn. The last is in the address so a reload keeps it.
 */
describe("the calendar's address", () => {
    it("names the day, and the layout when it is not the day by person", () => {
        expect(calendarHref("day", "2026-09-29")).toBe(
            "/bookings?date=2026-09-29",
        );
        expect(calendarHref("week", "2026-09-29")).toBe(
            "/bookings?date=2026-09-29&layout=week",
        );
    });

    it("opens a layout on today when no day is given", () => {
        expect(calendarHref("day")).toBe("/bookings");
        expect(calendarHref("agenda")).toBe("/bookings?layout=agenda");
    });

    it("keeps cancelled bookings drawn only when asked", () => {
        expect(calendarHref("day", "2026-09-29", { cancelled: true })).toBe(
            "/bookings?date=2026-09-29&cancelled=1",
        );
        expect(calendarHref("day", "2026-09-29", { cancelled: false })).toBe(
            "/bookings?date=2026-09-29",
        );
    });
});
