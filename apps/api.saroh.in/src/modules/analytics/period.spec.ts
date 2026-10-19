/**
 * Insights' one period (DEC-171): 7 days, 4 weeks and 3 months, each
 * ending today in the business's zone and compared with the same number of
 * days before; the weekly bars marked by the window they mostly fall in.
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
    periodWindows,
    weekIn,
} from "./period";

const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai.
const MONDAY = new Date("2026-10-19T03:30:00.000Z");
// Sunday 18 Oct 2026, 23:50 in Mumbai — still Sunday 18:20 in UTC.
const SUNDAY = new Date("2026-10-18T18:20:00.000Z");

describe("Insights period", () => {
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

    it("marks a whole week by the window holding four of its days or more", () => {
        const w = periodWindows("4w", MONDAY, ZONE);
        // 22 Sep – 19 Oct now; 25 Aug – 21 Sep before.
        expect(weekIn(w, "2026-10-12")).toBe("PERIOD");
        // Six of 21–27 Sep are now (the 21st is before).
        expect(weekIn(w, "2026-09-21")).toBe("PERIOD");
        expect(weekIn(w, "2026-09-14")).toBe("BEFORE");
        // Six of 24–30 Aug are before.
        expect(weekIn(w, "2026-08-24")).toBe("BEFORE");
        expect(weekIn(w, "2026-08-17")).toBeNull();

        // 7 days on a Monday: no whole week is mostly now.
        const seven = periodWindows("7d", MONDAY, ZONE);
        expect(weekIn(seven, "2026-10-12")).toBe("PERIOD");
        expect(weekIn(seven, "2026-10-05")).toBe("BEFORE");
        expect(weekIn(seven, "2026-09-28")).toBeNull();
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
