import { describe, expect, it } from "vitest";

import {
    addDays,
    DEFAULT_PAUSE,
    localDay,
    pauseAgain,
    pauseNote,
    pauseOptions,
} from "./pause";

// 19 Sep, 10:00 in Kolkata — the design's "today".
const NOW = new Date("2026-09-19T04:30:00Z");
const SUB = {
    timezone: "Asia/Kolkata",
    contact: { id: "c1", name: "Meera Iyer", email: "meera@example.in" },
    // Paid up to 16 Oct, Kolkata midnight.
    currentPeriodEnd: "2026-10-15T18:30:00.000Z",
};

describe("pause lengths (D8)", () => {
    it("offers 2, 4 and 8 weeks with the day each restarts, then Until I resume", () => {
        expect(pauseOptions(SUB, NOW)).toEqual([
            {
                key: "2",
                label: "2 weeks · until 3 Oct",
                choice: { weeks: 2 },
                until: "2026-10-03",
            },
            {
                key: "4",
                label: "4 weeks · until 17 Oct",
                choice: { weeks: 4 },
                until: "2026-10-17",
            },
            {
                key: "8",
                label: "8 weeks · until 14 Nov",
                choice: { weeks: 8 },
                until: "2026-11-14",
            },
            {
                key: "open",
                label: "Until I resume",
                choice: { until: null },
                until: null,
            },
        ]);
        expect(DEFAULT_PAUSE).toBe("4");
    });

    it("counts from the subscription's today, not the browser's or UTC's", () => {
        // 19 Sep 20:00 UTC is already 20 Sep in Kolkata.
        const late = new Date("2026-09-19T20:00:00Z");
        expect(pauseOptions(SUB, late)[0].until).toBe("2026-10-04");
        expect(pauseOptions({ timezone: "UTC" }, late)[0].until).toBe(
            "2026-10-03",
        );
    });

    it("says what happens under the choice", () => {
        const [two, , , open] = pauseOptions(SUB, NOW);
        expect(pauseNote(two, SUB, NOW)).toBe(
            "Nothing is charged or collected until 3 Oct. It restarts on its own. The days it's paused are added to the period Meera has paid for.",
        );
        expect(pauseNote(open, SUB, NOW)).toBe(
            "Nothing is charged or collected until you resume it. Resume before 16 Oct and the days it's paused are added to the period Meera has paid for; later, a new period starts with its invoice.",
        );
    });

    it("doesn't promise the days back when the pause outlasts the paid period (review S-1)", () => {
        const [, four] = pauseOptions(SUB, NOW);
        // 17 Oct is after the period's end on 16 Oct.
        expect(pauseNote(four, SUB, NOW)).toBe(
            "Nothing is charged or collected until 17 Oct. Meera has paid up to 16 Oct, so on 17 Oct it restarts with a new period and its invoice.",
        );
        // Ending the day the period does still adds the days, as the API decides.
        expect(
            pauseNote(
                {
                    key: "day",
                    label: "",
                    until: "2026-10-16",
                    choice: { until: "2026-10-16" },
                },
                SUB,
                NOW,
            ),
        ).toMatch(/until 16 Oct\. It restarts on its own\. The days/);
    });

    it("puts the same pause back when a resume is undone", () => {
        expect(
            pauseAgain(
                {
                    timezone: "Asia/Kolkata",
                    pausedUntil: "2026-10-16T18:30:00Z",
                },
                NOW,
            ),
        ).toEqual({ until: "2026-10-17" });
        expect(
            pauseAgain({ timezone: "Asia/Kolkata", pausedUntil: null }, NOW),
        ).toEqual({ until: null });
        // A day already here can't be paused to: until resumed instead.
        expect(
            pauseAgain(
                {
                    timezone: "Asia/Kolkata",
                    pausedUntil: "2026-09-18T18:30:00Z",
                },
                NOW,
            ),
        ).toEqual({ until: null });
    });

    it("steps calendar days across a month end", () => {
        expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
        expect(localDay(NOW, "America/Los_Angeles")).toBe("2026-09-18");
    });
});
