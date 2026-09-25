import { localDate, upcomingCollections } from "../subscriptions/collections";
import type { Interval } from "../subscriptions/periods";
import { nextPeriod } from "../subscriptions/periods";

/**
 * What a subscription has dated in a month (U4), worked out from its own
 * terms — pure, so the month's edges and skips are tested without a
 * database.
 */

export interface ScheduledSubscription {
    status: string;
    interval: string;
    timezone: string;
    anchorAt: Date;
    createdAt: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    pausedAt: Date | null;
    cancelledAt: Date | null;
    collectionWeekday: number | null;
}

/**
 * Renewals still to come in `[start, end)`: an active subscription that is
 * not set to end renews at the end of its period, and then at each period
 * end after that on its anchor's chain. Renewals already run are invoices,
 * and are read as such.
 */
export function upcomingRenewals(
    sub: ScheduledSubscription,
    start: Date,
    end: Date,
): Date[] {
    if (sub.status !== "ACTIVE" || sub.cancelAtPeriodEnd) return [];
    const out: Date[] = [];
    let at = sub.currentPeriodEnd;
    // A year of weekly renewals at most fits a month many times over; the
    // bound only guards against a malformed chain that does not advance.
    for (let i = 0; i < 64 && at < end; i += 1) {
        if (at >= start) out.push(at);
        const next = nextPeriod(
            sub.anchorAt,
            sub.interval as Interval,
            sub.timezone,
            at,
        ).end;
        if (next <= at) break;
        at = next;
    }
    return out;
}

/**
 * The collection dates in a month (local dates, in the subscription's zone),
 * skips left out. Collections run from the day it started until it stops: a
 * cancel (its day), a pause (its day), or the end of the period it is set to
 * end with. A subscription with no collection weekday collects nothing.
 */
export function collectionsInMonth(
    sub: ScheduledSubscription,
    days: string[],
    skipped: ReadonlySet<string>,
): string[] {
    const weekday = sub.collectionWeekday;
    if (weekday === null || days.length === 0) return [];
    const tz = sub.timezone;
    const started = localDate(
        sub.anchorAt < sub.createdAt ? sub.anchorAt : sub.createdAt,
        tz,
    );
    const stops: string[] = [];
    if (sub.cancelledAt) stops.push(localDate(sub.cancelledAt, tz));
    if (sub.status === "PAUSED" && sub.pausedAt) {
        stops.push(localDate(sub.pausedAt, tz));
    }
    if (sub.status !== "CANCELLED" && sub.cancelAtPeriodEnd) {
        stops.push(localDate(sub.currentPeriodEnd, tz));
    }
    if (sub.status === "CANCELLED" && !sub.cancelledAt) return [];

    const first = days[0];
    const afterLast = nextDay(days[days.length - 1]);
    const until = [afterLast, ...stops].sort()[0];
    const from = started > first ? started : first;
    if (from >= until) return [];
    return upcomingCollections({
        weekday,
        from,
        until,
        // Every date is listed; whether one can still be changed is not
        // this read's question.
        today: from,
        skipped,
        count: 6,
    })
        .filter((c) => !c.skipped)
        .map((c) => c.date);
}

function nextDay(date: string): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
