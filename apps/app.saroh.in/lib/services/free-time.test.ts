import { describe, expect, it } from "vitest";

import {
    blockLengthLabel,
    blockLengths,
    extraHoursAt,
    freeLine,
    gapDay,
    lengthWords,
    serviceFit,
} from "./free-time";

/** The free-time sheet's words (U9, BKMNewFromGap). */
describe("a free time", () => {
    const gap = [960, 1020] as const;

    it("says a service fits and when it ends", () => {
        expect(
            serviceFit(
                { durationMinutes: 45, bookableByTeam: true },
                [...gap],
                960,
            ),
        ).toEqual({ at: 960, note: "45 min · fits, ends 4:45 pm", off: false });
    });

    it("says when one fits only from later in the gap", () => {
        expect(
            serviceFit(
                { durationMinutes: 30, bookableByTeam: true },
                [...gap],
                975,
            ).note,
        ).toBe("30 min · fits from 4:15 pm, ends 4:45 pm");
    });

    it("greys one that is too long, or can't start, or the team can't book", () => {
        expect(
            serviceFit(
                { durationMinutes: 90, bookableByTeam: true },
                [...gap],
                null,
            ),
        ).toEqual({
            at: null,
            note: "90 min · too long for this 60 min gap",
            off: true,
        });
        expect(
            serviceFit(
                { durationMinutes: 30, bookableByTeam: true },
                [...gap],
                null,
            ).note,
        ).toBe("30 min · can’t start in this free time");
        expect(
            serviceFit(
                { durationMinutes: 30, bookableByTeam: false },
                [...gap],
                960,
            ),
        ).toMatchObject({ off: true, at: null });
    });

    it("waits for the starts before saying it fits", () => {
        expect(
            serviceFit(
                { durationMinutes: 30, bookableByTeam: true },
                [...gap],
                undefined,
            ),
        ).toEqual({ at: null, note: "30 min", off: false });
    });

    it("offers the whole gap first, then shorter blocks", () => {
        expect(blockLengths(60)).toEqual([60, 30]);
        expect(blockLengths(180)).toEqual([180, 120, 60, 30]);
        expect(blockLengthLabel(60, true)).toBe("The whole gap · 1 hour");
        expect(blockLengthLabel(30, false)).toBe("30 min");
    });

    it("says how long and until when, and the day in words", () => {
        expect(lengthWords(180)).toBe("3 hours");
        expect(lengthWords(90)).toBe("90 min");
        expect(freeLine([960, 1020], false)).toBe(
            "Free until 5:00 pm · 1 hour",
        );
        expect(freeLine([840, 1020], true)).toBe(
            "Free until 5:00 pm · 3 hours, in extra hours",
        );
        expect(gapDay("2026-10-19", "2026-10-19")).toBe("today");
        expect(gapDay("2026-10-20", "2026-10-19")).toBe("tomorrow");
        expect(gapDay("2026-10-22", "2026-10-19")).toBe("Thu 22 Oct");
    });

    it("finds the extra hours a time is in", () => {
        const staff = {
            extraHours: [
                {
                    id: "x",
                    date: "2026-10-24T00:00:00.000Z",
                    startMinute: 840,
                    endMinute: 1020,
                },
            ],
        };
        expect(extraHoursAt(staff, "2026-10-24", 840)?.id).toBe("x");
        expect(extraHoursAt(staff, "2026-10-24", 1020)).toBeNull();
        expect(extraHoursAt(staff, "2026-10-25", 900)).toBeNull();
    });
});
