import { describe, expect, it } from "vitest";

import {
    addMonths,
    dayRange,
    dotsFor,
    headerTitle,
    monthCells,
    monthTitle,
    summaryLine,
    weekCells,
    weekStripLabel,
} from "./calendar-header";

/** Header C's words (U2): the title, the summary line, the date sheet. */
const TODAY = "2026-10-19"; // a Monday

describe("the date title", () => {
    it("names today and tomorrow, and any other day plainly", () => {
        expect(headerTitle("day", TODAY, TODAY)).toBe("Today, Mon 19 Oct");
        expect(headerTitle("day", "2026-10-20", TODAY)).toBe(
            "Tomorrow, Tue 20 Oct",
        );
        expect(headerTitle("agenda", "2026-10-22", TODAY)).toBe("Thu 22 Oct");
        expect(headerTitle("day", "2027-01-04", TODAY)).toBe("Mon 4 Jan 2027");
    });

    it("names the week by its days", () => {
        expect(headerTitle("week", "2026-10-22", TODAY)).toBe(
            "This week, 19–25 Oct",
        );
        expect(headerTitle("week", "2026-10-27", TODAY)).toBe(
            "Next week, 26 Oct–1 Nov",
        );
        expect(headerTitle("week", "2026-10-14", TODAY)).toBe(
            "Last week, 12–18 Oct",
        );
        expect(headerTitle("week", "2026-11-04", TODAY)).toBe("2–8 Nov");
    });

    it("writes years across a new year", () => {
        expect(dayRange("2026-12-28", "2027-01-03")).toBe(
            "28 Dec 2026–3 Jan 2027",
        );
        expect(dayRange("2026-10-19", "2026-10-25", " to ")).toBe(
            "19 to 25 Oct",
        );
    });
});

describe("the summary line", () => {
    it("says what is booked, what is free and its worth", () => {
        expect(
            summaryLine({
                booked: 5,
                free: 3,
                money: "₹2,400",
                cancelledShown: 0,
            }),
        ).toBe("5 booked · 3 free times · ₹2,400 booked");
    });

    it("leaves the money out for someone who may not see it", () => {
        expect(
            summaryLine({ booked: 5, free: 1, money: null, cancelledShown: 0 }),
        ).toBe("5 booked · 1 free time");
    });

    it("leaves free times out when the hours could not be read", () => {
        expect(
            summaryLine({
                booked: 2,
                free: null,
                money: null,
                cancelledShown: 0,
            }),
        ).toBe("2 booked");
    });

    it("says nothing is booked, and what cancelled is shown", () => {
        expect(
            summaryLine({ booked: 0, free: 7, money: "₹0", cancelledShown: 0 }),
        ).toBe("Nothing booked · 7 free times");
        expect(
            summaryLine({ booked: 3, free: 2, money: null, cancelledShown: 1 }),
        ).toBe("3 booked · 2 free times · 1 cancelled shown");
    });
});

describe("the date sheet", () => {
    const facts = (d: string) => ({
        count: d === "2026-10-22" ? 3 : d === "2026-10-23" ? 7 : 0,
        closed: d === "2026-10-25",
    });

    it("labels the week strip", () => {
        expect(weekStripLabel("2026-10-19", TODAY)).toBe(
            "This week · 19 to 25 Oct",
        );
        expect(weekStripLabel("2026-10-26", TODAY)).toBe(
            "Next week · 26 Oct to 1 Nov",
        );
        expect(weekStripLabel("2026-11-02", TODAY)).toBe("2 to 8 Nov");
    });

    it("gives each day of the week its count, or Closed", () => {
        const week = weekCells("2026-10-19", "2026-10-22", TODAY, facts);
        expect(week.map((c) => c.weekday)).toEqual([
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
        ]);
        expect(week[0]?.today).toBe(true);
        expect(week[3]).toMatchObject({
            picked: true,
            count: 3,
            dots: 2,
            label: "Thu 22 Oct, 3 bookings",
        });
        expect(week[6]).toMatchObject({
            closed: true,
            dots: 0,
            label: "Sun 25 Oct, closed",
        });
    });

    it("lays the month on a Monday grid with dots for busy days", () => {
        const { lead, days } = monthCells(
            "2026-10",
            "2026-10-22",
            TODAY,
            facts,
        );
        expect(lead).toBe(3); // 1 Oct 2026 is a Thursday
        expect(days).toHaveLength(31);
        expect(days.find((c) => c.date === "2026-10-23")?.dots).toBe(3);
        expect(days.find((c) => c.date === "2026-10-01")?.past).toBe(true);
    });

    it("steps months and names them", () => {
        expect(addMonths("2026-12", 1)).toBe("2027-01");
        expect(addMonths("2026-01", -1)).toBe("2025-12");
        expect(monthTitle("2026-10")).toBe("October 2026");
        expect([0, 1, 2, 3, 5, 6, 20].map(dotsFor)).toEqual([
            0, 1, 1, 2, 2, 3, 3,
        ]);
    });
});
