import { describe, expect, it } from "vitest";

import type { Block } from "@/lib/services/diary";

import {
    bookingsIn,
    closedRun,
    lengthLabel,
    onTheDay,
    openLengths,
    openStart,
    withoutRange,
} from "./open-hours-words";

/** Meera's Monday: 9 to 1, lunch, 3 to 7. */
const WINDOWS = [
    [540, 780],
    [900, 1140],
] as const;

const booking = (start: number, end: number, name: string): Block =>
    ({
        kind: "one",
        key: `one:${name}`,
        start,
        end,
        state: "confirmed",
        staffId: "meera",
        booking: { bookerName: name, contact: null, bookerEmail: null },
    }) as unknown as Block;

const labels = (choices: { label: string }[]) => choices.map((c) => c.label);

describe("how long a choice runs", () => {
    it("says minutes, hours, and both", () => {
        expect(lengthLabel(30)).toBe("30 min");
        expect(lengthLabel(60)).toBe("1 hour");
        expect(lengthLabel(120)).toBe("2 hours");
        expect(lengthLabel(75)).toBe("1 hr 15 min");
    });
});

describe("opening closed time", () => {
    it("offers all of a lunch break first, then shorter", () => {
        const choices = openLengths(780, WINDOWS);
        expect(labels(choices)).toEqual([
            "All the closed time · 2 hours",
            "1 hour",
            "30 min",
        ]);
        expect(openStart(choices)).toBe(120);
    });

    it("says until when, pressed part way into the closed time", () => {
        expect(labels(openLengths(810, WINDOWS))[0]).toBe(
            "Until 3:00 pm · 1 hr 30 min",
        );
        // The hour before opening, as the keyboard picks it.
        expect(labels(openLengths(480, WINDOWS))).toEqual([
            "Until 9:00 am · 1 hour",
            "30 min",
        ]);
    });

    it("offers one to four hours on a long evening, from 2 hours", () => {
        const choices = openLengths(1140, WINDOWS);
        expect(labels(choices)).toEqual([
            "1 hour",
            "2 hours",
            "3 hours",
            "4 hours",
        ]);
        expect(openStart(choices)).toBe(120);
    });

    it("never runs past midnight", () => {
        expect(labels(openLengths(1320, []))).toEqual(["1 hour", "2 hours"]);
        expect(labels(openLengths(1410, []))).toEqual(["30 min"]);
    });

    it("has no room inside working hours", () => {
        expect(closedRun(600, WINDOWS).room).toBe(0);
        expect(closedRun(780, WINDOWS)).toEqual({
            room: 120,
            end: 900,
            whole: true,
        });
    });
});

describe("bookings already in closed time", () => {
    const blocks = [booking(1170, 1200, "Kabir")];

    it("names them plainly", () => {
        expect(bookingsIn(blocks, 1140, 1260)).toBe(
            "Kabir at 7:30 pm is already booked in this time.",
        );
        expect(
            bookingsIn([...blocks, booking(1230, 1260, "Ira")], 1140, 1320),
        ).toBe(
            "2 bookings are already in this time: Kabir at 7:30 pm, Ira at 8:30 pm.",
        );
        expect(bookingsIn(blocks, 1140, 1170)).toBeNull();
    });
});

describe("the toast's day", () => {
    it("says today, or the day", () => {
        expect(onTheDay("2026-10-19", "2026-10-19")).toBe(", today.");
        expect(onTheDay("2026-10-20", "2026-10-19")).toBe(" on Tue 20 Oct.");
    });
});

describe("withoutRange", () => {
    const r = (d: number, a: number, b: number) => ({
        dayOfWeek: d,
        startMinute: a,
        endMinute: b,
    });
    it("takes out only the range added, on its weekday", () => {
        expect(
            withoutRange(
                [r(1, 540, 720), r(2, 540, 720), r(2, 900, 1020)],
                2,
                900,
                1020,
            ),
        ).toEqual([r(1, 540, 720), r(2, 540, 720)]);
    });
    it("cuts it out of a range the API joined it to", () => {
        expect(withoutRange([r(2, 540, 1020)], 2, 720, 840)).toEqual([
            r(2, 540, 720),
            r(2, 840, 1020),
        ]);
    });
});
