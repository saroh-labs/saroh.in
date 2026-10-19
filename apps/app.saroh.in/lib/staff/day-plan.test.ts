import { describe, expect, it } from "vitest";

import {
    daySummary,
    dayWords,
    everyoneSummary,
    hoursAWeek,
    lunchFor,
    nextShift,
    openWeekSentence,
    planOf,
    planRefusal,
    rangesOfPlan,
    severalRanges,
    severalSaved,
    shortDays,
    spanWords,
    weekMeta,
    weekWords,
    withDay,
    withDays,
} from "./day-plan";
import type { WeeklyRange } from "./types";

/** The dot's no-break spaces as plain ones, to compare words. */
const plain = (t: string | null) => t?.replace(/\u00a0/g, " ") ?? null;

const span = (startMinute: number, endMinute: number) => ({
    startMinute,
    endMinute,
});

/** Meera: 9 am to 7 pm with lunch 1 to 3, Monday to Friday; Sat 9 to 1. */
const MEERA: WeeklyRange[] = [
    ...[1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
        { dayOfWeek, startMinute: 540, endMinute: 780 },
        { dayOfWeek, startMinute: 900, endMinute: 1140 },
    ]),
    { dayOfWeek: 6, startMinute: 540, endMinute: 780 },
];

describe("a day's plan", () => {
    it("reads two ranges close together as a day with lunch", () => {
        expect(planOf([span(900, 1140), span(540, 780)])).toEqual({
            open: true,
            opens: 540,
            closes: 1140,
            lunch: { from: 780, to: 900 },
            shifts: [],
        });
    });

    it("reads two ranges far apart as a split day: another shift", () => {
        expect(planOf([span(420, 660), span(1020, 1200)])).toEqual({
            open: true,
            opens: 420,
            closes: 660,
            lunch: null,
            shifts: [span(1020, 1200)],
        });
    });

    it("reads an evening an hour after the day as another shift, not lunch", () => {
        expect(planOf([span(540, 1140), span(1200, 1320)])).toMatchObject({
            lunch: null,
            shifts: [span(1200, 1320)],
        });
    });

    it("turns back into the same ranges it came from", () => {
        for (const ranges of [
            [span(540, 780), span(900, 1140)],
            [span(420, 660), span(1020, 1200)],
            [span(540, 780), span(840, 1080), span(1140, 1260)],
            [span(600, 1140)],
        ]) {
            expect(rangesOfPlan(planOf(ranges))).toEqual(ranges);
        }
        expect(
            rangesOfPlan({ ...planOf([span(600, 1140)]), open: false }),
        ).toEqual([]);
    });

    it("refuses a day that closes before it opens, lunch outside it, or an overlap", () => {
        const day = planOf([span(540, 1140)]);
        expect(planRefusal(day)).toBeNull();
        expect(planRefusal({ ...day, closes: 500 })).toBe(
            "It has to close after it opens.",
        );
        expect(planRefusal({ ...day, lunch: { from: 840, to: 780 } })).toBe(
            "Lunch has to end after it starts.",
        );
        expect(planRefusal({ ...day, lunch: { from: 480, to: 600 } })).toBe(
            "Lunch has to be inside the day's hours.",
        );
        expect(planRefusal({ ...day, shifts: [span(1100, 1200)] })).toBe(
            "That overlaps hours already set.",
        );
        expect(planRefusal({ ...day, shifts: [span(1250, 1200)] })).toBe(
            "A shift has to end after it starts.",
        );
        expect(planRefusal({ ...day, open: false, closes: 0 })).toBeNull();
    });

    it("puts a new lunch at 1 pm, or in the middle of a short day", () => {
        expect(lunchFor({ opens: 540, closes: 1140 })).toEqual({
            from: 780,
            to: 840,
        });
        expect(lunchFor({ opens: 900, closes: 1140 })).toEqual({
            from: 1020,
            to: 1050,
        });
    });

    it("puts another shift an hour after the day, or nowhere when it's late", () => {
        expect(nextShift(planOf([span(540, 1080)]))).toEqual(span(1140, 1260));
        expect(nextShift(planOf([span(540, 1350)]))).toBeNull();
    });
});

