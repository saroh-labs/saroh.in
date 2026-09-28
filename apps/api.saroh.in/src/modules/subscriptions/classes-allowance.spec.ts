import { allowanceData, classesAllowance } from "./classes-allowance";

/** D10: a subscription's own classes a month, and the one-release fallback. */
describe("a membership's classes a month (D10)", () => {
    const setAt = new Date("2026-10-01T00:00:00Z");

    it("reads the subscription's own number once it is set", () => {
        // The plan moved to 10; this period was taken at 8.
        expect(
            classesAllowance({
                classesPerPeriod: 8,
                classesPerPeriodSetAt: setAt,
                plan: { classesPerMonth: 10 },
            }),
        ).toBe(8);
    });

    it("reads a set null as no allowance, whatever the plan says now", () => {
        expect(
            classesAllowance({
                classesPerPeriod: null,
                classesPerPeriodSetAt: setAt,
                plan: { classesPerMonth: 8 },
            }),
        ).toBeNull();
    });

    it("reads the plan's number for a row the previous image wrote, never unlimited", () => {
        expect(
            classesAllowance({
                classesPerPeriod: null,
                classesPerPeriodSetAt: null,
                plan: { classesPerMonth: 8 },
            }),
        ).toBe(8);
        expect(
            classesAllowance({
                classesPerPeriod: null,
                classesPerPeriodSetAt: null,
                plan: { classesPerMonth: null },
            }),
        ).toBeNull();
    });

    it("writes the number with its stamp", () => {
        expect(allowanceData(10, setAt)).toEqual({
            classesPerPeriod: 10,
            classesPerPeriodSetAt: setAt,
        });
        expect(allowanceData(null, setAt)).toEqual({
            classesPerPeriod: null,
            classesPerPeriodSetAt: setAt,
        });
    });
});
