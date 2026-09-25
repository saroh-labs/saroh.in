import { describe, expect, it } from "vitest";

import type { OpeningHoursDay } from "@/lib/stores/storefronts";

import {
    BACKWARDS_PROBLEM,
    DAY_PROBLEM,
    dayProblem,
    monToThu,
    sameWeek,
    weekFromText,
    weekText,
} from "./opening-hours";

const open = (
    day: OpeningHoursDay["day"],
    from: string,
    to: string,
): OpeningHoursDay => ({ day, open: from, close: to, closed: false });

const WEEK: OpeningHoursDay[] = [
    open("MON", "07:00", "19:00"),
    open("TUE", "07:00", "19:00"),
    open("WED", "07:00", "19:00"),
    open("THU", "07:00", "19:00"),
    open("FRI", "07:00", "20:00"),
    open("SAT", "08:00", "20:00"),
    { day: "SUN", open: "08:00", close: "14:00", closed: true },
];

describe("a saved week as the fields show it", () => {
    it("writes each day as a shop writes it on its door", () => {
        expect(weekText(WEEK)).toEqual({
            mon: "07:00–19:00",
            tue: "07:00–19:00",
            wed: "07:00–19:00",
            thu: "07:00–19:00",
            fri: "07:00–20:00",
            sat: "08:00–20:00",
            sun: "Closed",
        });
    });

    it("leaves every field blank when no week was ever saved", () => {
        expect(Object.values(weekText(null))).toEqual(Array(7).fill(""));
    });

    it("reads Monday to Thursday as one value when they agree", () => {
        expect(monToThu(weekText(WEEK))).toBe("07:00–19:00");
        const text = { ...weekText(WEEK), wed: "Closed" };
        expect(monToThu(text)).toBe(
            "07:00–19:00 · 07:00–19:00 · Closed · 07:00–19:00",
        );
    });
});

describe("what a day's field accepts", () => {
    it.each(["07:00–19:00", "7:00-19:00", "07:00 – 19:00", "closed", "Closed"])(
        "%s",
        (text) => {
            expect(dayProblem(text)).toBeNull();
        },
    );

    it.each(["", "7 to 7", "07:00", "open", "25:00–26:00", "07:61–19:00"])(
        "refuses %s",
        (text) => {
            expect(dayProblem(text)).toBe(DAY_PROBLEM);
        },
    );

    it("refuses a day that closes before it opens", () => {
        expect(dayProblem("19:00–07:00")).toBe(BACKWARDS_PROBLEM);
        expect(dayProblem("09:00–09:00")).toBe(BACKWARDS_PROBLEM);
    });
});

describe("the week the API takes", () => {
    it("pads each time to HH:MM, Monday first", () => {
        const text = { ...weekText(WEEK), mon: "7:00 - 9:30" };
        const week = weekFromText(text, WEEK);
        expect(week.map((d) => d.day)).toEqual([
            "MON",
            "TUE",
            "WED",
            "THU",
            "FRI",
            "SAT",
            "SUN",
        ]);
        expect(week[0]).toEqual(open("MON", "07:00", "09:30"));
    });

    it("keeps a closed day's times, so opening it again brings them back", () => {
        const text = { ...weekText(WEEK), sat: "closed" };
        expect(weekFromText(text, WEEK)[5]).toEqual({
            day: "SAT",
            open: "08:00",
            close: "20:00",
            closed: true,
        });
        expect(weekFromText(text, null)[5]).toEqual({
            day: "SAT",
            open: "09:00",
            close: "18:00",
            closed: true,
        });
    });

    it("round-trips a saved week", () => {
        expect(weekFromText(weekText(WEEK), WEEK)).toEqual(WEEK);
    });
});

describe("storefronts that keep different hours", () => {
    it("are the same when every day reads the same", () => {
        const moved = WEEK.map((d) =>
            d.day === "SUN" ? { ...d, open: "10:00" } : d,
        );
        // A closed day's kept times don't show, so they don't differ.
        expect(sameWeek(WEEK, moved)).toBe(true);
        expect(sameWeek(WEEK, null)).toBe(false);
        expect(sameWeek(null, null)).toBe(true);
    });
});
