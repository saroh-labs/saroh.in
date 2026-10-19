import type { Prisma, prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { toMinor } from "../../common/money";
import { OWED_WHERE } from "../invoices/invoice-state";
import { realOrderWhere } from "../orders/open-orders";
import { MONEY_ON_THE_CALENDAR, sinceHref } from "./home-last-day";
import type {
    HomeGoing,
    HomeGoingOwed,
    HomeGoingSales,
    HomeMoneyTotal,
    HomeOwedBucket,
} from "./home-model";
import { onOneStore, storeWhere } from "./home-staff";
import type { WeekScope } from "./home-week";
import { compareTakings, readMoney, WEEK_PATHS } from "./home-week";

/**
 * Home A's "How it's going" (DEC-171): sales, bookings and orders for the
 * last 7 days against the 7 days before, and what is owed now by how late.
 *
 * Rolling windows, never calendar weeks: "the last 7 days" are today and
 * the six days before it, by the business's calendar (DEC-033), and "the 7
 * before" the seven days before those. A Monday therefore compares Tuesday
 * to Monday with the Tuesday to Monday before, never a week that just
 * started with a whole one ("0 · 19 fewer than last week").
 *
 * Each figure for whoever holds its read, as This week's (`weekScope`):
 * sales with `payment:read`, bookings with `booking:read`, orders with
 * `order:read` or `order:stage`, owed with `invoice:read` — and owed's
 * amounts only with `payment:read` too (DEC-098).
 */

type Db = typeof prisma;

/** How many days each window holds. */
export const GOING_DAYS = 7;

/** Past due by more than this many days is "more than 30 days late". */
export const LATE_LONG_DAYS = 30;

export interface GoingWindows {
    /** 00:00 six days before today: the last 7 days start here. */
    from: Date;
    /** 00:00 tomorrow: the last 7 days end here. */
    to: Date;
    /** 00:00 seven days before `from`. */
    beforeFrom: Date;
    fromDate: string;
    toDate: string;
    beforeFromDate: string;
    beforeToDate: string;
}

/** The two windows around `now`, in `zone`'s calendar. */
export function goingWindows(now: Date, zone: string): GoingWindows {
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    const from = today.minus({ days: GOING_DAYS - 1 });
    const beforeFrom = from.minus({ days: GOING_DAYS });
    return {
        from: from.toJSDate(),
        to: today.plus({ days: 1 }).toJSDate(),
        beforeFrom: beforeFrom.toJSDate(),
        fromDate: from.toISODate() ?? "",
        toDate: today.toISODate() ?? "",
        beforeFromDate: beforeFrom.toISODate() ?? "",
        beforeToDate: from.minus({ days: 1 }).toISODate() ?? "",
    };
}

/** Sales per currency that moved in either window, each against the other. */
export function goingSales(
    last: Awaited<ReturnType<typeof readMoney>>,
    before: Awaited<ReturnType<typeof readMoney>>,
    href: string,
): HomeGoingSales[] {
    const currencies = new Set([...last.net.keys(), ...before.net.keys()]);
    return [...currencies].sort().map((currency) => {
        const amountMinor = last.net.get(currency) ?? 0;
        const beforeMinor = before.net.get(currency) ?? 0;
        return {
            currency,
            amountMinor,
            beforeMinor,
            change: compareTakings(
                amountMinor,
                beforeMinor,
                before.payments.get(currency) ?? 0,
            ),
            href,
        };
    });
}

interface OwedRow {
    currency: string;
    _sum: { total: { toString(): string } | null };
    _count: { _all: number };
}

function bucket(rows: OwedRow[], money: boolean, href: string): HomeOwedBucket {
    return {
        count: rows.reduce((n, r) => n + r._count._all, 0),
        totals: money ? totalsOf(rows) : null,
        href,
    };
}

function totalsOf(rows: OwedRow[]): HomeMoneyTotal[] {
    return rows.map((r) => ({
        currency: r.currency,
        amountMinor: toMinor(r._sum.total ?? 0),
    }));
}

/** Every age's total together, per currency, in minor units. */
function together(...ages: OwedRow[][]): HomeMoneyTotal[] {
    const by = new Map<string, number>();
    for (const row of ages.flat()) {
        by.set(
            row.currency,
            (by.get(row.currency) ?? 0) + toMinor(row._sum.total ?? 0),
        );
    }
    return [...by.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/**
 * What is owed now (issued, unpaid, not an order's own — `OWED_WHERE`, as
 * This week's owed) in three ages: not due yet (or no due date), 1 to 30
 * days past due, and more than 30. Null for a business that has never
 * billed outside an order: no "₹0 owed" for a shop.
 */
export async function readOwedByAge(
    db: Db,
    organizationId: string,
    clock: { now: Date; zone: string },
    money: boolean,
): Promise<HomeGoingOwed | null> {
    const unpaid = {
        organizationId,
        ...OWED_WHERE,
        status: "ISSUED",
    } satisfies Prisma.InvoiceWhereInput;
    // "More than 30 days late": due before this moment 30 days ago, by the
    // zone's calendar.
    const longAgo = DateTime.fromJSDate(clock.now, { zone: clock.zone })
        .minus({ days: LATE_LONG_DAYS })
        .toJSDate();
    const sums = (where: Prisma.InvoiceWhereInput) =>
        db.invoice.groupBy({
            by: ["currency"],
            where: { ...unpaid, ...where },
            _sum: { total: true },
            _count: { _all: true },
            orderBy: { currency: "asc" },
        }) as unknown as Promise<OwedRow[]>;
    const [notDue, recent, old, ever] = await Promise.all([
        sums({ OR: [{ dueAt: null }, { dueAt: { gte: clock.now } }] }),
        sums({ dueAt: { lt: clock.now, gte: longAgo } }),
        sums({ dueAt: { lt: longAgo } }),
        db.invoice.findFirst({
            where: { organizationId, ...OWED_WHERE },
            select: { id: true },
        }),
    ]);
    if (!ever) return null;
    const count = (rows: OwedRow[]) =>
        rows.reduce((n, r) => n + r._count._all, 0);
    const overdue = count(recent) + count(old);
    return {
        totals: money ? together(notDue, recent, old) : null,
        bills: count(notDue) + overdue,
        overdue,
        byAge: {
            notDue: bucket(notDue, money, WEEK_PATHS.OWED),
            late1to30: bucket(recent, money, WEEK_PATHS.OVERDUE),
            lateOver30: bucket(old, money, WEEK_PATHS.OVERDUE),
        },
        href: overdue > 0 ? WEEK_PATHS.OVERDUE : WEEK_PATHS.OWED,
    };
}

/**
 * How it's going for one viewer: only the figures their reads allow, the
 * rest absent (never zero). Throws when a read fails; `HomeService` names
 * "How it's going". A staff member's orders are their storefronts' (F11).
 */
export async function readGoing(
    db: Db,
    organizationId: string,
    scope: WeekScope,
    clock: { now: Date; zone: string },
    view: { money: boolean; storeIds?: readonly string[] | null },
): Promise<HomeGoing> {
    const w = goingWindows(clock.now, clock.zone);
    const storeIds = view.storeIds ?? null;
    const booked = (gte: Date, lt: Date) =>
        db.booking.count({
            where: {
                organizationId,
                // Standing bookings, as This week counts them.
                status: "CONFIRMED",
                startAt: { gte, lt },
            },
        });
    const placed = (gte: Date, lt: Date) =>
        db.order.count({
            where: {
                organizationId,
                ...storeWhere(storeIds),
                createdAt: { gte, lt },
                ...realOrderWhere(),
            },
        });
    const sales = scope.takings && view.money;
    const [last, before, bookings, bookingsBefore, orders, ordersBefore, owed] =
        await Promise.all([
            sales ? readMoney(db, organizationId, w.from, clock.now) : null,
            sales ? readMoney(db, organizationId, w.beforeFrom, w.from) : null,
            scope.bookings ? booked(w.from, w.to) : null,
            scope.bookings ? booked(w.beforeFrom, w.from) : null,
            scope.orders ? placed(w.from, w.to) : null,
            scope.orders ? placed(w.beforeFrom, w.from) : null,
            scope.owed
                ? readOwedByAge(db, organizationId, clock, view.money)
                : null,
        ]);

    const since = w.from.toISOString();
    const going: HomeGoing = {
        zone: clock.zone,
        from: w.fromDate,
        to: w.toDate,
        beforeFrom: w.beforeFromDate,
        beforeTo: w.beforeToDate,
    };
    if (last && before) {
        going.sales = goingSales(
            last,
            before,
            scope.takingsIn === "calendar"
                ? MONEY_ON_THE_CALENDAR
                : sinceHref(WEEK_PATHS.TAKINGS, since),
        );
    }
    if (bookings !== null && bookingsBefore !== null) {
        going.bookings = {
            count: bookings,
            before: bookingsBefore,
            href: WEEK_PATHS.BOOKINGS,
        };
    }
    if (orders !== null && ordersBefore !== null) {
        going.orders = {
            count: orders,
            before: ordersBefore,
            href: sinceHref(onOneStore(WEEK_PATHS.ORDERS, storeIds), since),
        };
    }
    if (owed) going.owed = owed;
    return going;
}
