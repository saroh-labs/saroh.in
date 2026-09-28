import { describe, expect, it } from "vitest";

import {
    addDays,
    addMonths,
    askedDay,
    gridKeyTarget,
    isGridKey,
} from "./grid-keys";
import { calendarRange } from "./range";

// Rye & Co. joined on 2 June 2026; this month is September, so the calendar
// reaches 2 June … 31 December 2026.
const RANGE = calendarRange("2026-06-02", "2026-09");

describe("isGridKey", () => {
    it("answers the arrows, Home, End and the page keys, and nothing else", () => {
        for (const k of [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
            "PageUp",
            "PageDown",
        ]) {
            expect(isGridKey(k)).toBe(true);
        }
        for (const k of ["Enter", " ", "Tab", "Escape", "a"]) {
            expect(isGridKey(k)).toBe(false);
        }
    });
});

describe("addDays and addMonths", () => {
    it("cross a month and a year", () => {
        expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    });

    it("keeps the day inside a shorter month", () => {
        expect(addMonths("2026-10-31", 1)).toBe("2026-11-30");
        expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
        expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    });
});

describe("gridKeyTarget", () => {
    it("moves a day and a week with the arrows", () => {
        expect(gridKeyTarget("ArrowRight", "2026-09-18", RANGE)).toBe(
            "2026-09-19",
        );
        expect(gridKeyTarget("ArrowLeft", "2026-09-18", RANGE)).toBe(
            "2026-09-17",
        );
        expect(gridKeyTarget("ArrowDown", "2026-09-18", RANGE)).toBe(
            "2026-09-25",
        );
        expect(gridKeyTarget("ArrowUp", "2026-09-18", RANGE)).toBe(
            "2026-09-11",
        );
    });

    it("ArrowRight from the 30th moves to the 1st of the next month when it is in range", () => {
        expect(gridKeyTarget("ArrowRight", "2026-09-30", RANGE)).toBe(
            "2026-10-01",
        );
        expect(gridKeyTarget("ArrowDown", "2026-09-28", RANGE)).toBe(
            "2026-10-05",
        );
    });

    it("Home and End go to the Monday and Sunday of the week, across a month", () => {
        // Fri 18 Sep 2026.
        expect(gridKeyTarget("Home", "2026-09-18", RANGE)).toBe("2026-09-14");
        expect(gridKeyTarget("End", "2026-09-18", RANGE)).toBe("2026-09-20");
        // Thu 1 Oct: its Monday is 28 Sep.
        expect(gridKeyTarget("Home", "2026-10-01", RANGE)).toBe("2026-09-28");
    });

    it("Home on a Monday and End on a Sunday stay put", () => {
        expect(gridKeyTarget("Home", "2026-09-14", RANGE)).toBeNull();
        expect(gridKeyTarget("End", "2026-09-20", RANGE)).toBeNull();
    });

    it("PageUp and PageDown move a month, keeping the day where it can", () => {
        expect(gridKeyTarget("PageDown", "2026-09-18", RANGE)).toBe(
            "2026-10-18",
        );
        expect(gridKeyTarget("PageUp", "2026-09-18", RANGE)).toBe("2026-08-18");
        expect(gridKeyTarget("PageDown", "2026-10-31", RANGE)).toBe(
            "2026-11-30",
        );
    });

    it("PageDown at the last allowed month does nothing", () => {
        expect(gridKeyTarget("PageDown", "2026-12-10", RANGE)).toBeNull();
        expect(gridKeyTarget("PageDown", "2026-12-31", RANGE)).toBeNull();
    });

    it("PageUp at the joined month does nothing, and into it lands no earlier than the joined day", () => {
        expect(gridKeyTarget("PageUp", "2026-06-20", RANGE)).toBeNull();
        expect(gridKeyTarget("PageUp", "2026-07-01", RANGE)).toBe("2026-06-02");
    });

    it("stops a day or a week on the last plannable day", () => {
        expect(gridKeyTarget("ArrowRight", "2026-12-31", RANGE)).toBeNull();
        expect(gridKeyTarget("ArrowDown", "2026-12-28", RANGE)).toBe(
            "2026-12-31",
        );
        // Thu 31 Dec: its Sunday is past the range.
        expect(gridKeyTarget("End", "2026-12-31", RANGE)).toBeNull();
    });

    it("stops a day or a week on the joined day", () => {
        expect(gridKeyTarget("ArrowLeft", "2026-06-02", RANGE)).toBeNull();
        expect(gridKeyTarget("ArrowUp", "2026-06-05", RANGE)).toBe(
            "2026-06-02",
        );
        // Tue 2 Jun: its Monday is before the business joined.
        expect(gridKeyTarget("Home", "2026-06-02", RANGE)).toBeNull();
    });

    it("has no back edge when the joined day is unknown", () => {
        const open = calendarRange(null, "2026-09");
        expect(gridKeyTarget("PageUp", "2026-01-15", open)).toBe("2025-12-15");
        expect(gridKeyTarget("ArrowLeft", "2026-01-01", open)).toBe(
            "2025-12-31",
        );
    });
});

describe("askedDay", () => {
    const dates = ["2026-10-01", "2026-10-02", "2026-10-03"];

    it("opens on the day the address names when the month holds it", () => {
        expect(askedDay("2026-10-02", dates, RANGE)).toBe("2026-10-02");
    });

    it("ignores a day outside the month, outside the range, or none", () => {
        expect(askedDay("2026-11-02", dates, RANGE)).toBeNull();
        expect(askedDay(undefined, dates, RANGE)).toBeNull();
        expect(askedDay("junk", dates, RANGE)).toBeNull();
        const june = ["2026-06-01", "2026-06-02"];
        expect(askedDay("2026-06-01", june, RANGE)).toBeNull();
    });
});
