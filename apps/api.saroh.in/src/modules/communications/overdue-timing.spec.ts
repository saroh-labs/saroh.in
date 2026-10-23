// DEC-178, #1169: when overdue reminders go, as the business chooses it.
import {
    DEFAULT_OVERDUE_TIMING,
    hourWords,
    isDefaultTiming,
    overdueSays,
    overdueTiming,
    overdueTimingProblem,
} from "./overdue-timing";

describe("overdue reminder timing (pure)", () => {
    it("defaults to days 3 and 10, from 9 am to 8 pm, as before the choice", () => {
        expect(DEFAULT_OVERDUE_TIMING).toEqual({
            firstDay: 3,
            secondDay: 10,
            fromHour: 9,
            untilHour: 20,
        });
        expect(isDefaultTiming({ ...DEFAULT_OVERDUE_TIMING })).toBe(true);
        expect(
            isDefaultTiming({ ...DEFAULT_OVERDUE_TIMING, firstDay: 4 }),
        ).toBe(false);
    });

    it.each([
        [{ firstDay: 1, secondDay: 2, fromHour: 0, untilHour: 24 }, null],
        [{ firstDay: 30, secondDay: 60, fromHour: 23, untilHour: 24 }, null],
        [{ firstDay: 0, secondDay: 10, fromHour: 9, untilHour: 20 }, "first"],
        [{ firstDay: 31, secondDay: 40, fromHour: 9, untilHour: 20 }, "first"],
        [{ firstDay: 3, secondDay: 3, fromHour: 9, untilHour: 20 }, "second"],
        [{ firstDay: 5, secondDay: 4, fromHour: 9, untilHour: 20 }, "second"],
        [{ firstDay: 3, secondDay: 61, fromHour: 9, untilHour: 20 }, "second"],
        [{ firstDay: 3, secondDay: 10, fromHour: 20, untilHour: 20 }, "hours"],
        [{ firstDay: 3, secondDay: 10, fromHour: 21, untilHour: 8 }, "hours"],
        [{ firstDay: 3, secondDay: 10, fromHour: -1, untilHour: 8 }, "hours"],
        [{ firstDay: 3, secondDay: 10, fromHour: 9, untilHour: 25 }, "hours"],
        [{ firstDay: 3.5, secondDay: 10, fromHour: 9, untilHour: 20 }, "first"],
    ])("%j → %p", (t, which) => {
        const problem = overdueTimingProblem(t);
        if (which === null) expect(problem).toBeNull();
        else if (which === "first") expect(problem).toMatch(/^The first/);
        else if (which === "second") expect(problem).toMatch(/^The second/);
        else expect(problem).toMatch(/^Reminders stop/);
    });

    it.each([
        [0, "midnight"],
        [1, "1 am"],
        [9, "9 am"],
        [12, "noon"],
        [13, "1 pm"],
        [20, "8 pm"],
        [24, "midnight"],
    ])("hour %i is said %p", (hour, words) => {
        expect(hourWords(hour)).toBe(words);
    });

    it("the switch's sentence says the business's days and hours", () => {
        expect(
            overdueSays({
                firstDay: 1,
                secondDay: 7,
                fromHour: 8,
                untilHour: 12,
            }),
        ).toBe(
            "Up to 2 reminders for an unpaid invoice, 1 and 7 days after it's due, from 8 am to noon your time.",
        );
    });

    it("reads the business's row, else the defaults", async () => {
        const findUnique = jest.fn().mockResolvedValueOnce(null);
        const tx = { overdueReminderTiming: { findUnique } } as never;
        expect(await overdueTiming(tx, "org_1")).toEqual(
            DEFAULT_OVERDUE_TIMING,
        );
        const mine = { firstDay: 2, secondDay: 5, fromHour: 7, untilHour: 22 };
        findUnique.mockResolvedValueOnce(mine);
        expect(await overdueTiming(tx, "org_1")).toEqual(mine);
        expect(findUnique).toHaveBeenLastCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );
    });
});
