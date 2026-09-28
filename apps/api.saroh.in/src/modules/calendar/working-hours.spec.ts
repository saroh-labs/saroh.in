import { hoursOnDays } from "./working-hours";

/**
 * Working hours per day (plan 005 E27): a weekly stretch repeats on its
 * weekday, an extra one lands on its date, and whose goes only to a
 * caller who reads bookings.
 */

// Monday 14 to Sunday 20 September 2026.
const WEEK = [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
];

describe("hoursOnDays", () => {
    it("repeats a weekly stretch on each of its weekdays, in start order", () => {
        const hours = hoursOnDays(
            WEEK,
            [
                // Vikram, Monday and Wednesday evenings then mornings.
                {
                    staffId: "v",
                    dayOfWeek: 1,
                    startMinute: 1020,
                    endMinute: 1260,
                },
                {
                    staffId: "v",
                    dayOfWeek: 1,
                    startMinute: 360,
                    endMinute: 600,
                },
                {
                    staffId: "v",
                    dayOfWeek: 3,
                    startMinute: 360,
                    endMinute: 600,
                },
            ],
            [],
            true,
        );
        expect(hours).toEqual([
            {
                date: "2026-09-14",
                startMinute: 360,
                endMinute: 600,
                staffId: "v",
            },
            {
                date: "2026-09-14",
                startMinute: 1020,
                endMinute: 1260,
                staffId: "v",
            },
            {
                date: "2026-09-16",
                startMinute: 360,
                endMinute: 600,
                staffId: "v",
            },
        ]);
    });

    it("adds extra hours on their date only, and Sunday is weekday 0", () => {
        const hours = hoursOnDays(
            WEEK,
            [{ staffId: "p", dayOfWeek: 0, startMinute: 600, endMinute: 780 }],
            [
                {
                    staffId: "r",
                    date: "2026-09-20",
                    startMinute: 540,
                    endMinute: 600,
                },
            ],
            true,
        );
        expect(hours).toEqual([
            {
                date: "2026-09-20",
                startMinute: 540,
                endMinute: 600,
                staffId: "r",
            },
            {
                date: "2026-09-20",
                startMinute: 600,
                endMinute: 780,
                staffId: "p",
            },
        ]);
    });

    it("leaves out whose for a caller who does not read bookings", () => {
        const [only] = hoursOnDays(
            ["2026-09-14"],
            [{ staffId: "v", dayOfWeek: 1, startMinute: 360, endMinute: 600 }],
            [],
            false,
        );
        expect(only).toEqual({
            date: "2026-09-14",
            startMinute: 360,
            endMinute: 600,
        });
    });

    it("drops a stretch that does not run forwards", () => {
        expect(
            hoursOnDays(
                ["2026-09-14"],
                [
                    {
                        staffId: "v",
                        dayOfWeek: 1,
                        startMinute: 600,
                        endMinute: 600,
                    },
                ],
                [],
                true,
            ),
        ).toEqual([]);
    });
});
