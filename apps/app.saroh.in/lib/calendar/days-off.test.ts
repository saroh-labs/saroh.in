import { describe, expect, it } from "vitest";

import { cellOff, dayOffLine, shortName } from "./days-off";
import type { CalendarMonth, DayOff } from "./types";

/*
 * Days off on the calendar (plan 005 E24), as Kavi Dental (E29) has them:
 * the clinic closed for Diwali, and a dentist's day off. Times are IST, so a
 * whole day starts at 18:30 UTC the evening before.
 */

const PILLAI = "st-pillai";
const RAO = "st-rao";
const STAFF = [
    { id: PILLAI, name: "Dr. Arun Pillai", title: "Dentist" },
    { id: RAO, name: "Dr. Meenakshi Rao", title: "Dentist" },
];

type Month = Pick<CalendarMonth, "daysOff" | "timezone" | "staff">;

const month = (daysOff: DayOff[] | null, over: Partial<Month> = {}): Month => ({
    timezone: "Asia/Kolkata",
    daysOff,
    staff: STAFF,
    ...over,
});

const diwali: DayOff = {
    kind: "closure",
    startAt: "2026-11-07T18:30:00Z",
    endAt: "2026-11-09T18:30:00Z",
    allDay: true,
    dates: ["2026-11-08", "2026-11-09"],
    reason: "Closed for Diwali",
};

const pillaiOff: DayOff = {
    kind: "time_off",
    startAt: "2026-09-22T18:30:00Z",
    endAt: "2026-09-23T18:30:00Z",
    allDay: true,
    dates: ["2026-09-23"],
    staffId: PILLAI,
    name: "Dr. Arun Pillai",
    reason: "At a dental conference in Chennai",
};

const raoOff: DayOff = {
    ...pillaiOff,
    staffId: RAO,
    name: "Dr. Meenakshi Rao",
    reason: null,
};

/** 14:00–18:00 IST on the 23rd. */
const raoAfternoon: DayOff = {
    kind: "time_off",
    startAt: "2026-09-23T08:30:00Z",
    endAt: "2026-09-23T12:30:00Z",
    allDay: false,
    dates: ["2026-09-23"],
    staffId: RAO,
    name: "Dr. Meenakshi Rao",
    reason: "School run",
};

/** As a viewer without `booking:read` gets it: no who, no why. */
const unnamed = (d: DayOff): DayOff => ({
    kind: d.kind,
    startAt: d.startAt,
    endAt: d.endAt,
    allDay: d.allDay,
    dates: d.dates,
});

describe("shortName", () => {
    it("keeps a doctor's title with their surname", () => {
        expect(shortName("Dr. Arun Pillai")).toBe("Dr. Pillai");
        expect(shortName("Dr Meenakshi Rao")).toBe("Dr. Rao");
    });

    it("uses anyone else's first name", () => {
        expect(shortName("Vikram Shah")).toBe("Vikram");
        expect(shortName("Asha")).toBe("Asha");
    });
});

