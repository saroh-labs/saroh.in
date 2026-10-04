import { DateTime } from "luxon";

import { toMinor } from "../../common/money";

/**
 * Insights' takings (DEC-075): twelve weeks of money actually taken, the
 * figures the page's sentences are written from. Pure: the windows, and
 * the fold of what `takings.sql.ts` reads into weeks. The service reads.
 *
 * **Takings** are the business's sales, each counted once (ADR-008,
 * "Each rupee is counted once"), by the rule Customers' "Spent" uses (C14,
 * `customer-workspace/spent.sql.ts`):
 *
 * - **a paid order** (`paymentStatus` PAID), its total less every refund
 *   handed back on it that has not failed (the order's own payments, or a
 *   treatment's payment at booking), never below zero. Money handed back
 *   because the order was edited down is not taken off twice: the total
 *   already fell. An order refunded in full (REFUNDED) counts nothing;
 * - **a paid invoice that is not an order's own** and not a credit note
 *   (bookings, plans, packs, courses, invoices written by hand), its total
 *   less its credit notes. An order's own invoice is the order's money,
 *   counted above.
 *
 * Each sale falls in the week it was paid — the order's `paidAt` (its
 * `createdAt` for an order paid before `paidAt` was recorded), the
 * invoice's `paidAt` — in the business's own zone, weeks starting Monday
 * (DEC-033). A refund lowers the week of the sale it gave money back on,
 * so no week reads below zero and a later refund corrects the week it
 * belongs to. Only the twelve whole weeks before this one are weeks; the
 * week in progress is read on its own, so far, beside the same days of
 * last week (`foldSoFar`).
 *
 * **Where it was sold** is the Orders list's own notion: an order placed at
 * the website's checkout (`placedOnline`) is online, any other is its
 * location's (`Order.storeId`); an invoice that is not an order's is
 * "invoices". Money is in minor units (paise), in the business's currency.
 */

/** How many whole weeks Insights reads. */
export const TAKINGS_WEEKS = 12;

/** One week's instants and its dates, in the business's zone. */
export interface WeekWindow {
    /** Monday 00:00, the instant it starts. */
    start: Date;
    /** The next Monday 00:00. */
    end: Date;
    /** Monday's date, `2026-09-14`. */
    startDate: string;
    /** Sunday's date, `2026-09-20`. */
    endDate: string;
}

/**
 * The `count` whole weeks before the one `now` is in, oldest first.
 * Monday to Sunday in `zone`, by its calendar: a week a clock change falls
 * in is 167 or 169 hours long, as the business lived it.
 */
export function takingsWeeks(
    now: Date,
    zone: string,
    count = TAKINGS_WEEKS,
): WeekWindow[] {
    // Luxon's weeks are ISO weeks: they start on Monday.
    const thisMonday = DateTime.fromJSDate(now, { zone }).startOf("week");
    const weeks: WeekWindow[] = [];
    for (let back = count; back >= 1; back -= 1) {
        const start = thisMonday.minus({ weeks: back });
        const end = start.plus({ weeks: 1 });
        weeks.push({
            start: start.toJSDate(),
            end: end.toJSDate(),
            startDate: start.toISODate() ?? "",
            endDate: end.minus({ days: 1 }).toISODate() ?? "",
        });
    }
    return weeks;
}

/** Today's date in `zone`, `2026-10-01`. */
export function todayIn(now: Date, zone: string): string {
    return DateTime.fromJSDate(now, { zone }).toISODate() ?? "";
}

/** The Monday of the week `now` is in, in `zone`. */
export function weekInProgress(now: Date, zone: string): string {
    return DateTime.fromJSDate(now, { zone }).startOf("week").toISODate() ?? "";
}

/** Where money came from: a location, the website's checkout, or invoices. */
export type PlaceKind = "LOCATION" | "ONLINE" | "INVOICES";

/** The website's checkout. */
export const ONLINE_PLACE = "online";
/** Invoices that are not an order's own. */
export const INVOICES_PLACE = "invoices";

/** A location's place key. */
export function locationPlace(storeId: string): string {
    return `location:${storeId}`;
}

export function placeKind(key: string): PlaceKind {
    if (key === ONLINE_PLACE) return "ONLINE";
    if (key === INVOICES_PLACE) return "INVOICES";
    return "LOCATION";
}

/** The store id in a location's key, else null. */
export function placeStoreId(key: string): string | null {
    return key.startsWith("location:") ? key.slice("location:".length) : null;
}

/** One row of `takings.sql.ts`: a day's sales at one place, in one currency. */
export interface TakingsDayRow {
    /** The business's own date it was paid, `2026-09-16`. */
    day: string;
    place: string;
    currency: string;
    /** Net of refunds, in major units, as Postgres sums a Decimal. */
    amount: { toString(): string };
    /** Paid orders among them. */
    orders: number;
    /** Paid orders and invoices among them. */
    payments: number;
}

/** What one place took in a week. */
export interface TakingsPlaceWeek {
    key: string;
    takingsMinor: number;
}

/** One whole week, Monday to Sunday. */
export interface TakingsWeek {
    /** Monday, `2026-09-14`. */
    start: string;
    /** Sunday, `2026-09-20`. */
    end: string;
    /** Money taken, net of refunds, in minor units. */
    takingsMinor: number;
    /** What the paid orders among it took (the rest is invoices). */
    orderTakingsMinor: number;
    /** Paid orders. */
    orders: number;
    /** Paid orders and paid invoices. */
    payments: number;
    /** What each place took, largest first; places that took nothing left out. */
    places: TakingsPlaceWeek[];
}

