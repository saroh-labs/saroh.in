import { toMinor } from "../../common/money";
import type { HomeWeekChange } from "../home/home-need-model";
import { compareTakings } from "../home/home-week";
import type { OwedByAge } from "./owed-by-age";
import type { InsightsPeriod, PeriodWindows } from "./period";
import { dayIn, weekIn } from "./period";
import type {
    PlaceKind,
    TakingsDayRow,
    TakingsSoFar,
    TakingsWeek,
} from "./takings";

/**
 * Insights' Money (DEC-171, `GET analytics/money?period=`): the overview's
 * money card and the Money tab, for one period against the same number of
 * days before it (`period.ts`). Pure: the folds of what `takings.sql.ts`
 * reads. The service reads.
 *
 * Money in is the takings rule (`takings.ts`): each sale counted once, net
 * of refunds, on the day it was paid in the business's zone, in the
 * business's currency only (others are named, never added in). A bill is
 * money in when it is paid in full; what is still owed on a bill is
 * `owed`, read as what is left to pay (`owed-by-age.ts`, DEC-173).
 *
 * Every comparison says THIN rather than a percentage when the period
 * before is too small to compare with (`compareTakings`), or when the
 * business is younger than the two periods together (`thin`): the screen
 * says "nothing earlier to compare with yet" (`IBThinD`).
 *
 * Amounts in minor units (paise). The words are the app's (U4).
 */

/** Money in for the period and the one before. */
export interface MoneyIn {
    amountMinor: number;
    beforeMinor: number;
    change: HomeWeekChange;
    /** Paid orders and paid bills. */
    payments: number;
    paymentsBefore: number;
    /** Paid orders among them. */
    orders: number;
    ordersBefore: number;
    /** Paid bills among them (not an order's own). */
    bills: number;
    billsBefore: number;
}

/** What an order usually comes to: the middle paid order, net of refunds. */
export interface MoneyUsualOrder {
    /** Null when no order was paid in the period. */
    amountMinor: number | null;
    beforeMinor: number | null;
    orders: number;
    ordersBefore: number;
}

/** A place money came from in the period, with its change. */
export interface MoneyPlace {
    key: string;
    kind: PlaceKind;
    /** The location's name; null for online and invoices. */
    name: string | null;
    amountMinor: number;
    beforeMinor: number;
    change: HomeWeekChange;
}

/** One of the twelve weekly bars, and which window it mostly falls in. */
export interface MoneyWeek extends TakingsWeek {
    /** PERIOD (drawn dark), BEFORE (light) or neither. */
    in: "PERIOD" | "BEFORE" | null;
}

/** Today so far, against the same weekday last week to the same time. */
export interface MoneyToday {
    date: string;
    amountMinor: number;
    payments: number;
    sameWeekdayLastWeekMinor: number;
    sameWeekdayLastWeekPayments: number;
    change: HomeWeekChange;
}

/** `GET organizations/:organizationId/analytics/money?period=`. */
export interface MoneyRead {
    period: InsightsPeriod;
    zone: string;
    /** The currency every figure is in; null before the business has one. */
    currency: string | null;
    /** Currencies money also came in, left out of the figures. */
    otherCurrencies: string[];
    /** The days compared, in the business's calendar. */
    window: {
        days: number;
        from: string;
        to: string;
        beforeFrom: string;
        beforeTo: string;
    };
    /** The earlier of the business's first day and its first sale. */
    startedOn: string;
    /** Days from `startedOn` to today. */
    ageDays: number;
    /** Younger than the two periods: nothing earlier to compare with yet. */
    thin: boolean;
    /** Has the business ever taken money? `false`: the no-sales state. */
    hasSales: boolean;
    firstSaleOn: string | null;
    moneyIn: MoneyIn;
    usualOrder: MoneyUsualOrder;
    /** The best of the twelve weeks; null when none took anything. */
    bestWeek: { start: string; end: string; takingsMinor: number } | null;
    /** Twelve whole weeks, oldest first, each marked by window. */
    weeks: MoneyWeek[];
    /** The week in progress so far, beside the same days of last week. */
    thisWeek: TakingsSoFar;
    today: MoneyToday;
    /** Open locations (storefronts) the business has. */
    locations: number;
    /** Where the period's money came from, largest first; none at nothing. */
    places: MoneyPlace[];
    /** Who owes by how late; null without `invoice:read` or never billed. */
    owed: OwedByAge | null;
}

const THIN: HomeWeekChange = { kind: "THIN" };

interface Sums {
    minor: number;
    payments: number;
    orders: number;
}

function zero(): Sums {
    return { minor: 0, payments: 0, orders: 0 };
}

function addRow(sums: Sums, row: TakingsDayRow, minor: number) {
    sums.minor += minor;
    sums.payments += Number(row.payments);
    sums.orders += Number(row.orders);
}

/** The period's and the period before's sums, in all and per place. */
export interface PeriodFold {
    period: Sums;
    before: Sums;
    places: Map<string, { period: Sums; before: Sums }>;
}