describe("cellOff", () => {
    it("says a closed day is closed, and stripes it", () => {
        const m = month([diwali]);
        for (const date of ["2026-11-08", "2026-11-09"]) {
            expect(cellOff(m, date, null)).toEqual({
                text: "Closed",
                title: "Closed · Closed for Diwali",
                striped: true,
            });
        }
        expect(cellOff(m, "2026-11-10", null)).toBeNull();
    });

    it("says a closed day is closed for a person picked too", () => {
        expect(cellOff(month([diwali]), "2026-11-08", RAO)?.text).toBe(
            "Closed",
        );
    });

    it("names one person off, without stripes, for Everyone", () => {
        expect(cellOff(month([pillaiOff]), "2026-09-23", null)).toEqual({
            text: "Dr. Pillai off",
            title: "Dr. Arun Pillai off · At a dental conference in Chennai",
            striped: false,
        });
    });

    it("counts two or more off", () => {
        const m = month([pillaiOff, raoOff], {
            staff: [...STAFF, { id: "x", name: "Nisha", title: null }],
        });
        expect(cellOff(m, "2026-09-23", null)).toEqual({
            text: "2 off",
            title: "Dr. Arun Pillai and Dr. Meenakshi Rao off · At a dental conference in Chennai",
            striped: false,
        });
    });

    it("draws the day closed when everyone on the team is off", () => {
        expect(cellOff(month([pillaiOff, raoOff]), "2026-09-23", null)).toEqual(
            {
                text: "Closed",
                title: "Dr. Arun Pillai and Dr. Meenakshi Rao off · At a dental conference in Chennai",
                striped: true,
            },
        );
    });

    it("with a person picked, says only their day off, striped", () => {
        const m = month([pillaiOff]);
        expect(cellOff(m, "2026-09-23", PILLAI)?.text).toBe("Off");
        expect(cellOff(m, "2026-09-23", PILLAI)?.striped).toBe(true);
        expect(cellOff(m, "2026-09-23", RAO)).toBeNull();
    });

    it("leaves a few hours off out of the cell", () => {
        expect(cellOff(month([raoAfternoon]), "2026-09-23", null)).toBeNull();
        expect(cellOff(month([raoAfternoon]), "2026-09-23", RAO)).toBeNull();
    });

    it("counts a day strictly inside a longer stretch as off", () => {
        const week: DayOff = {
            ...raoOff,
            allDay: false,
            startAt: "2026-09-21T08:30:00Z",
            endAt: "2026-09-24T08:30:00Z",
            dates: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"],
        };
        const m = month([week]);
        expect(cellOff(m, "2026-09-21", null)).toBeNull();
        expect(cellOff(m, "2026-09-22", null)?.text).toBe("Dr. Rao off");
        expect(cellOff(m, "2026-09-23", null)?.text).toBe("Dr. Rao off");
        expect(cellOff(m, "2026-09-24", null)).toBeNull();
    });

    it("says the same person once, however many rows they have", () => {
        const m = month([pillaiOff, { ...pillaiOff, reason: null }]);
        expect(cellOff(m, "2026-09-23", null)?.text).toBe("Dr. Pillai off");
    });

    it("tells a viewer who doesn't read bookings how many, never who", () => {
        const m = month([unnamed(pillaiOff)], { staff: undefined });
        expect(cellOff(m, "2026-09-23", null)).toEqual({
            text: "1 off",
            title: "1 person off",
            striped: false,
        });
        const two = month([unnamed(pillaiOff), unnamed(raoOff)], {
            staff: undefined,
        });
        expect(cellOff(two, "2026-09-23", null)?.title).toBe("2 people off");
    });

    it("says nothing when days off couldn't be read", () => {
        expect(cellOff(month(null), "2026-09-23", null)).toBeNull();
    });
});

describe("dayOffLine", () => {
    it("says the business is closed and why", () => {
        expect(dayOffLine(month([diwali]), "2026-11-08")).toBe(
            "Closed · Closed for Diwali",
        );
    });

    it("names who is off and why", () => {
        expect(dayOffLine(month([pillaiOff]), "2026-09-23")).toBe(
            "Dr. Arun Pillai off · At a dental conference in Chennai",
        );
    });

    it("names a few hours off by their hours", () => {
        expect(dayOffLine(month([pillaiOff, raoAfternoon]), "2026-09-23")).toBe(
            "Dr. Arun Pillai off · At a dental conference in Chennai · Dr. Meenakshi Rao off 14:00–18:00 · School run",
        );
    });

    it("names a part-day closure by its hours", () => {
        const early: DayOff = {
            kind: "closure",
            startAt: "2026-09-24T10:30:00Z",
            endAt: "2026-09-24T18:30:00Z",
            allDay: false,
            dates: ["2026-09-24"],
            reason: null,
        };
        expect(dayOffLine(month([early]), "2026-09-24")).toBe(
            "Closed 16:00–24:00",
        );
    });

    it("is nothing on a day nobody is off", () => {
        expect(dayOffLine(month([pillaiOff]), "2026-09-24")).toBeNull();
        expect(dayOffLine(month(null), "2026-09-24")).toBeNull();
    });
});
