// Collections: which dates a period holds on the collection weekday, when a
// skip saves a charge, and what the next few look like.
import {
    collectionDates,
    collectionToCome,
    dateKey,
    dateValue,
    everyCollectionSkipped,
    localDate,
    upcomingCollections,
} from "./collections";

const at = (s: string) => new Date(s);
const SATURDAY = 6;

describe("collectionDates", () => {
    it("dates a monthly period's weekly collections", () => {
        // September 2026: the 1st is a Tuesday.
        expect(
            collectionDates(
                {
                    start: at("2026-09-01T00:00:00Z"),
                    end: at("2026-10-01T00:00:00Z"),
                },
                SATURDAY,
                "UTC",
            ),
        ).toEqual(["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
    });

    it("counts a collection on the first day, never the day it ends", () => {
        const period = {
            start: at("2026-09-05T00:00:00Z"),
            end: at("2026-09-12T00:00:00Z"),
        };
        expect(collectionDates(period, SATURDAY, "UTC")).toEqual([
            "2026-09-05",
        ]);
    });

    it("reads days in the subscription's own zone", () => {
        // Kolkata's midnight on Saturday 5 Sep is 18:30 UTC on the Friday.
        const period = {
            start: at("2026-09-04T18:30:00Z"),
            end: at("2026-09-11T18:30:00Z"),
        };
        expect(collectionDates(period, SATURDAY, "Asia/Kolkata")).toEqual([
            "2026-09-05",
        ]);
        // A Friday collection: in Kolkata the period runs Sat 5 – Fri 11, so
        // the Friday is the 11th; read in UTC it starts on Fri the 4th.
        const FRIDAY = 5;
        expect(collectionDates(period, FRIDAY, "Asia/Kolkata")).toEqual([
            "2026-09-11",
        ]);
        expect(collectionDates(period, FRIDAY, "UTC")).toEqual(["2026-09-04"]);
    });

    it("has none in an empty period (a start still ahead)", () => {
        const start = at("2026-10-03T00:00:00Z");
        expect(collectionDates({ start, end: start }, SATURDAY, "UTC")).toEqual(
            [],
        );
    });
});

describe("everyCollectionSkipped", () => {
    const week = {
        start: at("2026-09-05T00:00:00Z"),
        end: at("2026-09-12T00:00:00Z"),
    };
    const month = {
        start: at("2026-09-01T00:00:00Z"),
        end: at("2026-10-01T00:00:00Z"),
    };

    it("is true for a weekly period whose one collection is skipped", () => {
        expect(
            everyCollectionSkipped(
                week,
                SATURDAY,
                "UTC",
                new Set(["2026-09-05"]),
            ),
        ).toBe(true);
    });

    it("is false when one of a month's collections is still made", () => {
        expect(
            everyCollectionSkipped(
                month,
                SATURDAY,
                "UTC",
                new Set(["2026-09-05", "2026-09-12", "2026-09-19"]),
            ),
        ).toBe(false);
    });

    it("is false for a period with no collections at all", () => {
        // A week holds every weekday, so only an empty period has none.
        const empty = { start: week.start, end: week.start };
        expect(
            everyCollectionSkipped(empty, 3, "UTC", new Set(["2026-09-09"])),
        ).toBe(false);
    });
});

describe("upcomingCollections", () => {
    it("lists the next ones from today, marking skipped and today's", () => {
        expect(
            upcomingCollections({
                weekday: SATURDAY,
                from: "2026-09-26",
                until: null,
                today: "2026-09-26",
                skipped: new Set(["2026-10-03"]),
                count: 3,
            }),
        ).toEqual([
            { date: "2026-09-26", skipped: false, changeable: false },
            { date: "2026-10-03", skipped: true, changeable: true },
            { date: "2026-10-10", skipped: false, changeable: true },
        ]);
    });

    it("stops before the day a subscription set to end runs out", () => {
        expect(
            upcomingCollections({
                weekday: SATURDAY,
                from: "2026-09-22",
                until: "2026-10-01",
                today: "2026-09-22",
                skipped: new Set(),
            }).map((c) => c.date),
        ).toEqual(["2026-09-26"]);
    });
});

describe("dates", () => {
    it("round-trips a DATE column and reads a moment's local day", () => {
        expect(dateKey(dateValue("2026-10-03"))).toBe("2026-10-03");
        expect(localDate(at("2026-10-02T20:00:00Z"), "Asia/Kolkata")).toBe(
            "2026-10-03",
        );
    });
});

describe("collectionToCome", () => {
    // September 2026's Saturdays: 5, 12, 19 and 26.
    const september = {
        start: at("2026-09-01T00:00:00Z"),
        end: at("2026-10-01T00:00:00Z"),
    };
    const come = (today: string, skipped: string[] = []) =>
        collectionToCome(september, SATURDAY, "UTC", today, new Set(skipped));

    it("counts today and later, never a date behind", () => {
        expect(come("2026-09-26")).toBe(true);
        expect(come("2026-09-27")).toBe(false);
    });

    it("needs one of them not skipped", () => {
        expect(come("2026-09-20", ["2026-09-26"])).toBe(false);
        expect(come("2026-09-19", ["2026-09-26"])).toBe(true);
    });
});