/** Fold day rows into the period and the one before, in `currency` only. */
export function foldPeriod(
    rows: readonly TakingsDayRow[],
    currency: string | null,
    w: PeriodWindows,
): PeriodFold {
    const out: PeriodFold = {
        period: zero(),
        before: zero(),
        places: new Map(),
    };
    for (const row of rows) {
        if (row.currency !== currency) continue;
        const at = dayIn(w, row.day);
        if (at === null) continue;
        const minor = toMinor(row.amount);
        let place = out.places.get(row.place);
        if (!place) {
            place = { period: zero(), before: zero() };
            out.places.set(row.place, place);
        }
        if (at === "PERIOD") {
            addRow(out.period, row, minor);
            addRow(place.period, row, minor);
        } else {
            addRow(out.before, row, minor);
            addRow(place.before, row, minor);
        }
    }
    return out;
}

/** A comparison, or THIN for a business too young to compare. */
export function changeOf(
    minor: number,
    beforeMinor: number,
    beforePayments: number,
    thin: boolean,
): HomeWeekChange {
    return thin ? THIN : compareTakings(minor, beforeMinor, beforePayments);
}

export function moneyIn(fold: PeriodFold, thin: boolean): MoneyIn {
    const { period, before } = fold;
    return {
        amountMinor: period.minor,
        beforeMinor: before.minor,
        change: changeOf(period.minor, before.minor, before.payments, thin),
        payments: period.payments,
        paymentsBefore: before.payments,
        orders: period.orders,
        ordersBefore: before.orders,
        bills: period.payments - period.orders,
        billsBefore: before.payments - before.orders,
    };
}

/**
 * The period's places, largest first (a tie by key, so the order never
 * shuffles), each with its change. A place that took nothing in the period
 * is left out: no "0% online".
 */
export function moneyPlaces(
    fold: PeriodFold,
    named: (key: string) => { kind: PlaceKind; name: string | null },
    thin: boolean,
): MoneyPlace[] {
    return [...fold.places.entries()]
        .filter(([, p]) => p.period.minor > 0)
        .map(([key, p]) => ({
            key,
            ...named(key),
            amountMinor: p.period.minor,
            beforeMinor: p.before.minor,
            change: changeOf(
                p.period.minor,
                p.before.minor,
                p.before.payments,
                thin,
            ),
        }))
        .sort(
            (a, b) =>
                b.amountMinor - a.amountMinor || a.key.localeCompare(b.key),
        );
}

/** The twelve weeks, each marked by the window it mostly falls in. */
export function markWeeks(
    weeks: readonly TakingsWeek[],
    w: PeriodWindows,
): MoneyWeek[] {
    return weeks.map((week) => ({ ...week, in: weekIn(w, week.start) }));
}

/** The week that took most; the earlier on a tie; null when none took any. */
export function bestWeek(weeks: readonly TakingsWeek[]): MoneyRead["bestWeek"] {
    let best: TakingsWeek | null = null;
    for (const week of weeks) {
        if (
            week.takingsMinor > 0 &&
            (!best || week.takingsMinor > best.takingsMinor)
        ) {
            best = week;
        }
    }
    return best
        ? { start: best.start, end: best.end, takingsMinor: best.takingsMinor }
        : null;
}

/** One row of `usualOrderSql`. */
export interface UsualOrderRow {
    window: "PERIOD" | "BEFORE";
    currency: string;
    amount: { toString(): string } | null;
    orders: number;
}

export function usualOrder(
    rows: readonly UsualOrderRow[],
    currency: string | null,
): MoneyUsualOrder {
    const of = (window: UsualOrderRow["window"]) =>
        rows.find((r) => r.window === window && r.currency === currency);
    const period = of("PERIOD");
    const before = of("BEFORE");
    return {
        amountMinor: period?.amount != null ? toMinor(period.amount) : null,
        beforeMinor: before?.amount != null ? toMinor(before.amount) : null,
        orders: Number(period?.orders ?? 0),
        ordersBefore: Number(before?.orders ?? 0),
    };
}

/**
 * Today so far, from the day rows, against the same weekday last week to
 * the same time (`lastWeek`, read on its own, as Home's tile reads it).
 */
export function moneyToday(
    rows: readonly TakingsDayRow[],
    lastWeek: readonly TakingsDayRow[],
    currency: string | null,
    today: string,
): MoneyToday {
    const sum = (list: readonly TakingsDayRow[], day: string | null) => {
        const out = zero();
        for (const row of list) {
            if (row.currency !== currency) continue;
            if (day !== null && row.day !== day) continue;
            addRow(out, row, toMinor(row.amount));
        }
        return out;
    };
    const now = sum(rows, today);
    const last = sum(lastWeek, null);
    return {
        date: today,
        amountMinor: now.minor,
        payments: now.payments,
        sameWeekdayLastWeekMinor: last.minor,
        sameWeekdayLastWeekPayments: last.payments,
        change: compareTakings(now.minor, last.minor, last.payments),
    };
}
