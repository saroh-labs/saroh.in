import {
    firstOverlap,
    formatMinute,
    isCalendarDate,
    weeklyHoursRefusal,
    weeklyMinutes,
    wholeDays,
} from "./hours";

describe("a person's weekly hours (U3)", () => {
    it("accepts separate and touching ranges", () => {
        expect(
            weeklyHoursRefusal([
                { dayOfWeek: 1, startMinute: 360, endMinute: 720 },
                { dayOfWeek: 1, startMinute: 720, endMinute: 900 },
                { dayOfWeek: 2, startMinute: 360, endMinute: 720 },
            ]),
        ).toBeNull();
    });

    it("refuses overlapping ranges on one day, naming the day and the field", () => {
        expect(
            weeklyHoursRefusal([
                { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
                { dayOfWeek: 1, startMinute: 660, endMinute: 780 },
            ]),
        ).toEqual({
            message: "Monday's hours overlap: 9:00–12:00 and 11:00–13:00.",
            field: "hours",
        });
    });

    it("refuses a range that ends before it starts", () => {
        expect(
            weeklyHoursRefusal([
                { dayOfWeek: 3, startMinute: 720, endMinute: 540 },
            ]),
        ).toEqual({
            message:
                "Wednesday: the end (9:00) must be after the start (12:00).",
            field: "hours",
        });
    });

    it("refuses a day outside the week and a range past midnight", () => {
        expect(
            weeklyHoursRefusal([
                { dayOfWeek: 7, startMinute: 0, endMinute: 60 },
            ])?.field,
        ).toBe("hours");
        expect(
            weeklyHoursRefusal([
                { dayOfWeek: 1, startMinute: 1380, endMinute: 1500 },
            ])?.message,
        ).toMatch(/within the day/);
    });

    it("adds up the week", () => {
        expect(
            weeklyMinutes([
                { startMinute: 360, endMinute: 720 },
                { startMinute: 780, endMinute: 1020 },
            ]),
        ).toBe(600);
    });

    it("formats minutes as a clock", () => {
        expect(formatMinute(0)).toBe("0:00");
        expect(formatMinute(545)).toBe("9:05");
        expect(formatMinute(1440)).toBe("24:00");
    });

    it("finds the first overlap regardless of order", () => {
        const a = { startMinute: 600, endMinute: 700 };
        const b = { startMinute: 500, endMinute: 650 };
        expect(firstOverlap([a, b])).toEqual([b, a]);
    });
});

describe("time off by whole days", () => {
    it("runs from local midnight of the first day to midnight after the last", () => {
        const { startAt, endAt } = wholeDays(
            "2026-10-05",
            "2026-10-06",
            "Asia/Kolkata",
        );
        expect(startAt.toISOString()).toBe("2026-10-04T18:30:00.000Z");
        expect(endAt.toISOString()).toBe("2026-10-06T18:30:00.000Z");
    });

    it("knows a real date from a malformed one", () => {
        expect(isCalendarDate("2026-02-28")).toBe(true);
        expect(isCalendarDate("2026-02-30")).toBe(false);
        expect(isCalendarDate("28-02-2026")).toBe(false);
    });
});
