import { structuredLogger } from "../../common/logging/structured-logger";
import {
    ALLOWANCE_UNSET_EVENT,
    allowanceData,
    classesAllowance,
} from "./classes-allowance";

/** D10: a subscription's own classes a month; Z1: no fallback, only a loud guard. */
describe("a membership's classes a month (D10, Z1)", () => {
    const setAt = new Date("2026-10-01T00:00:00Z");
    let logged: jest.SpyInstance;

    beforeEach(() => {
        logged = jest
            .spyOn(structuredLogger, "error")
            .mockImplementation(() => undefined);
    });
    afterEach(() => logged.mockRestore());

    it("reads the subscription's own number once it is set", () => {
        // The plan moved to 10; this period was taken at 8.
        expect(
            classesAllowance({
                id: "sub_1",
                classesPerPeriod: 8,
                classesPerPeriodSetAt: setAt,
                plan: { classesPerMonth: 10 },
            }),
        ).toBe(8);
        expect(logged).not.toHaveBeenCalled();
    });

    it("reads a set null as no allowance, whatever the plan says now", () => {
        expect(
            classesAllowance({
                id: "sub_1",
                classesPerPeriod: null,
                classesPerPeriodSetAt: setAt,
                plan: { classesPerMonth: 8 },
            }),
        ).toBeNull();
        expect(logged).not.toHaveBeenCalled();
    });

    it("logs an unset row by name and serves the plan's number, never unlimited", () => {
        expect(
            classesAllowance({
                id: "sub_old",
                classesPerPeriod: null,
                classesPerPeriodSetAt: null,
                plan: { classesPerMonth: 8 },
            }),
        ).toBe(8);
        expect(logged).toHaveBeenCalledTimes(1);
        expect(logged).toHaveBeenCalledWith(
            ALLOWANCE_UNSET_EVENT,
            expect.objectContaining({ subscriptionId: "sub_old" }),
        );
        expect(ALLOWANCE_UNSET_EVENT).toBe("subscription_allowance_unset");
    });

    it("logs an unset row even when its plan includes no number", () => {
        expect(
            classesAllowance({
                id: "sub_old",
                classesPerPeriod: null,
                classesPerPeriodSetAt: null,
                plan: { classesPerMonth: null },
            }),
        ).toBeNull();
        expect(logged).toHaveBeenCalledTimes(1);
    });

    it("ignores a stray value on an unset row", () => {
        // Only the stamp makes the row's own value authoritative.
        expect(
            classesAllowance({
                id: "sub_old",
                classesPerPeriod: 99,
                classesPerPeriodSetAt: null,
                plan: { classesPerMonth: 8 },
            }),
        ).toBe(8);
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
