import { fromMinor, toMinor } from "../../common/money";
import type { Interval } from "./periods";

/**
 * A plan's figures for the Plans tab, Plan Detail and the editor's At a
 * glance (plan 2026-09-26-004, D1). Pure: the service reads the rows, this
 * adds them up. Every sum is in minor units, so no float touches a paisa.
 */

/** How many of a plan's intervals make a month, as a fraction. */
const PER_MONTH: Record<Interval, { times: number; per: number }> = {
    WEEK: { times: 52, per: 12 },
    MONTH: { times: 1, per: 1 },
    QUARTER: { times: 1, per: 3 },
    YEAR: { times: 1, per: 12 },
};

/**
 * A price as a month's worth, in minor units, rounded half up to the paisa:
 * ₹12,000 a year is ₹1,000.00, ₹350 a week is ₹1,516.67.
 */
export function monthlyMinor(minor: number, interval: Interval): number {
    const { times, per } = PER_MONTH[interval];
    return Math.round((minor * times) / per);
}

/** One group of a plan's live subscribers: the terms they pay, and a count. */
export interface PriceGroup {
    price: { toString(): string };
    currency: string;
    interval: string;
    status: string;
    count: number;
}

/** Who pays what: subscribers on a plan grouped by the terms they pay. */
export interface PriceRow {
    price: string;
    currency: string;
    interval: Interval;
    /** Active or paused, on these terms. */
    count: number;
    /** The terms the plan sells at now; any other row is an older price. */
    current: boolean;
}

export interface PlanFigures {
    /** People on it now — active or paused. */
    subscriberCount: number;
    byPrice: PriceRow[];
    /** The plan's own price as a month's worth. */
    monthly: string;
    /**
     * What its running (not paused) subscribers pay in a month, each at the
     * price they bought at, in the plan's currency. Anyone on another
     * currency is left out: two currencies do not add up.
     */
    monthlyFromMembers: string;
}

export function planFigures(
    plan: {
        price: { toString(): string };
        currency: string;
        interval: string;
    },
    groups: readonly PriceGroup[],
): PlanFigures {
    const planMinor = toMinor(plan.price);
    const rows = new Map<string, PriceRow & { minor: number }>();
    let fromMembers = 0;
    for (const g of groups) {
        const minor = toMinor(g.price);
        const interval = g.interval as Interval;
        const key = `${minor}|${g.currency}|${interval}`;
        const row = rows.get(key) ?? {
            price: fromMinor(minor),
            currency: g.currency,
            interval,
            count: 0,
            current:
                minor === planMinor &&
                g.currency === plan.currency &&
                interval === plan.interval,
            minor,
        };
        row.count += g.count;
        rows.set(key, row);
        if (g.status === "ACTIVE" && g.currency === plan.currency) {
            fromMembers += monthlyMinor(minor, interval) * g.count;
        }
    }
    // The price it sells at first, then the most people, then the dearer.
    const byPrice = [...rows.values()]
        .sort(
            (a, b) =>
                Number(b.current) - Number(a.current) ||
                b.count - a.count ||
                b.minor - a.minor,
        )
        .map((r) => ({
            price: r.price,
            currency: r.currency,
            interval: r.interval,
            count: r.count,
            current: r.current,
        }));
    return {
        subscriberCount: byPrice.reduce((n, r) => n + r.count, 0),
        byPrice,
        monthly: fromMinor(monthlyMinor(planMinor, plan.interval as Interval)),
        monthlyFromMembers: fromMinor(fromMembers),
    };
}
