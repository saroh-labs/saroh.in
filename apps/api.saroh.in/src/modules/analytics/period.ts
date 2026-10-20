import { DateTime } from "luxon";

/**
 * Insights' one period for the page (DEC-171): the last 7 days, the last 4
 * weeks or the last 3 months, each against the same number of days just
 * before it. Pure.
 *
 * Rolling windows, never calendar weeks: a period ends today, by the
 * business's own calendar (DEC-033), and starts that many days back, so a
 * Monday never compares a week that just started with a whole one. "7
 * days" is today and the six before, exactly Home's "How it's going"
 * (`home/home-going.ts` `goingWindows`); "4 weeks" is 28 days; "3 months"
 * runs from the day after this date three months ago (20 Jul to 19 Oct),
 * and the period before it is the same number of days, so the two are
 * always the same length even across months of 30 and 31 days.
 *
 * The weekly bars are rolling too (`moneyBuckets`): seven days at a time
 * back from today, so the period's bars hold exactly the period's days and
 * add up to its money in, and the period before's likewise. A calendar
 * week straddling the period's first day would draw money from before it
 * as "now" (Northwind, 19 Oct).
 */

export const INSIGHTS_PERIODS = ["7d", "4w", "3m"] as const;
export type InsightsPeriod = (typeof INSIGHTS_PERIODS)[number];

/** Insights opens on the last 4 weeks (A10). */
export const DEFAULT_PERIOD: InsightsPeriod = "4w";

export function isInsightsPeriod(value: unknown): value is InsightsPeriod {
    return (
        typeof value === "string" &&
        (INSIGHTS_PERIODS as readonly string[]).includes(value)
    );
}

export interface PeriodWindows {
    period: InsightsPeriod;
    /** How many days the period, and the one before it, hold. */
    days: number;
    /** 00:00 on the period's first day, in the zone. */
    from: Date;
    /** 00:00 tomorrow: the period ends here. */
    to: Date;
    /** 00:00 on the first day of the period before; it ends at `from`. */
    beforeFrom: Date;
    /** The period's first and last days, `2026-09-22` to `2026-10-19`. */
    fromDate: string;
    toDate: string;
    /** The period before's first and last days. */
    beforeFromDate: string;
    beforeToDate: string;
}

function firstDay(today: DateTime, period: InsightsPeriod): DateTime {
    switch (period) {
        case "7d":
            return today.minus({ days: 6 });
        case "4w":
            return today.minus({ days: 27 });
        case "3m":
            return today.minus({ months: 3 }).plus({ days: 1 });
    }
}

/** The period around `now`, and the one before it, in `zone`'s calendar. */
export function periodWindows(
    period: InsightsPeriod,
    now: Date,
    zone: string,
): PeriodWindows {
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    const from = firstDay(today, period);
    // Counted on the calendar, so a clock change inside the period does not
    // make it a day short.
    const days =
        Math.round(
            DateTime.fromISO(today.toISODate() ?? "", { zone: "utc" }).diff(
                DateTime.fromISO(from.toISODate() ?? "", { zone: "utc" }),
                "days",
            ).days,
        ) + 1;
    const beforeFrom = from.minus({ days });
    return {
        period,
        days,
        from: from.toJSDate(),
        to: today.plus({ days: 1 }).toJSDate(),
        beforeFrom: beforeFrom.toJSDate(),
        fromDate: from.toISODate() ?? "",
        toDate: today.toISODate() ?? "",
        beforeFromDate: beforeFrom.toISODate() ?? "",
        beforeToDate: from.minus({ days: 1 }).toISODate() ?? "",
    };
}

/** Which window a date falls in, or null for neither. */
export function dayIn(
    w: Pick<
        PeriodWindows,
        "fromDate" | "toDate" | "beforeFromDate" | "beforeToDate"
    >,
    day: string,
): "PERIOD" | "BEFORE" | null {
    if (day >= w.fromDate && day <= w.toDate) return "PERIOD";
    if (day >= w.beforeFromDate && day <= w.beforeToDate) return "BEFORE";
    return null;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`), by the calendar. */
export function daysBetween(from: string, to: string): number {
    return Math.round(
        DateTime.fromISO(to, { zone: "utc" }).diff(
            DateTime.fromISO(from, { zone: "utc" }),
            "days",
        ).days,
    );
}

/** One bar of Money's chart: a run of days, and the window it is part of. */
export interface MoneyBucket {
    /** Its first and last days, `2026-10-13` to `2026-10-19`. */
    startDate: string;
    endDate: string;
    /** 7, but the oldest bar of a 3-month window holds what's left over. */
    days: number;
    in: "PERIOD" | "BEFORE" | null;
}

/** The fewest bars Money's chart draws. */
export const MONEY_BARS = 12;

function utcDay(date: string): DateTime {
    return DateTime.fromISO(date, { zone: "utc" });
}

/**
 * `count` bars ending on `last`, oldest first, covering `days` days
 * exactly: every bar is seven days but the oldest, which holds the rest.
 */
function barsEnding(
    last: string,
    days: number,
    count: number,
    window: MoneyBucket["in"],
): MoneyBucket[] {
    const out: MoneyBucket[] = [];
    let end = utcDay(last);
    for (let i = 0; i < count; i += 1) {
        const length = i === count - 1 ? days - 7 * (count - 1) : 7;
        const start = end.minus({ days: length - 1 });
        out.unshift({
            startDate: start.toISODate() ?? "",
            endDate: end.toISODate() ?? "",
            days: length,
            in: window,
        });
        end = start.minus({ days: 1 });
    }
    return out;
}

/**
 * Money's weekly bars (DEC-171), oldest first: rolling weeks ending today,
 * the period's bars covering exactly its days, then the period before's
 * covering exactly its days, then earlier whole weeks until there are
 * {@link MONEY_BARS}. 7 days is one bar against one; 4 weeks four against
 * four; 3 months about thirteen against thirteen, the oldest of each
 * holding the days over whole weeks (89 to 92 days: 5 to 8 days).
 */
export function moneyBuckets(
    w: Pick<
        PeriodWindows,
        "days" | "fromDate" | "toDate" | "beforeFromDate" | "beforeToDate"
    >,
): MoneyBucket[] {
    const perWindow = Math.max(1, Math.round(w.days / 7));
    const period = barsEnding(w.toDate, w.days, perWindow, "PERIOD");
    const before = barsEnding(w.beforeToDate, w.days, perWindow, "BEFORE");
    const earlierCount = Math.max(0, MONEY_BARS - 2 * perWindow);
    const earlier =
        earlierCount > 0
            ? barsEnding(
                  utcDay(w.beforeFromDate).minus({ days: 1 }).toISODate() ?? "",
                  7 * earlierCount,
                  earlierCount,
                  null,
              )
            : [];
    return [...earlier, ...before, ...period];
}
