import { describe, expect, it } from "vitest";

import {
    calendarLocked,
    calendarRange,
    clampMonth,
    dayShortcuts,
    inRange,
    monthEdges,
    openingDay,
} from "./range";

// Rye & Co. joined on 2 June 2026; today is 18 September.
const TODAY = "2026-09-18";
const RANGE = calendarRange("2026-06-02", "2026-09");

describe("calendarRange", () => {
    it("reaches back to the joined day and forward to the end of the third month on", () => {
        expect(RANGE).toEqual({ first: "2026-06-02", last: "2026-12-31" });
    });

    it("crosses a year, and ends a short month on its last day", () => {
        expect(calendarRange(null, "2026-11").last).toBe("2027-02-28");
    });

    it("sets no back edge when the joined day is unknown or malformed", () => {
        expect(calendarRange(undefined, "2026-09").first).toBeNull();
        expect(calendarRange(null, "2026-09").first).toBeNull();
        expect(calendarRange("June 2026", "2026-09").first).toBeNull();
    });
});

describe("inRange", () => {
    it("greys the days before joining and past what can be planned", () => {
        expect(inRange("2026-06-01", RANGE)).toBe(false);
        expect(inRange("2026-06-02", RANGE)).toBe(true);
        expect(inRange("2026-12-31", RANGE)).toBe(true);
        expect(inRange("2027-01-01", RANGE)).toBe(false);
    });

    it("reaches every past day when the joined day is unknown", () => {
        expect(inRange("2019-01-01", calendarRange(null, "2026-09"))).toBe(
            true,
        );
    });
});

describe("clampMonth", () => {
    it("opens the nearest month the calendar reaches", () => {
        expect(clampMonth("2026-03", RANGE)).toBe("2026-06");
        expect(clampMonth("2027-04", RANGE)).toBe("2026-12");
        expect(clampMonth("2026-10", RANGE)).toBe("2026-10");
    });
});

describe("monthEdges", () => {
    it("the joined month stops ‹ and says why", () => {
        const { before, after } = monthEdges("2026-06", RANGE);
        expect(before).toEqual({
            title: "You joined Saroh in June 2026, so there's nothing earlier",
            note: "Saroh has your data from June 2026",
        });
        expect(after).toBeNull();
    });

    it("the third month ahead stops › and says why", () => {
        expect(monthEdges("2026-12", RANGE)).toEqual({
            before: null,
            after: {
                title: "You can plan up to 3 months ahead",
                note: "You can plan up to 3 months ahead",
            },
        });
    });

    it("a month in between has no edge", () => {
        expect(monthEdges("2026-09", RANGE)).toEqual({
            before: null,
            after: null,
        });
    });

    it("a business that joined this month sits on its back edge only", () => {
        const range = calendarRange("2026-09-01", "2026-09");
        expect(monthEdges("2026-09", range).before?.note).toBe(
            "Saroh has your data from September 2026",
        );
        expect(monthEdges("2026-09", range).after).toBeNull();
    });
});

describe("openingDay", () => {
    const june = Array.from(
        { length: 30 },
        (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`,
    );

    it("opens on today when the month holds it", () => {
        expect(openingDay(["2026-09-17", TODAY], TODAY, RANGE)).toBe(TODAY);
    });

    it("opens the joined month on the joined day, not a greyed one", () => {
        expect(openingDay(june, TODAY, RANGE)).toBe("2026-06-02");
    });
});

describe("dayShortcuts", () => {
    const both = {
        today: TODAY,
        range: RANGE,
        layers: ["orders" as const, "bookings" as const],
        can: { order: true, book: true },
    };

    it('"Book" on the 20th opens Bookings on that date', () => {
        expect(dayShortcuts("2026-09-20", both)).toEqual([
            { label: "New order", href: "/commerce/orders/new" },
            { label: "Book", href: "/bookings?date=2026-09-20" },
        ]);
    });

    it("today offers them too", () => {
        expect(dayShortcuts(TODAY, both)).toHaveLength(2);
    });

    it("a past day, or one past the range, offers nothing", () => {
        expect(dayShortcuts("2026-09-17", both)).toEqual([]);
        expect(dayShortcuts("2027-01-04", both)).toEqual([]);
    });

    it("offers only what the business runs", () => {
        expect(
            dayShortcuts("2026-09-20", { ...both, layers: ["bookings"] }),
        ).toEqual([{ label: "Book", href: "/bookings?date=2026-09-20" }]);
        expect(
            dayShortcuts("2026-09-20", {
                ...both,
                layers: ["orders", "collections"],
            }).map((s) => s.label),
        ).toEqual(["New order"]);
    });

    it("offers nothing this person may not do", () => {
        expect(
            dayShortcuts("2026-09-20", {
                ...both,
                can: { order: false, book: true },
            }).map((s) => s.label),
        ).toEqual(["Book"]);
        expect(
            dayShortcuts("2026-09-20", {
                ...both,
                can: { order: false, book: false },
            }),
        ).toEqual([]);
    });
});

describe("calendarLocked", () => {
    it("a role without any layer read sees the locked card", () => {
        expect(calendarLocked(["org:read", "contact:read"])).toBe(true);
        expect(calendarLocked([])).toBe(true);
    });

    it("any one layer read opens the calendar", () => {
        expect(calendarLocked(["org:read", "invoice:read"])).toBe(false);
        expect(calendarLocked(["booking:read"])).toBe(false);
    });

    it("unknown actions are not a lock — the API decides", () => {
        expect(calendarLocked(undefined)).toBe(false);
    });
});
