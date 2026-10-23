import { describe, expect, it } from "vitest";

import {
    clashWords,
    dayCount,
    offAdded,
    offDates,
    offLines,
    offRowWords,
    offSpan,
    quickDates,
    withClosures,
} from "./time-off";
import type { StaffList, TimeOff } from "./types";

const IST = "Asia/Kolkata";

/** A line's words with the dot's no-break spaces as plain ones. */
function words(...args: Parameters<typeof offRowWords>) {
    const w = offRowWords(...args);
    const plain = (t: string) => t.replace(/\u00a0/g, " ");
    return { title: plain(w.title), sub: plain(w.sub) };
}

function row(over: Partial<TimeOff> & { id: string }): TimeOff {
    return {
        startAt: "2026-11-01T18:30:00.000Z",
        endAt: "2026-11-06T18:30:00.000Z",
        allDay: true,
        reason: "Diwali",
        ...over,
    };
}

/** 14:00–18:00 IST on a date, as the API stores a part-day row. */
function afternoon(id: string, date: string, reason = "Course"): TimeOff {
    return {
        id,
        startAt: `${date}T08:30:00.000Z`,
        endAt: `${date}T12:30:00.000Z`,
        allDay: false,
        reason,
    };
}

describe("offLines", () => {
    it("shows an all-day range as one line of 5 days, business closed", () => {
        const [line] = offLines([row({ id: "c1" })], IST, true);
        expect(line).toMatchObject({
            ids: ["c1"],
            fromDate: "2026-11-02",
            toDate: "2026-11-06",
            days: 5,
            allDay: true,
            closed: true,
        });
        expect(words(line, null, "2026-10-19")).toEqual({
            title: "Diwali · 2 to 6 Nov",
            sub: "Whole business closed",
        });
    });

    it("joins a part-day range's rows, one per day, into one line", () => {
        const lines = offLines(
            [
                afternoon("b", "2026-11-03"),
                afternoon("a", "2026-11-02"),
                afternoon("c", "2026-11-04"),
            ],
            IST,
            false,
        );
        expect(lines).toHaveLength(1);
        expect(lines[0].ids).toEqual(["a", "b", "c"]);
        expect(words(lines[0], "Meera Iyer", "2026-10-19")).toEqual({
            title: "Meera · 2 to 4 Nov",
            sub: "Course · 2 to 6 pm · 3 days",
        });
    });

    it("keeps rows apart across a gap, other hours, or another reason", () => {
        const lines = offLines(
            [
                afternoon("a", "2026-11-02"),
                afternoon("b", "2026-11-04"),
                afternoon("c", "2026-11-05", "Dentist"),
            ],
            IST,
            false,
        );
        expect(lines.map((l) => l.ids)).toEqual([["a"], ["b"], ["c"]]);
        expect(words(lines[0], "Arjun Rao", "2026-10-19")).toEqual({
            title: "Arjun · Mon 2 Nov",
            sub: "Course · 2 to 6 pm",
        });
    });

    it("names a single all-day with its weekday", () => {
        const [line] = offLines(
            [
                row({
                    id: "d",
                    startAt: "2026-11-01T18:30:00.000Z",
                    endAt: "2026-11-02T18:30:00.000Z",
                }),
            ],
            IST,
            false,
        );
        expect(words(line, "Dr. Neha Kapoor", "2026-10-19")).toEqual({
            title: "Neha · Mon 2 Nov",
            sub: "Diwali · all day",
        });
    });
});

describe("Add time off's words (U17)", () => {
    it("counts days inclusively", () => {
        expect(dayCount("2026-11-02", "2026-11-06")).toBe(5);
        expect(dayCount("2026-11-02", "2026-11-02")).toBe(1);
    });

    it("runs over the new year, with the year said where it isn't this one (BA-03)", () => {
        expect(dayCount("2026-12-30", "2027-01-02")).toBe(4);
        expect(offDates("2026-12-30", "2027-01-02", "2026-10-19")).toBe(
            "30 Dec to 2 Jan 2027",
        );
        expect(offSpan("2026-12-30", "2027-01-02", null)).toBe("4 days.");
    });

    it("says the month once inside one month", () => {
        expect(offDates("2026-10-27", "2026-10-29", "2026-10-19")).toBe(
            "27 to 29 Oct",
        );
        expect(offDates("2026-10-30", "2026-10-30", "2026-10-19")).toBe(
            "Fri 30 Oct",
        );
    });

    it("gives today and tomorrow as one-day ranges", () => {
        expect(quickDates("today", "2026-10-19")).toEqual({
            from: "2026-10-19",
            to: "2026-10-19",
        });
        expect(quickDates("tomorrow", "2026-12-31")).toEqual({
            from: "2027-01-01",
            to: "2027-01-01",
        });
    });

    it("says how long, and that nobody can be booked when the business is closed", () => {
        expect(offSpan("2026-10-20", "2026-10-20", null)).toBe("One day.");
        expect(offSpan("2026-10-27", "2026-10-29", "Kaya Physio")).toBe(
            "3 days. Nobody at Kaya Physio can be booked.",
        );
    });

    it("says how many bookings fall in it, and that they stay", () => {
        expect(clashWords(2)).toBe("2 bookings fall in this time.");
        expect(clashWords(1)).toBe("1 booking falls in this time.");
        expect(offAdded(2)).toBe(
            "Time off added. 2 bookings in it stay booked.",
        );
        expect(offAdded(1)).toBe(
            "Time off added. 1 booking in it stays booked.",
        );
        expect(offAdded(0)).toBe("Time off added.");
    });

    it("says no reason in plain words", () => {
        const [line] = offLines([row({ id: "e", reason: null })], IST, true);
        expect(words(line, null, "2026-10-19").title).toBe(
            "Closed · 2 to 6 Nov",
        );
    });
});

describe("withClosures", () => {
    it("adds the business's closures to everyone's time off", () => {
        const list: StaffList = {
            timezone: IST,
            closures: [row({ id: "c1" })],
            staff: [
                {
                    id: "st_1",
                    name: "Asha",
                    title: null,
                    status: "ACTIVE",
                    membership: null,
                    serviceIds: [],
                    hours: [],
                    weeklyMinutes: 0,
                    extraHours: [],
                    timeOff: [afternoon("t1", "2026-11-10")],
                },
            ],
        };
        expect(withClosures(list).staff[0].timeOff.map((t) => t.id)).toEqual([
            "t1",
            "c1",
        ]);
        expect(withClosures({ ...list, closures: [] })).toEqual({
            ...list,
            closures: [],
        });
    });
});
