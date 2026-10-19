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
 * The twelve weekly bars stay whole Monday-to-Sunday weeks (they are a
 * picture, not a comparison); `weekIn` says which of them the period and
 * the one before mostly cover, so the screen can draw "now" dark and
 * "before" light.
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

/**
 * Which window a whole week (Monday `start`) mostly falls in: four of its
 * seven days or more. A week split three and four goes with the four; a
 * week mostly outside both is neither.
 */
export function weekIn(
    w: Pick<
        PeriodWindows,
        "fromDate" | "toDate" | "beforeFromDate" | "beforeToDate"
    >,
    start: string,
): "PERIOD" | "BEFORE" | null {
    let period = 0;
    let before = 0;
    const monday = DateTime.fromISO(start, { zone: "utc" });
    for (let i = 0; i < 7; i += 1) {
        const at = dayIn(w, monday.plus({ days: i }).toISODate() ?? "");
        if (at === "PERIOD") period += 1;
        else if (at === "BEFORE") before += 1;
    }
    if (period >= 4) return "PERIOD";
    if (before >= 4) return "BEFORE";
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
