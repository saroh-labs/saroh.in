import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { MONEY_ON_THE_CALENDAR, sinceHref } from "./home-last-day";
import type { HomeMoneyToday, HomeTileMoneyIn } from "./home-model";
import { compareTakings, readMoney, WEEK_PATHS } from "./home-week";

/**
 * Home A's "Money in today" tile (DEC-171): what came in today in the
 * business's zone, net of refunds, per currency, against the same weekday
 * last week to the same time of day. The same rupees This week counts
 * (`readMoney`: money in by the one rule, `invoices/money-in.ts`, less
 * credit notes that gave money back), so the two never disagree.
 *
 * `payment:read`'s alone (DEC-098); `HomeService` asks for it only then.
 */

type Db = typeof prisma;

/** The windows: today so far, and the same weekday last week so far. */
export function moneyTodayWindows(
    now: Date,
    zone: string,
): { start: Date; lastStart: Date; lastSoFar: Date } {
    const at = DateTime.fromJSDate(now, { zone });
    const start = at.startOf("day");
    return {
        start: start.toJSDate(),
        // By the zone's calendar, so a clock change between the two days
        // still compares 10:00 Monday with 10:00 Monday.
        lastStart: start.minus({ weeks: 1 }).toJSDate(),
        lastSoFar: at.minus({ weeks: 1 }).toJSDate(),
    };
}

export async function readMoneyToday(
    db: Db,
    organizationId: string,
    clock: { now: Date; zone: string },
    view: { calendar: boolean },
): Promise<HomeTileMoneyIn> {
    const w = moneyTodayWindows(clock.now, clock.zone);
    const [today, lastWeek] = await Promise.all([
        readMoney(db, organizationId, w.start, clock.now),
        readMoney(db, organizationId, w.lastStart, w.lastSoFar),
    ]);
    const totals: HomeMoneyToday[] = [...today.net.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amountMinor]) => {
            const lastWeekMinor = lastWeek.net.get(currency) ?? 0;
            return {
                currency,
                amountMinor,
                lastWeekMinor,
                change: compareTakings(
                    amountMinor,
                    lastWeekMinor,
                    lastWeek.payments.get(currency) ?? 0,
                ),
            };
        });
    const payments = [...today.payments.values()].reduce((n, c) => n + c, 0);
    return {
        totals,
        payments,
        // The invoices money came in on today, or the Calendar's money for someone who
        // may not open invoices (F11), as This week's takings link.
        href: view.calendar
            ? MONEY_ON_THE_CALENDAR
            : sinceHref(WEEK_PATHS.TAKINGS, w.start.toISOString()),
    };
}
