import { describe, expect, it } from "vitest";

import {
    hoursFromRules,
    hoursNotSaved,
    hoursProblems,
    rulesOf,
    sameHours,
    startingHours,
    timeToMinutes,
} from "./service-hours-draft";

const OPENING = [
    { dayOfWeek: 0, startMinute: 600, endMinute: 840 },
    { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
    { dayOfWeek: 1, startMinute: 900, endMinute: 1080 },
    { dayOfWeek: 1, startMinute: 540, endMinute: 780 },
];

describe("hoursFromRules", () => {
    it("lists the week Monday first and Sunday last, earliest window first", () => {
        expect(hoursFromRules(OPENING)).toEqual([
            { dayOfWeek: 1, start: "09:00", end: "13:00" },
            { dayOfWeek: 1, start: "15:00", end: "18:00" },
            { dayOfWeek: 2, start: "09:00", end: "18:00" },
            { dayOfWeek: 0, start: "10:00", end: "14:00" },
        ]);
    });

    it("writes midnight as the end of the day", () => {
        expect(
            hoursFromRules([{ dayOfWeek: 5, startMinute: 0, endMinute: 1440 }]),
        ).toEqual([{ dayOfWeek: 5, start: "00:00", end: "24:00" }]);
        expect(timeToMinutes("24:00")).toBe(1440);
        expect(timeToMinutes("24:15")).toBeNull();
        expect(timeToMinutes("nine")).toBeNull();
    });
});

describe("startingHours", () => {
    it("starts a new service from the opening hours when its own hours are what gives it times", () => {
        expect(startingHours(OPENING, true)).toHaveLength(4);
        expect(startingHours(OPENING, true)[0]).toEqual({
            dayOfWeek: 1,
            start: "09:00",
            end: "13:00",
        });
    });

    it("starts with none where someone takes it, since its own hours would only narrow theirs", () => {
        expect(startingHours(OPENING, false)).toEqual([]);
    });

    it("starts with none when the business has set no opening hours", () => {
        expect(startingHours(null, true)).toEqual([]);
        expect(startingHours([], true)).toEqual([]);
    });
});

describe("sameHours", () => {
    it("is the same windows in any order", () => {
        const a = hoursFromRules(OPENING);
        expect(sameHours(a, [...a].reverse())).toBe(true);
        expect(sameHours(a, a.slice(1))).toBe(false);
        expect(
            sameHours(a, [
                { dayOfWeek: 1, start: "09:00", end: "13:15" },
                ...a.slice(1),
            ]),
        ).toBe(false);
        expect(sameHours([], [])).toBe(true);
    });
});

describe("hoursProblems and rulesOf", () => {
    it("has nothing to say about windows that end after they start", () => {
        const rows = hoursFromRules(OPENING);
        expect(hoursProblems(rows)).toEqual([]);
        expect(rulesOf(rows)).toEqual([
            { dayOfWeek: 1, startMinute: 540, endMinute: 780 },
            { dayOfWeek: 1, startMinute: 900, endMinute: 1080 },
            { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
            { dayOfWeek: 0, startMinute: 600, endMinute: 840 },
        ]);
    });

    it("names the day of a window that ends before it starts, by its row", () => {
        const rows = [
            { dayOfWeek: 1, start: "09:00", end: "17:00" },
            { dayOfWeek: 3, start: "17:00", end: "09:00" },
            { dayOfWeek: 4, start: "10:00", end: "10:00" },
        ];
        expect(hoursProblems(rows)).toEqual([
            {
                index: 1,
                message:
                    "Wednesday's hours end before they start. Choose a later end.",
            },
            {
                index: 2,
                message:
                    "Thursday's hours end before they start. Choose a later end.",
            },
        ]);
        expect(rulesOf(rows)).toBeNull();
    });

    it("asks for both times of a window with one missing", () => {
        expect(
            hoursProblems([{ dayOfWeek: 6, start: "", end: "12:00" }]),
        ).toEqual([
            { index: 0, message: "Saturday's hours need a start and an end." },
        ]);
    });

    it("sends an empty set for no rows, which clears the hours", () => {
        expect(rulesOf([])).toEqual([]);
    });
});

describe("hoursNotSaved", () => {
    it("says a new service was added and its hours were not, with the reason and what is kept", () => {
        expect(
            hoursNotSaved({
                created: true,
                name: "Glow facial",
                reason: "Couldn't save the availability.",
            }),
        ).toEqual({
            title: "Glow facial was added, but its weekly hours were not saved.",
            body: "Couldn't save the availability. The hours you chose are still here. Try again, or change them and save.",
        });
    });

    it("says an edit's other changes were saved and its hours were not", () => {
        const said = hoursNotSaved({
            created: false,
            name: "Glow facial",
            reason: "That window ends before it starts",
        });
        expect(said.title).toBe(
            "Your other changes were saved, but its weekly hours were not.",
        );
        // The reason ends as a sentence either way.
        expect(said.body).toBe(
            "That window ends before it starts. The hours you chose are still here. Try again, or change them and save.",
        );
    });

    it("is plain words: no em dash, no semicolon", () => {
        const said = hoursNotSaved({ created: true, name: "X", reason: "No." });
        expect(`${said.title} ${said.body}`).not.toMatch(/[—;]/);
    });
});
