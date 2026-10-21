/**
 * Insights' one period (DEC-171): 7 days, 4 weeks and 3 months, each
 * ending today in the business's zone and compared with the same number of
 * days before; the weekly bars rolling back from today, each window's bars
 * holding exactly its days.
 */
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { goingWindows } from "../home/home-going";
import { InsightsPeriodQueryDto } from "./dto";
import {
    dayIn,
    daysBetween,
    DEFAULT_PERIOD,
    isInsightsPeriod,
    MONEY_BARS,
    moneyBuckets,
    periodWindows,
} from "./period";

const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai.
const MONDAY = new Date("2026-10-19T03:30:00.000Z");
// Sunday 18 Oct 2026, 23:50 in Mumbai — still Sunday 18:20 in UTC.
const SUNDAY = new Date("2026-10-18T18:20:00.000Z");

describe("Insights period", () => {
    it("ends the period before at the same time of day as now, on the day today stands for", () => {
        // Monday 09:00 in Mumbai: the 7 before end at 09:00 on Monday 12
        // Oct, never at midnight after it.
        const w = periodWindows("7d", MONDAY, ZONE);
        expect(w.beforeLastStart.toISOString()).toBe(
            "2026-10-11T18:30:00.000Z",
        );
        expect(w.beforeSoFar.toISOString()).toBe("2026-10-12T03:30:00.000Z");
        // 4 weeks: 28 days back, the same time of day.
        const four = periodWindows("4w", MONDAY, ZONE);
        expect(four.beforeToDate).toBe("2026-09-21");
        expect(four.beforeSoFar.toISOString()).toBe("2026-09-21T03:30:00.000Z");
        expect(goingWindows(MONDAY, ZONE).beforeSoFar.toISOString()).toBe(
            "2026-10-12T03:30:00.000Z",
        );
    });

    it("opens on 4 weeks and knows only its three periods", () => {
        expect(DEFAULT_PERIOD).toBe("4w");
        expect(isInsightsPeriod("7d")).toBe(true);
        expect(isInsightsPeriod("3m")).toBe(true);
        expect(isInsightsPeriod("30d")).toBe(false);
        expect(isInsightsPeriod(undefined)).toBe(false);
    });

    it("7 days on a Monday: Tuesday to today, against the 7 before", () => {
        const w = periodWindows("7d", MONDAY, ZONE);
        expect(w).toMatchObject({
            days: 7,
            fromDate: "2026-10-13",
            toDate: "2026-10-19",
            beforeFromDate: "2026-10-06",
            beforeToDate: "2026-10-12",
        });
        // Midnight in Mumbai, not UTC.
        expect(w.from.toISOString()).toBe("2026-10-12T18:30:00.000Z");
        expect(w.to.toISOString()).toBe("2026-10-19T18:30:00.000Z");
        expect(w.beforeFrom.toISOString()).toBe("2026-10-05T18:30:00.000Z");
    });

    it("7 days is exactly Home's How it's going", () => {
        for (const now of [MONDAY, SUNDAY]) {
            const w = periodWindows("7d", now, ZONE);
            const going = goingWindows(now, ZONE);
            expect(w.from).toEqual(going.from);
            expect(w.to).toEqual(going.to);
            expect(w.beforeFrom).toEqual(going.beforeFrom);
            expect(w.beforeToDate).toBe(going.beforeToDate);
            // Both compare so far: the 7 before end at the same time of day.
            expect(w.beforeSoFar).toEqual(going.beforeSoFar);
        }
    });

    it("7 days on a Sunday late at night is still Sunday's in the zone", () => {
        const w = periodWindows("7d", SUNDAY, ZONE);
        expect(w).toMatchObject({
            fromDate: "2026-10-12",
            toDate: "2026-10-18",
            beforeFromDate: "2026-10-05",
            beforeToDate: "2026-10-11",
        });
    });

    it("4 weeks on a Monday and on a Sunday: 28 days and the 28 before", () => {
        expect(periodWindows("4w", MONDAY, ZONE)).toMatchObject({
            days: 28,
            fromDate: "2026-09-22",
            toDate: "2026-10-19",
            beforeFromDate: "2026-08-25",
            beforeToDate: "2026-09-21",
        });
        expect(periodWindows("4w", SUNDAY, ZONE)).toMatchObject({
            days: 28,
            fromDate: "2026-09-21",
            toDate: "2026-10-18",
            beforeFromDate: "2026-08-24",
            beforeToDate: "2026-09-20",
        });
    });

    it("3 months crosses month ends, and the period before is the same length", () => {
        const w = periodWindows("3m", MONDAY, ZONE);
        // 20 Jul to 19 Oct: 12 + 31 + 30 + 19 = 92 days.
        expect(w).toMatchObject({
            days: 92,
            fromDate: "2026-07-20",
            toDate: "2026-10-19",
            beforeFromDate: "2026-04-19",
            beforeToDate: "2026-07-19",
        });
        expect(daysBetween(w.beforeFromDate, w.beforeToDate) + 1).toBe(92);

        // From the last day of a month: 1 Mar to 31 May, 92 days.
        const may = periodWindows(
            "3m",
            new Date("2026-05-31T06:30:00.000Z"),
            ZONE,
        );
        expect(may).toMatchObject({
            days: 92,
            fromDate: "2026-03-01",
            toDate: "2026-05-31",
            beforeToDate: "2026-02-28",
        });
    });

    it("a clock change inside the period does not lose a day", () => {
        // London goes back an hour on 25 Oct 2026.
        const w = periodWindows(
            "7d",
            new Date("2026-10-28T12:00:00.000Z"),
            "Europe/London",
        );
        expect(w).toMatchObject({
            days: 7,
            fromDate: "2026-10-22",
            toDate: "2026-10-28",
            beforeToDate: "2026-10-21",
        });
    });

    it("places a day in the period, the one before, or neither", () => {
        const w = periodWindows("7d", MONDAY, ZONE);
        expect(dayIn(w, "2026-10-13")).toBe("PERIOD");
        expect(dayIn(w, "2026-10-19")).toBe("PERIOD");
        expect(dayIn(w, "2026-10-12")).toBe("BEFORE");
        expect(dayIn(w, "2026-10-06")).toBe("BEFORE");
        expect(dayIn(w, "2026-10-05")).toBeNull();
    });

    it("draws 4 weeks as rolling weeks ending today, four against four", () => {
        const w = periodWindows("4w", MONDAY, ZONE);
        const bars = moneyBuckets(w);
        expect(bars).toHaveLength(MONEY_BARS);
        expect(bars.map((b) => b.in)).toEqual([
            ...Array(4).fill(null),
            ...Array(4).fill("BEFORE"),
            ...Array(4).fill("PERIOD"),
        ]);
        // Tuesday to Monday, never a calendar week reaching before 22 Sep.
        expect(bars.slice(8).map((b) => [b.startDate, b.endDate])).toEqual([
            ["2026-09-22", "2026-09-28"],
            ["2026-09-29", "2026-10-05"],
            ["2026-10-06", "2026-10-12"],
            ["2026-10-13", "2026-10-19"],
        ]);
        expect(bars[4].startDate).toBe(w.beforeFromDate);
        expect(bars[7].endDate).toBe(w.beforeToDate);
        expect(bars.every((b) => b.days === 7)).toBe(true);
    });

    it("draws 7 days as one bar against one, ten earlier weeks before them", () => {
        const w = periodWindows("7d", MONDAY, ZONE);
        const bars = moneyBuckets(w);
        expect(bars).toHaveLength(MONEY_BARS);
        expect(bars.at(-1)).toEqual({
            startDate: "2026-10-13",
            endDate: "2026-10-19",
            days: 7,
            in: "PERIOD",
        });
        expect(bars.at(-2)).toMatchObject({
            startDate: "2026-10-06",
            endDate: "2026-10-12",
            in: "BEFORE",
        });
        expect(bars.slice(0, 10).every((b) => b.in === null)).toBe(true);
    });

    it("draws 3 months as bars holding exactly each window's days", () => {
        for (const now of [MONDAY, SUNDAY, new Date("2026-03-01T06:00:00Z")]) {
            const w = periodWindows("3m", now, ZONE);
            const bars = moneyBuckets(w);
            for (const window of ["PERIOD", "BEFORE"] as const) {
                const mine = bars.filter((b) => b.in === window);
                const total = mine.reduce((sum, b) => sum + b.days, 0);
                expect(total).toBe(w.days);
                // Back to back, no day twice and none left out.
                for (let i = 1; i < mine.length; i += 1) {
                    expect(
                        daysBetween(mine[i - 1].endDate, mine[i].startDate),
                    ).toBe(1);
                }
                // Only the oldest bar is longer or shorter than a week.
                expect(mine.slice(1).every((b) => b.days === 7)).toBe(true);
            }
            const period = bars.filter((b) => b.in === "PERIOD");
            expect(period[0].startDate).toBe(w.fromDate);
            expect(period.at(-1)?.endDate).toBe(w.toDate);
            expect(bars.filter((b) => b.in === null)).toHaveLength(0);
        }
        // 20 Jul – 19 Oct is 92 days: twelve weeks and an 8-day first bar.
        const w = periodWindows("3m", MONDAY, ZONE);
        const first = moneyBuckets(w).find((b) => b.in === "PERIOD");
        expect(first).toMatchObject({
            startDate: "2026-07-20",
            endDate: "2026-07-27",
            days: 8,
        });
    });
});

describe("Insights period query", () => {
    const check = (query: Record<string, unknown>) =>
        validate(plainToInstance(InsightsPeriodQueryDto, query), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it("takes the three periods, or none", async () => {
        for (const period of ["7d", "4w", "3m"]) {
            expect(await check({ period })).toHaveLength(0);
        }
        expect(await check({})).toHaveLength(0);
    });

    it("refuses any other period, and anything else in the query", async () => {
        expect(await check({ period: "30d" })).toHaveLength(1);
        expect(await check({ period: "4w", from: "2026-01-01" })).toHaveLength(
            1,
        );
    });
});
