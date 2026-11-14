import type { RangePeriod } from "@saroh/api-contract";
import { RANGE_MAX_DAYS } from "@saroh/api-contract";
import { DateTime } from "luxon";

import { ToolError } from "../tool-registry";

/**
 * The period summaries' one window (14 Nov): a named period or a span of
 * days, in the business's calendar, with the equal period just before it.
 *
 * - today, this week (Monday on), this month, this year: the whole unit,
 *   as get_business_summary reads them, so coming bookings count.
 * - last week, last month: the whole unit before.
 * - last 3 or 6 months: rolling, ending today, as Insights' "3 months":
 *   from the day after this date 3 months ago.
 * - from/to: those days; to defaults to today; at most a year.
 *
 * The period before is the same unit one back (October for November), or
 * the same number of days before a rolling or chosen span, and is cut to
 * as many days as the period has had so far, so half a month is never
 * set against a whole one.
 */
export interface Span {
    period: string;
    zone: string;
    /** [from, to): 00:00 on the first day to 00:00 after the last. */
    from: Date;
    to: Date;
    firstDay: string;
    lastDay: string;
    days: number;
    before: { from: Date; to: Date; firstDay: string; lastDay: string };
    /** Bars: days up to a fortnight, weeks up to two months, else months. */
    by: "day" | "week" | "month";
    /** "1 Nov to 30 Nov 2026". */
    words: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(value: string, field: string, zone: string): DateTime {
    const at = DAY.test(value)
        ? DateTime.fromISO(value, { zone })
        : DateTime.invalid("format");
    if (!at.isValid) {
        throw new ToolError(
            `${field}: not a day.`,
            "Send a day as YYYY-MM-DD, like 2026-08-01.",
        );
    }
    return at.startOf("day");
}

const calendarDays = (a: DateTime, b: DateTime) =>
    Math.round(
        DateTime.fromISO(b.toISODate() ?? "", { zone: "utc" }).diff(
            DateTime.fromISO(a.toISODate() ?? "", { zone: "utc" }),
            "days",
        ).days,
    );

export function resolveSpan(
    input: { period?: RangePeriod; from?: string; to?: string },
    now: Date,
    zone: string,
    fallback: RangePeriod = "this_month",
): Span {
    const at = DateTime.fromJSDate(now, { zone });
    const today = at.startOf("day");
    let from: DateTime;
    let end: DateTime;
    let back: { weeks?: number; months?: number; years?: number } | null = null;
    let period: string;
    if (input.from || input.to) {
        if (!input.from) {
            throw new ToolError(
                "to: needs from.",
                "Send from as well, or a period instead.",
            );
        }
        from = dayOf(input.from, "from", zone);
        end = (input.to ? dayOf(input.to, "to", zone) : today).plus({
            days: 1,
        });
        if (end <= from) {
            throw new ToolError(
                "to is before from.",
                "Send from as the first day and to as the last.",
            );
        }
        if (calendarDays(from, end) > RANGE_MAX_DAYS) {
            throw new ToolError(
                "That span is longer than a year.",
                "Ask for a year or less, like period this_year or last_6_months.",
            );
        }
        period = "custom";
    } else {
        period = input.period ?? fallback;
        const week = today.startOf("week");
        const month = today.startOf("month");
        switch (period as RangePeriod) {
            case "today":
                [from, end] = [today, today.plus({ days: 1 })];
                break;
            case "this_week":
                [from, end, back] = [
                    week,
                    week.plus({ weeks: 1 }),
                    { weeks: 1 },
                ];
                break;
            case "last_week":
                [from, end, back] = [
                    week.minus({ weeks: 1 }),
                    week,
                    { weeks: 1 },
                ];
                break;
            case "this_month":
                [from, end, back] = [
                    month,
                    month.plus({ months: 1 }),
                    { months: 1 },
                ];
                break;
            case "last_month":
                [from, end, back] = [
                    month.minus({ months: 1 }),
                    month,
                    { months: 1 },
                ];
                break;
            case "last_3_months":
                [from, end] = [
                    today.minus({ months: 3 }).plus({ days: 1 }),
                    today.plus({ days: 1 }),
                ];
                break;
            case "last_6_months":
                [from, end] = [
                    today.minus({ months: 6 }).plus({ days: 1 }),
                    today.plus({ days: 1 }),
                ];
                break;
            case "this_year":
                [from, end, back] = [
                    today.startOf("year"),
                    today.startOf("year").plus({ years: 1 }),
                    { years: 1 },
                ];
                break;
        }
    }
    const days = calendarDays(from, end);
    // Days the period has had so far, today included.
    const soFar = Math.max(
        1,
        Math.min(days, calendarDays(from, today.plus({ days: 1 }))),
    );
    const beforeFrom = back ? from.minus(back) : from.minus({ days });
    const beforeEnd = DateTime.min(beforeFrom.plus({ days: soFar }), from);
    const iso = (d: DateTime) => d.toISODate() ?? "";
    const lastDay = end.minus({ days: 1 });
    const say = (d: DateTime, year: boolean) =>
        d.setLocale("en-GB").toFormat(year ? "d LLL yyyy" : "d LLL");
    return {
        period,
        zone,
        from: from.toJSDate(),
        to: end.toJSDate(),
        firstDay: iso(from),
        lastDay: iso(lastDay),
        days,
        before: {
            from: beforeFrom.toJSDate(),
            to: beforeEnd.toJSDate(),
            firstDay: iso(beforeFrom),
            lastDay: iso(beforeEnd.minus({ days: 1 })),
        },
        by: days <= 14 ? "day" : days <= 62 ? "week" : "month",
        words:
            days === 1
                ? say(from, true)
                : `${say(from, from.year !== lastDay.year)} to ${say(lastDay, true)}`,
    };
}

/** The span as every summary's output carries it. */
export const spanData = (s: Span) => ({
    period: s.period,
    timezone: s.zone,
    from: s.firstDay,
    to: s.lastDay,
    before_from: s.before.firstDay,
    before_to: s.before.lastDay,
});

/** The first line every summary says: the exact days, and what it compares with. */
export const spanLine = (s: Span, what: string, compared = true) =>
    `${what}, ${s.words} (${s.firstDay} to ${s.lastDay}, ${s.zone}).${compared ? ` Compared with ${s.before.firstDay} to ${s.before.lastDay}.` : ""}`;

/** "+12% on before" or "none before": a change said in words. */
export function change(now: number, before: number): string {
    if (before === 0) return now === 0 ? "the same as before" : "none before";
    const pct = Math.round(((now - before) / before) * 100);
    return pct === 0
        ? "the same as before"
        : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on before (${before})`;
}
