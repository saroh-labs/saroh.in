import { describe, expect, it } from "vitest";

import { deletedLine, holdingsSentence } from "./removal";

describe("holdingsSentence", () => {
    it("names the counts when all three are known", () => {
        expect(
            holdingsSentence({ subscriptions: 2, packs: 1, courses: 0 }),
        ).toBe(
            "Their 2 subscriptions and 1 class pack go too, and their bookings paid with a pack or for a course are cancelled. ",
        );
        expect(
            holdingsSentence({ subscriptions: 1, packs: 0, courses: 0 }),
        ).toBe("Their subscription goes too. ");
        expect(
            holdingsSentence({ subscriptions: 0, packs: 0, courses: 2 }),
        ).toBe(
            "Their 2 course seats go too, and their bookings paid with a pack or for a course are cancelled. ",
        );
    });

    it("says nothing when they hold nothing", () => {
        expect(
            holdingsSentence({ subscriptions: 0, packs: 0, courses: 0 }),
        ).toBe("");
    });

    it("stays general when a count is not known", () => {
        expect(holdingsSentence({ subscriptions: 2, packs: 1 })).toMatch(
            /^Any subscription, class pack or course seat they hold ends/,
        );
    });
});

const base = {
    id: "c_1",
    deleted: true as const,
    leads: 0,
    subscriptions: 0,
    packs: 0,
    courses: 0,
    bookingsCancelled: 0,
};

describe("deletedLine", () => {
    it("says only the name when nothing went with them", () => {
        expect(deletedLine("Asha Rao", base)).toBe("Asha Rao deleted");
    });

    it("names what went with them", () => {
        expect(deletedLine("Asha Rao", { ...base, leads: 2 })).toBe(
            "Asha Rao deleted, with 2 leads",
        );
        expect(
            deletedLine("Asha Rao", {
                ...base,
                leads: 2,
                subscriptions: 1,
                packs: 1,
            }),
        ).toBe(
            "Asha Rao deleted, with 2 leads, 1 subscription and 1 class pack",
        );
    });

    it("says which bookings were cancelled", () => {
        expect(
            deletedLine("Asha Rao", {
                ...base,
                packs: 1,
                courses: 1,
                bookingsCancelled: 2,
            }),
        ).toBe(
            "Asha Rao deleted, with 1 class pack and 1 course. 2 bookings still to come were cancelled",
        );
    });
});
