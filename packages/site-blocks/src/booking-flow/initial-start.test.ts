import { describe, expect, it } from "vitest";

import {
    findInitialStart,
    initialDateOf,
    initialTimeOf,
} from "./initial-start";
import type { BookingDays } from "./model";

/** The booking page opened from On today (G18): `?date=&start=`. */

const DAYS: BookingDays = {
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    days: [
        {
            date: "2026-09-18",
            open: true,
            starts: [
                {
                    // 10:15 in Bengaluru.
                    startAt: "2026-09-18T04:45:00.000Z",
                    endAt: "2026-09-18T05:30:00.000Z",
                    staffId: "st_karan",
                    staffName: "Karan",
                    placesLeft: null,
                },
            ],
        },
    ],
};

describe("initialDateOf / initialTimeOf", () => {
    it("takes a date and a time as the link writes them", () => {
        expect(initialDateOf("2026-09-18")).toBe("2026-09-18");
        expect(initialTimeOf("10:15")).toBe("10:15");
    });

    it("drops anything else: a list, a partial value, junk", () => {
        expect(initialDateOf(["2026-09-18"])).toBeNull();
        expect(initialDateOf("18/09/2026")).toBeNull();
        expect(initialDateOf(undefined)).toBeNull();
        expect(initialTimeOf("10:15am")).toBeNull();
        expect(initialTimeOf("24:00")).toBeNull();
        expect(initialTimeOf("<script>")).toBeNull();
    });
});

describe("findInitialStart", () => {
    it("finds the start at that day and wall-clock time in the business's zone", () => {
        expect(findInitialStart(DAYS, "2026-09-18", "10:15", false)).toBe(
            DAYS.days[0]?.starts[0],
        );
    });

    it("is null when the time has gone, or the day is not offered", () => {
        expect(findInitialStart(DAYS, "2026-09-18", "10:30", false)).toBeNull();
        expect(findInitialStart(DAYS, "2026-09-19", "10:15", false)).toBeNull();
    });

    it("is null for a class with no places left", () => {
        const full: BookingDays = {
            ...DAYS,
            kind: "class",
            days: [
                {
                    date: "2026-09-18",
                    open: true,
                    starts: [
                        {
                            startAt: "2026-09-18T04:45:00.000Z",
                            endAt: "2026-09-18T05:30:00.000Z",
                            staffId: "st_karan",
                            staffName: "Karan",
                            placesLeft: 0,
                        },
                    ],
                },
            ],
        };
        expect(findInitialStart(full, "2026-09-18", "10:15", true)).toBeNull();
    });
});
