import { describe, expect, it } from "vitest";

import {
    openingNote,
    openOn,
    outsideOpening,
    whollyOutside,
} from "./in-person-hours";

// Open 09:00–18:00 Monday to Saturday; closed Sundays.
const OPEN = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 540,
    endMinute: 1080,
}));
const range = (startMinute: number, endMinute: number) => ({
    startMinute,
    endMinute,
});

describe("opening hours on Availability (DEC-087)", () => {
    it("finds the parts of a person's day outside opening hours", () => {
        expect(outsideOpening([range(480, 1200)], OPEN, 1)).toEqual([
            range(480, 540),
            range(1080, 1200),
        ]);
        expect(outsideOpening([range(600, 900)], OPEN, 1)).toEqual([]);
    });

    it("says which hours aren't bookable in person, and when it's open", () => {
        expect(openingNote([range(480, 1200)], OPEN, 1)).toBe(
            "08:00–09:00 and 18:00–20:00 aren't bookable in person — you're open 09:00–18:00.",
        );
        expect(openingNote([range(480, 600)], OPEN, 1)).toBe(
            "08:00–09:00 isn't bookable in person — you're open 09:00–18:00.",
        );
    });

    it("says a closed day is closed", () => {
        expect(openingNote([range(600, 900)], OPEN, 0)).toBe(
            "Not bookable in person — you're closed on Sundays.",
        );
        expect(whollyOutside(range(600, 900), OPEN, 0)).toBe(true);
        expect(whollyOutside(range(480, 1200), OPEN, 1)).toBe(false);
    });

    it("says nothing with no opening hours, inside them, or with no hours", () => {
        expect(openingNote([range(0, 1440)], null, 1)).toBeNull();
        expect(openingNote([range(540, 1080)], OPEN, 1)).toBeNull();
        expect(openingNote([], OPEN, 0)).toBeNull();
        expect(whollyOutside(range(0, 60), null, 1)).toBe(false);
    });

    it("puts two shops' hours together: open when either is", () => {
        const two = [
            { dayOfWeek: 1, startMinute: 540, endMinute: 780 },
            { dayOfWeek: 1, startMinute: 720, endMinute: 1080 },
        ];
        expect(openOn(two, 1)).toEqual([range(540, 1080)]);
        expect(outsideOpening([range(540, 1080)], two, 1)).toEqual([]);
    });
});
