import { describe, expect, it } from "vitest";

import {
    dayCount,
    offButtonLabel,
    offLineLabel,
    offLines,
    offNote,
    withClosures,
} from "./time-off";
import type { StaffList, TimeOff } from "./types";

const IST = "Asia/Kolkata";

function row(over: Partial<TimeOff> & { id: string }): TimeOff {
    return {
        startAt: "2026-11-01T18:30:00.000Z",
        endAt: "2026-11-06T18:30:00.000Z",
        allDay: true,
        reason: "Diwali",
        ...over,
    };
}

/** 14:00–18:00 IST on a date, as the API stores a part-day row. */
function afternoon(id: string, date: string, reason = "Course"): TimeOff {
    return {
        id,
        startAt: `${date}T08:30:00.000Z`,
        endAt: `${date}T12:30:00.000Z`,
        allDay: false,
        reason,
    };
}

describe("offLines", () => {
    it("shows an all-day range as one line of 5 days, business closed", () => {
        const [line] = offLines([row({ id: "c1" })], IST, true);
        expect(line).toMatchObject({
            ids: ["c1"],
            fromDate: "2026-11-02",
            toDate: "2026-11-06",
            days: 5,
            allDay: true,
            closed: true,
        });
        expect(offLineLabel(line)).toBe(
            "2 Nov – 6 Nov · 5 days · all day · business closed",
        );
    });

    it("joins a part-day range's rows, one per day, into one line", () => {
        const lines = offLines(
            [
                afternoon("b", "2026-11-03"),
                afternoon("a", "2026-11-02"),
                afternoon("c", "2026-11-04"),
            ],
            IST,
            false,
        );
        expect(lines).toHaveLength(1);
        expect(lines[0].ids).toEqual(["a", "b", "c"]);
        expect(offLineLabel(lines[0])).toBe(
            "2 Nov – 4 Nov · 3 days · 14:00–18:00",
        );
    });

    it("keeps rows apart across a gap, other hours, or another reason", () => {
        const lines = offLines(
            [
                afternoon("a", "2026-11-02"),
                afternoon("b", "2026-11-04"),
                afternoon("c", "2026-11-05", "Dentist"),
            ],
            IST,
            false,
        );
        expect(lines.map((l) => l.ids)).toEqual([["a"], ["b"], ["c"]]);
        expect(offLineLabel(lines[0])).toBe("Mon 2 Nov · 14:00–18:00");
    });

    it("names a single all-day with its weekday", () => {
        const [line] = offLines(
            [
                row({
                    id: "d",
                    startAt: "2026-11-01T18:30:00.000Z",
                    endAt: "2026-11-02T18:30:00.000Z",
                }),
            ],
            IST,
            false,
        );
        expect(offLineLabel(line)).toBe("Mon 2 Nov · all day");
    });
});

describe("the form's words", () => {
    it("counts days inclusively", () => {
        expect(dayCount("2026-11-02", "2026-11-06")).toBe(5);
        expect(dayCount("2026-11-02", "2026-11-02")).toBe(1);
    });

    it.each([
        [{ days: 5, closed: true, partOfDay: false }, "Close for 5 days"],
        [{ days: 1, closed: true, partOfDay: true }, "Close that day"],
        [{ days: 3, closed: false, partOfDay: true }, "Add 3 days off"],
        [{ days: 1, closed: false, partOfDay: true }, "Add time off"],
        [{ days: 1, closed: false, partOfDay: false }, "Add day off"],
    ])("labels the button for %j as %s", (input, label) => {
        expect(offButtonLabel(input)).toBe(label);
    });

    it("says why it can't, what is booked, or what closing means", () => {
        expect(
            offNote({
                refusal: "The end has to be after the start.",
                taken: 3,
                closed: false,
            }),
        ).toEqual({
            text: "The end has to be after the start.",
            tone: "danger",
        });
        expect(offNote({ refusal: null, taken: 3, closed: true })).toEqual({
            text: "3 bookings fall in this time. They're kept. Move or cancel them from the calendar.",
            tone: "warn",
        });
        expect(
            offNote({ refusal: null, taken: 1, closed: false }).text,
        ).toMatch(/^1 booking falls/);
        expect(offNote({ refusal: null, taken: 0, closed: true }).text).toBe(
            "Nobody can be booked then, and the booking page and calendar show it as closed.",
        );
        expect(offNote({ refusal: null, taken: 0, closed: false }).text).toBe(
            "Nothing booked then.",
        );
        expect(
            offNote({ refusal: null, taken: null, closed: false }).text,
        ).toBe("Bookings then couldn't be checked.");
    });
});

describe("withClosures", () => {
    it("adds the business's closures to everyone's time off", () => {
        const list: StaffList = {
            timezone: IST,
            closures: [row({ id: "c1" })],
            staff: [
                {
                    id: "st_1",
                    name: "Asha",
                    title: null,
                    status: "ACTIVE",
                    membership: null,
                    serviceIds: [],
                    hours: [],
                    weeklyMinutes: 0,
                    extraHours: [],
                    timeOff: [afternoon("t1", "2026-11-10")],
                },
            ],
        };
        expect(withClosures(list).staff[0].timeOff.map((t) => t.id)).toEqual([
            "t1",
            "c1",
        ]);
        expect(withClosures({ ...list, closures: [] })).toEqual({
            ...list,
            closures: [],
        });
    });
});
