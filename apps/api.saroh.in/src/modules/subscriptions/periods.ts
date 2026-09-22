import type { DurationLikeObject } from "luxon";
import { DateTime } from "luxon";

/**
 * Subscription periods: calendar intervals anchored to the start date, in
 * the subscription's own timezone (ADR-007).
 *
 * Every boundary is computed from the ANCHOR, never from the previous
 * boundary. That is what keeps a 31 January start on month ends: 28 February
 * is the anchor plus one month, clamped, and 31 March is the anchor plus two
 * — stepping from 28 February would have drifted to the 28th for good.
 *
 * The arithmetic is luxon's in the named zone, so a period ends at the same
 * local wall-clock time it started, across daylight-saving changes, and
 * "midnight" means the business's midnight rather than UTC's.
 */
export const INTERVALS = ["WEEK", "MONTH", "QUARTER", "YEAR"] as const;
export type Interval = (typeof INTERVALS)[number];

export interface Period {
    start: Date;
    end: Date;
}

function step(interval: Interval, n: number): DurationLikeObject {
    switch (interval) {
        case "WEEK":
            return { weeks: n };
        case "MONTH":
            return { months: n };
        case "QUARTER":
            return { months: 3 * n };
        case "YEAR":
            return { years: n };
    }
}

/** The anchor plus `n` intervals, clamped to the end of a shorter month. */
export function boundary(
    anchor: Date,
    interval: Interval,
    timezone: string,
    n: number,
): Date {
    return DateTime.fromJSDate(anchor, { zone: timezone })
        .plus(step(interval, n))
        .toJSDate();
}

/** Roughly how many intervals fit between the anchor and `at` — a first guess. */
function estimate(anchor: Date, interval: Interval, at: Date): number {
    const days = (at.getTime() - anchor.getTime()) / 86_400_000;
    const perInterval = { WEEK: 7, MONTH: 30.44, QUARTER: 91.31, YEAR: 365.25 };
    return Math.max(0, Math.floor(days / perInterval[interval]));
}

/**
 * The period that holds `at`: `start <= at < end`. A moment exactly on a
 * boundary belongs to the period that starts there. A moment before the
 * anchor gets the first period, which starts at the anchor.
 */
export function periodContaining(
    anchor: Date,
    interval: Interval,
    timezone: string,
    at: Date,
): Period {
    let n = estimate(anchor, interval, at);
    // The estimate is within one or two of the answer; walk to it.
    while (n > 0 && boundary(anchor, interval, timezone, n) > at) n -= 1;
    while (boundary(anchor, interval, timezone, n + 1) <= at) n += 1;
    return {
        start: boundary(anchor, interval, timezone, n),
        end: boundary(anchor, interval, timezone, n + 1),
    };
}

/** The period that follows one ending at `end`, on the anchor's chain. */
export function nextPeriod(
    anchor: Date,
    interval: Interval,
    timezone: string,
    end: Date,
): Period {
    return periodContaining(anchor, interval, timezone, end);
}
