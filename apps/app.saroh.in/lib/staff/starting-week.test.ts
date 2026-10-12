import { describe, expect, it } from "vitest";

import { DEFAULT_WEEK } from "@/lib/stores/default-week";

import {
    defaultWeek,
    hasOpening,
    startingDay,
    startingWeek,
    tidyWeek,
    weekLines,
} from "./starting-week";

const day = (dayOfWeek: number, startMinute = 540, endMinute = 1080) => ({
    dayOfWeek,
    startMinute,
    endMinute,
});

describe("the week someone starts with on the diary", () => {
    it("is the business's opening hours, Monday first", () => {
        const opening = [day(0, 600, 840), day(1), day(2)];
        expect(startingWeek(opening)).toEqual([
            day(1),
            day(2),
            day(0, 600, 840),
        ]);
    });

    it("joins two locations' overlapping hours, so the API takes them", () => {
        // One shop 9 to 1, another 12 to 6, and a split afternoon.
        const opening = [
            day(1, 540, 780),
            day(1, 720, 1080),
            day(2, 540, 720),
            day(2, 840, 1080),
        ];
        expect(startingWeek(opening)).toEqual([
            day(1, 540, 1080),
            day(2, 540, 720),
            day(2, 840, 1080),
        ]);
    });

    it("is the Hours sheet's starting week when none are saved", () => {
        const week = startingWeek(null);
        expect(week).toEqual(defaultWeek());
        // The same DEFAULT_WEEK the Hours sheet starts from, not a copy.
        expect(week.map((r) => r.dayOfWeek)).toEqual(
            DEFAULT_WEEK.filter((d) => !d.closed).map((d) =>
                ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].indexOf(
                    d.day,
                ),
            ),
        );
        expect(week[0]).toEqual(day(1, 540, 1080));
        expect(week).toHaveLength(6);
    });

    it("is the default too when it couldn't be read, or is closed every day", () => {
        expect(startingWeek(undefined)).toEqual(defaultWeek());
        expect(startingWeek([])).toEqual(defaultWeek());
        expect(hasOpening([])).toBe(false);
        expect(hasOpening(null)).toBe(false);
        expect(hasOpening([day(1)])).toBe(true);
    });

    it("never starts anyone with an empty week", () => {
        for (const opening of [null, undefined, [], [day(3)]]) {
            expect(startingWeek(opening).length).toBeGreaterThan(0);
        }
    });
});

describe("a day switched on in the weekly editor", () => {
    it("takes that day's opening hours", () => {
        expect(startingDay([day(1), day(6, 600, 840)], 6)).toEqual([
            day(6, 600, 840),
        ]);
    });

    it("takes the usual hours on a day the business is closed", () => {
        expect(startingDay([day(1)], 0)).toEqual([day(0, 540, 1080)]);
        expect(startingDay(null, 0)).toEqual([day(0, 540, 1080)]);
    });
});

describe("a week in words", () => {
    it("joins neighbouring days with the same hours", () => {
        const week = [1, 2, 3, 4, 5].map((d) => day(d, 540, 1020));
        expect(weekLines(week)).toEqual([
            { days: "Monday to Friday", hours: "9:00 am to 5:00 pm" },
            { days: "Saturday and Sunday", hours: null },
        ]);
    });

    it("says a day of its own, two ranges, and every day the same", () => {
        expect(
            weekLines([day(1, 540, 720), day(1, 840, 1080), day(2, 540, 1080)]),
        ).toEqual([
            {
                days: "Monday",
                hours: "9:00 am to 12:00 pm and 2:00 to 6:00 pm",
            },
            { days: "Tuesday", hours: "9:00 am to 6:00 pm" },
            { days: "Wednesday to Sunday", hours: null },
        ]);
        expect(weekLines([0, 1, 2, 3, 4, 5, 6].map((d) => day(d)))).toEqual([
            { days: "Monday to Sunday", hours: "9:00 am to 6:00 pm" },
        ]);
    });

    it("reads several services' hours together as one week", () => {
        // Two services, 9 to 1 and 12 to 5 on Mondays.
        expect(tidyWeek([day(1, 540, 780), day(1, 720, 1020)])).toEqual([
            day(1, 540, 1020),
        ]);
    });
});