/** A place money came from, named. */
export interface TakingsPlace {
    key: string;
    kind: PlaceKind;
    /** The location's name; null for online and invoices. */
    name: string | null;
}

/** `GET organizations/:organizationId/analytics/takings`. */
export interface TakingsRead {
    /** The business's zone the weeks are drawn in. */
    zone: string;
    /** The currency every figure is in; null before the business has one. */
    currency: string | null;
    /**
     * Currencies money was also taken in during the twelve weeks, which the
     * figures leave out (a business sells in one, DEC-030; older rows may not).
     */
    otherCurrencies: string[];
    /** The business's date of the first money it ever took; null for none. */
    firstSaleOn: string | null;
    /** Monday of the week in progress, which the weeks stop short of. */
    thisWeekStart: string;
    /** The week in progress so far, beside the same days of last week. */
    thisWeek: TakingsSoFar;
    /** Open locations (storefronts) the business has. */
    locations: number;
    /** Every place named in `weeks`. */
    places: TakingsPlace[];
    /** The twelve whole weeks, oldest first. */
    weeks: TakingsWeek[];
}

/**
 * The week in progress, Monday to today in the business's zone. Not a
 * week yet, so it is never compared with whole weeks — only with the same
 * days of the week before (Monday to the same weekday), which is fair
 * however far into the week today is.
 */
export interface TakingsSoFar {
    /** Monday, `2026-09-28`. */
    start: string;
    /** Today, `2026-10-01`. */
    through: string;
    takingsMinor: number;
    orders: number;
    payments: number;
    /** Last week's Monday to the same weekday as today. */
    sameDaysLastWeekMinor: number;
    sameDaysLastWeekPayments: number;
}

/** `2026-09-21` from `2026-09-28` less `days`, by the calendar. */
function minusDays(date: string, days: number): string {
    return (
        DateTime.fromISO(date, { zone: "utc" }).minus({ days }).toISODate() ??
        ""
    );
}

/**
 * The week in progress so far, in `currency` only, and the same days of
 * the week before it from the same rows.
 */
export function foldSoFar(
    rows: readonly TakingsDayRow[],
    currency: string | null,
    thisWeekStart: string,
    today: string,
): TakingsSoFar {
    const lastStart = minusDays(thisWeekStart, 7);
    const lastThrough = minusDays(today, 7);
    const out: TakingsSoFar = {
        start: thisWeekStart,
        through: today,
        takingsMinor: 0,
        orders: 0,
        payments: 0,
        sameDaysLastWeekMinor: 0,
        sameDaysLastWeekPayments: 0,
    };
    for (const row of rows) {
        if (row.currency !== currency) continue;
        if (row.day >= thisWeekStart && row.day <= today) {
            out.takingsMinor += toMinor(row.amount);
            out.orders += Number(row.orders);
            out.payments += Number(row.payments);
        } else if (row.day >= lastStart && row.day <= lastThrough) {
            out.sameDaysLastWeekMinor += toMinor(row.amount);
            out.sameDaysLastWeekPayments += Number(row.payments);
        }
    }
    return out;
}

/** The week a date falls in, or undefined outside them. */
function weekOf(weeks: readonly WeekWindow[], day: string): number | undefined {
    for (let i = 0; i < weeks.length; i += 1) {
        if (day >= weeks[i].startDate && day <= weeks[i].endDate) return i;
    }
    return undefined;
}

/**
 * Fold the day rows into the twelve weeks, in `currency` only. A week with
 * no sales is still there, at zero: it is a week that happened.
 */
export function foldTakings(
    windows: readonly WeekWindow[],
    rows: readonly TakingsDayRow[],
    currency: string | null,
): TakingsWeek[] {
    const weeks = windows.map((w) => ({
        start: w.startDate,
        end: w.endDate,
        takingsMinor: 0,
        orderTakingsMinor: 0,
        orders: 0,
        payments: 0,
        byPlace: new Map<string, number>(),
    }));
    for (const row of rows) {
        if (row.currency !== currency) continue;
        const i = weekOf(windows, row.day);
        if (i === undefined) continue;
        const week = weeks[i];
        const minor = toMinor(row.amount);
        week.takingsMinor += minor;
        if (row.orders > 0) week.orderTakingsMinor += minor;
        week.orders += Number(row.orders);
        week.payments += Number(row.payments);
        week.byPlace.set(row.place, (week.byPlace.get(row.place) ?? 0) + minor);
    }
    return weeks.map(({ byPlace, ...week }) => ({
        ...week,
        places: [...byPlace.entries()]
            .filter(([, minor]) => minor > 0)
            .map(([key, takingsMinor]) => ({ key, takingsMinor }))
            .sort(
                (a, b) =>
                    b.takingsMinor - a.takingsMinor ||
                    a.key.localeCompare(b.key),
            ),
    }));
}

/**
 * The currency the figures are in: the business's own, else the one most
 * money was taken in, else null. The rest are named, not added in.
 */
export function pickCurrency(
    business: string | null,
    rows: readonly TakingsDayRow[],
): { currency: string | null; others: string[] } {
    const totals = new Map<string, number>();
    for (const row of rows) {
        totals.set(
            row.currency,
            (totals.get(row.currency) ?? 0) + toMinor(row.amount),
        );
    }
    const ranked = [...totals.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const most = ranked.length > 0 ? ranked[0][0] : null;
    const currency = business ?? most;
    const others = [...totals.keys()]
        .filter((c) => c !== currency)
        .sort((a, b) => a.localeCompare(b));
    return { currency, others };
}
