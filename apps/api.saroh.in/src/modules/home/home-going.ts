import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { readOwedByAge } from "../analytics/owed-by-age";
import { realOrderWhere } from "../orders/open-orders";
import { MONEY_ON_THE_CALENDAR, sinceHref } from "./home-last-day";
import type { HomeGoing, HomeGoingSales } from "./home-model";
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
 * amounts only with `payment:read` too (DEC-098). Owed by how late is
 * Insights' own read (`analytics/owed-by-age.ts`): what is left to pay on
 * each bill, so Home and Insights never disagree.
 */

type Db = typeof prisma;

/** How many days each window holds. */
export const GOING_DAYS = 7;

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
