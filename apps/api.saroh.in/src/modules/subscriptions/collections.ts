import { DateTime } from "luxon";

import type { Period } from "./periods";

/**
 * A subscription's collections (plan 2026-09-23-003, U7): the days a
 * customer picks up what they subscribe to — a loaf every Saturday.
 *
 * A collection is a local DATE in the subscription's own timezone, on its
 * collection weekday (ISO: 1 Monday … 7 Sunday). Collections are dated from
 * the weekday within each billing period, not from the period itself, so a
 * monthly plan can collect weekly: four or five collections a month.
 *
 * What a skip does to the charge: plans are priced per period, never per
 * collection, so skipping one collection of several changes the pickup only
 * (no proration — out of scope). A period whose EVERY collection was skipped
 * before it was invoiced is not charged: for a weekly plan collecting weekly
 * that is exactly "skip this week, pay nothing for it". A skip made after
 * its period was invoiced leaves the invoice alone — an issued invoice never
 * changes (ADR-008).
 *
 * Dates travel as "YYYY-MM-DD" and are stored in a DATE column, which Prisma
 * reads back as UTC midnight of that day.
 */

/** How many upcoming collections a subscription read carries. */
export const UPCOMING_COLLECTIONS = 6;

export interface UpcomingCollection {
    /** The collection's local date, YYYY-MM-DD. */
    date: string;
    skipped: boolean;
    /** Still to come after today, so it may be skipped or un-skipped. */
    changeable: boolean;
}

/** A luxon date as YYYY-MM-DD. */
export function isoDay(d: DateTime): string {
    return d.toFormat("yyyy-MM-dd");
}

/** The local date of a moment, in a zone. */
export function localDate(at: Date, timezone: string): string {
    return isoDay(DateTime.fromJSDate(at, { zone: timezone }));
}

/** A stored DATE column (UTC midnight) as YYYY-MM-DD. */
export function dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

/** YYYY-MM-DD as the value a DATE column stores. */
export function dateValue(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}

function day(date: string): DateTime {
    return DateTime.fromISO(date, { zone: "UTC" });
}

/** The first date on or after `from` that falls on `weekday`. */
function firstOnOrAfter(from: string, weekday: number): DateTime {
    const start = day(from);
    return start.plus({ days: (weekday - start.weekday + 7) % 7 });
}

/**
 * The collection dates in a period: each date on the weekday from the
 * period's first local day up to, not including, the local day it ends.
 * An empty period (a start still ahead) has none.
 */
export function collectionDates(
    period: Period,
    weekday: number,
    timezone: string,
): string[] {
    const first = localDate(period.start, timezone);
    const end = localDate(period.end, timezone);
    const dates: string[] = [];
    for (
        let d = firstOnOrAfter(first, weekday);
        isoDay(d) < end;
        d = d.plus({ weeks: 1 })
    ) {
        dates.push(isoDay(d));
    }
    return dates;
}

/**
 * True when a period has collections and every one of them is skipped —
 * the one case a skip saves the period's charge.
 */
export function everyCollectionSkipped(
    period: Period,
    weekday: number,
    timezone: string,
    skipped: ReadonlySet<string>,
): boolean {
    const dates = collectionDates(period, weekday, timezone);
    return dates.length > 0 && dates.every((d) => skipped.has(d));
}

/**
 * True when a period still has a collection to come — today or later — that
 * is not skipped: what charging it now, outside its renewal, needs. A new
 * collection day whose dates in the period are all behind today gives it no
 * collection, and a collection that never happens is not charged for.
 */
export function collectionToCome(
    period: Period,
    weekday: number,
    timezone: string,
    today: string,
    skipped: ReadonlySet<string>,
): boolean {
    return collectionDates(period, weekday, timezone).some(
        (d) => d >= today && !skipped.has(d),
    );
}

/**
 * The next `count` collections from `from` (today's included, though it can
 * no longer be changed), stopping before `until` when the subscription is set
 * to end. Skipped ones are listed and marked, so a screen can offer Undo.
 * Every date here is already local to the subscription's timezone.
 */
export function upcomingCollections(input: {
    weekday: number;
    /** The first local date that may hold one: today, or a later start. */
    from: string;
    /** Local date it stops before, or null when it carries on. */
    until: string | null;
    today: string;
    skipped: ReadonlySet<string>;
    count?: number;
}): UpcomingCollection[] {
    const count = input.count ?? UPCOMING_COLLECTIONS;
    const out: UpcomingCollection[] = [];
    for (
        let d = firstOnOrAfter(input.from, input.weekday);
        out.length < count;
        d = d.plus({ weeks: 1 })
    ) {
        const date = isoDay(d);
        if (input.until !== null && date >= input.until) break;
        out.push({
            date,
            skipped: input.skipped.has(date),
            changeable: date > input.today,
        });
    }
    return out;
}
