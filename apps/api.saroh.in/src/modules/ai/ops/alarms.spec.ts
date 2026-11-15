import { failuresAlarming } from "./failure-alarm.job";
import { spendLevel, spendMonth } from "./spend-alarm.job";

// Made-up test units, never Saroh's forecast.
const limits = { forecastMicroUsd: 1_000, warnRatio: 0.8, haltRatio: 1.2 };

describe("spendLevel", () => {
    it.each([
        [0, "under"],
        [799, "under"],
        [800, "warn"],
        [1_199, "warn"],
        [1_200, "halt"],
        [50_000, "halt"],
    ] as const)("%d spent is %s", (spent, level) => {
        expect(spendLevel(spent, limits)).toBe(level);
    });

    it("nothing spent is under, even with a forecast of nothing", () => {
        expect(spendLevel(0, { ...limits, forecastMicroUsd: 0 })).toBe("under");
        expect(spendLevel(1, { ...limits, forecastMicroUsd: 0 })).toBe("halt");
    });
});

describe("spendMonth", () => {
    it("is the UTC month, keyed by it", () => {
        const m = spendMonth(new Date("2026-11-30T23:59:59Z"));
        expect(m).toEqual({
            start: new Date("2026-11-01T00:00:00Z"),
            key: "2026-11",
        });
        expect(spendMonth(new Date("2026-12-01T00:00:00Z")).key).toBe(
            "2026-12",
        );
    });
});

describe("failuresAlarming", () => {
    it("is above the share, not at it", () => {
        expect(failuresAlarming(10, 2, 0.2, 5)).toBe(false);
        expect(failuresAlarming(10, 3, 0.2, 5)).toBe(true);
    });

    it("needs the minimum number of finished turns", () => {
        expect(failuresAlarming(4, 4, 0.2, 5)).toBe(false);
        expect(failuresAlarming(5, 4, 0.2, 5)).toBe(true);
    });

    it("never with nothing finished", () => {
        expect(failuresAlarming(0, 0, 0.1, 0)).toBe(false);
    });
});
