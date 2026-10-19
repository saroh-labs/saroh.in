import { describe, expect, it } from "vitest";

import {
    asksWith,
    bookProblem,
    bookWhen,
    closedWeekdaysOf,
    firstStep,
    nextFreeWords,
    nextLabel,
    nextVisitDays,
    placesNote,
    stepAfter,
    stepBefore,
    stepProblem,
    whenWords,
    withWords,
} from "./new-booking";

const ZONE = "Asia/Kolkata";
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();
// Mon 19 Oct 2026, 8:30 am in India.
const NOW = Date.parse("2026-10-19T03:00:00.000Z");

const one = {
    id: "s1",
    name: "Physio assessment",
    minutes: 45,
    priceCents: 80000,
    currency: "INR",
    capacity: 1,
};
const group = { ...one, id: "s2", name: "Mat Pilates", capacity: 8 };
const person = (id: string, serviceIds: string[]) => ({
    id,
    name: id,
    title: null,
    serviceIds,
    workDays: [1, 2, 3, 4, 5],
});

describe("New booking's steps (U8)", () => {
    it("asks who they'll see only for a one-to-one more than one person does", () => {
        const two = [person("meera", ["s1"]), person("arjun", ["s1"])];
        expect(asksWith(one, two)).toBe(true);
        expect(asksWith(one, two.slice(0, 1))).toBe(false);
        expect(
            asksWith(group, [person("neha", ["s2"]), person("x", ["s2"])]),
        ).toBe(false);
        expect(asksWith(null, two)).toBe(false);
    });

    it("skips With forward and back where it isn't asked", () => {
        expect(stepAfter(1, true)).toBe(2);
        expect(stepAfter(2, true)).toBe(3);
        expect(stepAfter(2, false)).toBe(4);
        expect(stepAfter(5, true)).toBe(5);
        expect(stepBefore(4, false)).toBe(2);
        expect(stepBefore(4, true)).toBe(3);
        expect(stepBefore(1, true)).toBe(1);
    });

    it("starts each way in at the first thing it doesn't know", () => {
        const known = {
            who: false,
            service: false,
            withChosen: false,
            asks: true,
        };
        expect(firstStep(known)).toBe(1);
        expect(firstStep({ ...known, who: true })).toBe(2);
        expect(firstStep({ ...known, who: true, service: true })).toBe(3);
        expect(
            firstStep({
                who: true,
                service: true,
                withChosen: true,
                asks: true,
            }),
        ).toBe(4);
        expect(
            firstStep({
                who: true,
                service: true,
                withChosen: false,
                asks: false,
            }),
        ).toBe(4);
    });

    it("names what is missing, step by step and before Book", () => {
        const empty = {
            who: false,
            hasServices: true,
            serviceId: null,
            startAt: null,
        };
        expect(stepProblem(1, empty)).toBe("Pick who it's for, or add them.");
        expect(stepProblem(2, empty)).toBe("Pick a service.");
        expect(stepProblem(2, { ...empty, hasServices: false })).toBe(
            "Add a service first.",
        );
        expect(stepProblem(3, empty)).toBeNull();
        expect(stepProblem(4, empty)).toBe("Pick a time.");
        expect(stepProblem(4, { ...empty, noDay: true })).toBe("Pick a day.");
        expect(bookProblem({ ...empty, who: true, serviceId: "s1" })).toEqual({
            step: 4,
            message: "Pick a time.",
        });
        expect(
            bookProblem({
                who: true,
                hasServices: true,
                serviceId: "s1",
                startAt: at("2026-10-20T10:00"),
            }),
        ).toBeNull();
    });

    it("words the sticky button", () => {
        const base = { adding: false, asks: true, first: "Kabir", when: "" };
        expect(nextLabel(1, base)).toBe("Next: service");
        expect(nextLabel(1, { ...base, adding: true })).toBe("Add and use");
        expect(nextLabel(2, base)).toBe("Next: who they'll see");
        expect(nextLabel(2, { ...base, asks: false })).toBe(
            "Next: day and time",
        );
        expect(nextLabel(3, base)).toBe("Next: day and time");
        expect(nextLabel(4, base)).toBe("Next: check and book");
        expect(
            nextLabel(5, {
                ...base,
                when: bookWhen(at("2026-10-20T10:00"), ZONE),
            }),
        ).toBe("Book Kabir · Tue 20, 10:00 am");
        expect(whenWords(at("2026-10-20T10:00"), ZONE)).toBe(
            "Tue 20 Oct, 10:00 am",
        );
    });

    it("says who they'll see, as the check card does", () => {
        const meera = { name: "Meera Iyer" };
        const none = { chosen: null, atTime: null, isClass: false, only: null };
        expect(withWords(none)).toBe("Anyone free");
        expect(withWords({ ...none, atTime: meera })).toBe(
            "Meera Iyer (anyone free)",
        );
        expect(withWords({ ...none, chosen: meera })).toBe("Meera Iyer");
        expect(withWords({ ...none, only: meera })).toBe("Meera Iyer");
        expect(withWords({ ...none, isClass: true })).toBe(
            "The class's teacher",
        );
        expect(
            withWords({ ...none, isClass: true, atTime: { name: "Neha" } }),
        ).toBe("Neha");
    });

    it("counts a class's places left", () => {
        expect(placesNote(4)).toBe("4 places left");
        expect(placesNote(1)).toBe("1 place left");
        expect(placesNote(0)).toBe("Full");
        expect(placesNote(undefined)).toBeNull();
    });

    it("says when each person is next free", () => {
        const slots = [
            {
                startAt: at("2026-10-19T12:15"),
                endAt: "",
                staffIds: ["meera"],
            },
            {
                startAt: at("2026-10-20T09:00"),
                endAt: "",
                staffIds: ["arjun"],
            },
            {
                startAt: at("2026-10-22T09:00"),
                endAt: "",
                staffIds: ["ravi"],
            },
        ];
        expect(nextFreeWords("meera", slots, ZONE, NOW)).toBe(
            "next free today, 12:15 pm",
        );
        expect(nextFreeWords("arjun", slots, ZONE, NOW)).toBe(
            "next free tomorrow, 9:00 am",
        );
        expect(nextFreeWords("ravi", slots, ZONE, NOW)).toBe(
            "next free Thu 22 Oct, 9:00 am",
        );
        expect(nextFreeWords("neha", slots, ZONE, NOW)).toBe(
            "No free time in the next two weeks",
        );
        expect(nextFreeWords("meera", null, ZONE, NOW)).toBeNull();
    });

    it("offers tomorrow and next week for the next visit (Q16)", () => {
        expect(nextVisitDays("2026-10-19", ZONE)).toEqual([
            { key: "tomorrow", date: "2026-10-20", label: "Tomorrow · Tue 20" },
            { key: "week", date: "2026-10-26", label: "Next week · Mon 26" },
        ]);
    });

    it("closes the days nobody works", () => {
        expect(
            closedWeekdaysOf([
                [1, 2, 3],
                [3, 4, 5, 6],
            ]),
        ).toEqual([0]);
        expect(closedWeekdaysOf([])).toEqual([]);
    });
});
