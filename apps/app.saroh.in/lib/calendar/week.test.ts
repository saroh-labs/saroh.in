import { describe, expect, it } from "vitest";

import { calendarRange } from "./range";
import {
    addDays,
    clampWeekDay,
    isDay,
    isThisWeek,
    mondayOf,
    weekDates,
    weekDay,
    weekEdges,
    weekHref,
    weekSpan,
    weekTitle,
} from "./week";

/*
 * The Week's dates, title, edges and address (plan 005 E25), on Rye & Co.'s
 * calendar: joined 2 June 2026, today Friday 18 September 2026, reaching
 * to the end of December.
 */

const TODAY = "2026-09-18";
const RANGE = calendarRange("2026-06-02", "2026-09");

describe("the week's days", () => {
    it("runs Monday to Sunday around any day", () => {
        expect(mondayOf("2026-09-18")).toBe("2026-09-14");
        expect(mondayOf("2026-09-14")).toBe("2026-09-14");
        expect(mondayOf("2026-09-20")).toBe("2026-09-14");
        expect(weekSpan(TODAY)).toEqual({
            from: "2026-09-14",
            to: "2026-09-20",
        });
        expect(weekDates("2026-09-14")).toEqual([
            "2026-09-14",
            "2026-09-15",
            "2026-09-16",
            "2026-09-17",
            "2026-09-18",
            "2026-09-19",
            "2026-09-20",
        ]);
    });

    it("reads a week crossing a month as one span, both halves", () => {
        expect(weekSpan("2026-10-02")).toEqual({
            from: "2026-09-28",
            to: "2026-10-04",
        });
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("takes only real dates from an address", () => {
        expect(isDay("2026-09-18")).toBe(true);
        expect(isDay("2026-02-30")).toBe(false);
        expect(isDay("2026-9-18")).toBe(false);
        expect(isDay(undefined)).toBe(false);
        expect(isDay(["2026-09-18"])).toBe(false);
    });
});

describe("weekTitle", () => {
    it("says the design's title", () => {
        expect(weekTitle("2026-09-14")).toBe("14–20 Sep 2026");
    });

    it("names both months when the week crosses one", () => {
        expect(weekTitle("2026-09-28")).toBe("28 Sep–4 Oct 2026");
    });

    it("names both years when it crosses the new year", () => {
        expect(weekTitle("2026-12-28")).toBe("28 Dec 2026–3 Jan 2027");
    });
});

describe("weekEdges", () => {
    it("stops ‹ at the week the business joined, and says why", () => {
        const { before, after } = weekEdges("2026-06-01", RANGE);
        expect(before?.note).toBe("Saroh has your data from June 2026");
        expect(before?.title).toBe(
            "You joined Saroh in June 2026, so there's nothing earlier",
        );
        expect(after).toBeNull();
    });

    it("lets ‹ go back a week once the week before holds a joined day", () => {
        expect(weekEdges("2026-06-08", RANGE).before).toBeNull();
    });

    it("stops › at the last week that can be planned", () => {
        expect(weekEdges("2026-12-28", RANGE).after?.note).toBe(
            "You can plan up to 3 months ahead",
        );
        expect(weekEdges("2026-12-21", RANGE).after).toBeNull();
    });

    it("has no back edge when the joined day is unknown", () => {
        const open = calendarRange(null, "2026-09");
        expect(weekEdges("2020-01-06", open).before).toBeNull();
    });
});

describe("clampWeekDay", () => {
    it("keeps a day whose week the calendar reaches", () => {
        expect(clampWeekDay(TODAY, RANGE)).toBe(TODAY);
        // The joined week begins the day before joining: still read whole.
        expect(clampWeekDay("2026-06-01", RANGE)).toBe("2026-06-01");
    });

    it("pulls a week before joining to the joined day", () => {
        expect(clampWeekDay("2026-05-20", RANGE)).toBe("2026-06-02");
    });

    it("pulls a week past the reach back to its last day", () => {
        expect(clampWeekDay("2027-01-06", RANGE)).toBe("2026-12-31");
        // Monday 28 Dec is in reach, so its week is kept.
        expect(clampWeekDay("2027-01-02", RANGE)).toBe("2027-01-02");
    });
});

describe("weekDay", () => {
    it("opens on the day asked, when it is in the week", () => {
        expect(weekDay("2026-09-16", "2026-09-14", TODAY, RANGE)).toBe(
            "2026-09-16",
        );
    });

    it("opens on today in this week, else the Monday", () => {
        expect(weekDay(undefined, "2026-09-14", TODAY, RANGE)).toBe(TODAY);
        expect(weekDay("2026-10-01", "2026-09-14", TODAY, RANGE)).toBe(TODAY);
        expect(weekDay(undefined, "2026-09-21", TODAY, RANGE)).toBe(
            "2026-09-21",
        );
    });

    it("never opens on a day the calendar doesn't reach", () => {
        expect(weekDay("2026-06-01", "2026-06-01", TODAY, RANGE)).toBe(
            "2026-06-02",
        );
    });
});

describe("weekHref", () => {
    it("is plain for this week's today", () => {
        expect(weekHref({ day: TODAY, today: TODAY })).toBe(
            "/calendar?view=week",
        );
    });

    it("carries the day picked and the person", () => {
        expect(
            weekHref({ day: "2026-09-25", today: TODAY, team: "st-vikram" }),
        ).toBe("/calendar?view=week&day=2026-09-25&team=st-vikram");
    });

    it("knows this week", () => {
        expect(isThisWeek("2026-09-14", TODAY)).toBe(true);
        expect(isThisWeek("2026-09-21", TODAY)).toBe(false);
    });
});
