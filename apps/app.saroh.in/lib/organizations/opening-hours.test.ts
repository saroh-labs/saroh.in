import { describe, expect, it } from "vitest";

import type { OpeningHoursDay } from "@/lib/stores/storefronts";

import { monToThu, sameWeek, weekText } from "./opening-hours";

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
