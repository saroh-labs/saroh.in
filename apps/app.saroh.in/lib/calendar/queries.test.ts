/**
 * The calendar's address as a read (DEC-259): the page and the browser key
 * the same days for the same address, pulled inside what the calendar
 * reaches, and the key carries the business.
 */
import { describe, expect, it } from "vitest";

import { calendarAt, calendarRead, openHref } from "./queries";

const NOW = {
    today: "2026-11-24",
    thisMonth: "2026-11",
    joinedAt: "2026-03-10",
};

describe("calendarAt", () => {
    it("a month keys on its days; no month is this one", () => {
        expect(calendarAt({ month: "2026-10" }, NOW)).toEqual({
            view: "month",
            span: { from: "2026-10-01", to: "2026-10-31" },
            picked: true,
            moved: null,
        });
        expect(calendarAt({}, NOW).span).toEqual({
            from: "2026-11-01",
            to: "2026-11-30",
        });
        // An address can carry anything: a bad month is no pick.
        expect(calendarAt({ month: "2026-13" }, NOW)).toMatchObject({
            span: { from: "2026-11-01" },
            picked: false,
        });
    });

    it("a week keys on Monday to Sunday of its day, or of today", () => {
        expect(calendarAt({ view: "week", day: "2026-10-01" }, NOW)).toEqual({
            view: "week",
            span: { from: "2026-09-28", to: "2026-10-04" },
            picked: true,
            moved: null,
        });
        expect(calendarAt({ view: "week", day: "2026-02-30" }, NOW)).toEqual({
            view: "week",
            span: { from: "2026-11-23", to: "2026-11-29" },
            picked: false,
            moved: null,
        });
    });

    it("a range out of reach keys on the clamped range and says where to go", () => {
        expect(calendarAt({ month: "2030-01", team: "st_1" }, NOW)).toEqual({
            view: "month",
            span: { from: "2027-02-01", to: "2027-02-28" },
            picked: true,
            moved: "/calendar?month=2027-02",
        });
        expect(calendarAt({ month: "2026-01" }, NOW).moved).toBe(
            "/calendar?month=2026-03",
        );
        const week = calendarAt(
            { view: "week", day: "2025-01-01", team: "st_1" },
            NOW,
        );
        expect(week.span).toEqual({ from: "2026-03-09", to: "2026-03-15" });
        expect(week.moved).toBe("/calendar?view=week&day=2026-03-10&team=st_1");
    });

    it("the API's out-of-reach month opens that month, or its week", () => {
        expect(openHref("month", "2026-11", NOW)).toBe("/calendar");
        expect(openHref("month", "2026-04", NOW)).toBe(
            "/calendar?month=2026-04",
        );
        expect(openHref("week", "2026-04", NOW, "st_1")).toBe(
            "/calendar?view=week&day=2026-04-01&team=st_1",
        );
    });
});

describe("calendarRead", () => {
    it("keys on the business and the days", () => {
        const span = { from: "2026-10-01", to: "2026-10-31" };
        expect(calendarRead.key("org_a", span)).toEqual([
            "calendar",
            "org_a",
            "range",
            span,
        ]);
        expect(calendarRead.key("org_b", span)).not.toEqual(
            calendarRead.key("org_a", span),
        );
    });
});