describe("the weekly list's words", () => {
    it("says a time short and am or pm once when both ends share it", () => {
        expect(spanWords(540, 1140)).toBe("9 am to 7 pm");
        expect(spanWords(780, 900)).toBe("1 to 3 pm");
        expect(spanWords(570, 615)).toBe("9:30 to 10:15 am");
        expect(spanWords(1140, 1440)).toBe("7 pm to 12 am");
    });

    it("says a day's hours, lunch or a second shift under them, or Closed", () => {
        expect(daySummary([span(540, 780), span(900, 1140)])).toEqual({
            main: "9 am to 7 pm",
            sub: "Lunch 1 to 3 pm",
        });
        expect(daySummary([span(420, 660), span(1020, 1200)])).toEqual({
            main: "7 to 11 am",
            sub: "and 5 to 8 pm",
        });
        expect(daySummary([])).toEqual({ main: "Closed", sub: null });
        const both = daySummary([
            span(540, 780),
            span(840, 1080),
            span(1140, 1260),
        ]);
        expect(plain(both.sub)).toBe("Lunch 1 to 2 pm · and 7 to 9 pm");
    });

    it("says everyone's day from the first in to the last out, and who works", () => {
        expect(
            everyoneSummary([
                { name: "Meera Iyer", ranges: [span(540, 1140)] },
                { name: "Dr. Arjun Rao", ranges: [span(600, 1080)] },
                { name: "Neha Kapoor", ranges: [] },
            ]),
        ).toEqual({ main: "9 am to 7 pm", sub: "Meera, Arjun" });
        expect(everyoneSummary([{ name: "Neha", ranges: [] }])).toEqual({
            main: "Closed",
            sub: null,
        });
    });

    it("counts the week's hours", () => {
        expect(hoursAWeek(MEERA)).toBe(44);
        expect(weekMeta(MEERA)).toBe("44 hours a week");
    });
});

describe("changing days", () => {
    it("replaces one day and leaves the rest", () => {
        const next = withDay(MEERA, 6, []);
        expect(next.filter((h) => h.dayOfWeek === 6)).toEqual([]);
        expect(next.filter((h) => h.dayOfWeek === 1)).toHaveLength(2);
    });

    it("gives several days the same hours, replacing theirs", () => {
        const choice = {
            open: true,
            opens: 540,
            closes: 1140,
            lunch: { from: 780, to: 900 },
        };
        const next = withDays([], [1, 2, 3, 4, 5], severalRanges(choice));
        expect(next).toHaveLength(10);
        expect(severalSaved([5, 1, 2, 3, 4], choice)).toBe(
            "Mon, Tue, Wed, Thu, Fri: 9 am to 7 pm, lunch 1 to 3 pm. Saved.",
        );
        expect(severalSaved([6, 0], { ...choice, open: false })).toBe(
            "Sat, Sun: closed. Saved.",
        );
        expect(
            withDays(
                MEERA,
                [6, 0],
                severalRanges({ ...choice, open: false }),
            ).some((h) => h.dayOfWeek === 6),
        ).toBe(false);
    });

    it("lists days in the week's order", () => {
        expect(shortDays([0, 6, 1])).toBe("Mon, Sat, Sun");
    });
});

describe("the toasts", () => {
    it("names the day and whose it is, past a title", () => {
        expect(dayWords.closed("Saturday", "Meera Iyer")).toBe(
            "Saturday is now closed for Meera. Saved.",
        );
        expect(dayWords.opened("Saturday", "Dr. Arjun Rao")).toBe(
            "Saturday is open again for Arjun. Saved.",
        );
        expect(dayWords.time("Monday", "opens", 600)).toBe(
            "Monday opens at 10:00 am. Saved.",
        );
        expect(dayWords.copied("Monday", 2)).toBe(
            "Monday's hours now also on 2 more days. Saved.",
        );
        expect(dayWords.failed("Saturday", "Meera Iyer")).toBe(
            "Couldn't save Saturday for Meera. Nothing has changed.",
        );
    });
});

describe("a week in words", () => {
    it("joins neighbouring days with the same hours", () => {
        const week: WeeklyRange[] = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startMinute: 600,
            endMinute: 1140,
        }));
        expect(weekWords(week)).toEqual([
            {
                days: "Monday to Saturday",
                hours: "10 am to 7 pm",
                closed: false,
            },
            { days: "Sunday", hours: "Closed", closed: true },
        ]);
        expect(
            openWeekSentence([
                ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
                    dayOfWeek,
                    startMinute: 540,
                    endMinute: 1080,
                })),
                { dayOfWeek: 6, startMinute: 600, endMinute: 840 },
            ]),
        ).toBe("Mon to Fri 9 am to 6 pm, and Sat 10 am to 2 pm");
    });
});
