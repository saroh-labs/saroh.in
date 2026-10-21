import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type {
    HomeGoingOwed,
    HomeMoneyTotal,
    HomeOwedBucket,
} from "../home/home-model";
import { WEEK_PATHS } from "../home/home-week";
import {
    leftToPayCents,
    OWED_VIEW_WHERE,
    OWED_WHERE,
} from "../invoices/invoice-state";
import type { OwedBill, UnpaidBills, UnpaidBillsRead } from "./unpaid-bills";

/**
 * Who owes the business, by how late (DEC-171): what is left to pay on
 * every issued bill that is not an order's own (`OWED_WHERE`), in three
 * ages — not due yet (or with no due date), 1 to 30 days past due, and
 * more than 30 — with how many bills each holds.
 *
 * What is owed is **what is left to pay**, never the bill's total
 * (DEC-173): a bill paid ₹1,000 of ₹2,500 owes ₹1,500. `leftToPayCents`
 * (`invoices/invoice-state.ts`) is the one place that is worked out, so
 * this reads each unpaid bill's total and `paidCents` and folds them here
 * rather than summing in SQL. A business's unpaid bills are few enough.
 *
 * Read by Insights' Money tab (`GET analytics/money`) and Home's "How it's
 * going" (`home/home-going.ts`), so the two never disagree. Amounts only
 * for `payment:read` (DEC-098); the counts for whoever may read owed.
 */

type Db = typeof prisma;

/** Past due by more than this many days is "more than 30 days late". */
export const LATE_LONG_DAYS = 30;

export type OwedByAge = HomeGoingOwed;
export type OwedAge = "notDue" | "late1to30" | "lateOver30";

export type { OwedBill, UnpaidBills, UnpaidBillsRead } from "./unpaid-bills";

/**
 * How late a bill is at `now`: not due (no due date, or due from now on),
 * 1 to 30 days late, or due before `longAgo` (30 days ago in the zone).
 */
export function owedAge(dueAt: Date | null, now: Date, longAgo: Date): OwedAge {
    if (dueAt === null || dueAt >= now) return "notDue";
    if (dueAt >= longAgo) return "late1to30";
    return "lateOver30";
}

function totals(by: Map<string, number>): HomeMoneyTotal[] {
    return [...by.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

function add(by: Map<string, number>, currency: string, minor: number) {
    by.set(currency, (by.get(currency) ?? 0) + minor);
}

/**
 * Fold unpaid bills into their ages. Each age's totals are per currency,
 * and the ages add up to `totals` exactly. Amounts are null without money.
 */
export function foldOwedByAge(
    bills: readonly OwedBill[],
    clock: { now: Date; zone: string },
    money: boolean,
): OwedByAge {
    const longAgo = DateTime.fromJSDate(clock.now, { zone: clock.zone })
        .minus({ days: LATE_LONG_DAYS })
        .toJSDate();
    const counts: Record<OwedAge, number> = {
        notDue: 0,
        late1to30: 0,
        lateOver30: 0,
    };
    const sums: Record<OwedAge, Map<string, number>> = {
        notDue: new Map(),
        late1to30: new Map(),
        lateOver30: new Map(),
    };
    const all = new Map<string, number>();
    for (const bill of bills) {
        const age = owedAge(bill.dueAt, clock.now, longAgo);
        const left = leftToPayCents(bill);
        counts[age] += 1;
        add(sums[age], bill.currency, left);
        add(all, bill.currency, left);
    }
    const bucket = (age: OwedAge, href: string): HomeOwedBucket => ({
        count: counts[age],
        totals: money ? totals(sums[age]) : null,
        href,
    });
    const overdue = counts.late1to30 + counts.lateOver30;
    return {
        totals: money ? totals(all) : null,
        bills: counts.notDue + overdue,
        overdue,
        byAge: {
            notDue: bucket("notDue", WEEK_PATHS.OWED),
            late1to30: bucket("late1to30", WEEK_PATHS.OVERDUE),
            lateOver30: bucket("lateOver30", WEEK_PATHS.OVERDUE),
        },
        href: overdue > 0 ? WEEK_PATHS.OVERDUE : WEEK_PATHS.OWED,
    };
}

/**
 * A business's unpaid bills (`OWED_VIEW_WHERE`), and whether it has ever
 * billed outside an order at all. Home's This week and How it's going both
 * fold them, so a full Home build reads them once and hands both the same
 * read (review #16, `unpaidBillsOnce`).
 */
export async function readUnpaidBills(
    db: Db,
    organizationId: string,
): Promise<UnpaidBills> {
    const [bills, ever] = await Promise.all([
        db.invoice.findMany({
            where: { organizationId, ...OWED_VIEW_WHERE },
            select: {
                currency: true,
                // Past due is `isPastDue`'s, which reads the status too.
                status: true,
                dueAt: true,
                total: true,
                paidCents: true,
            },
        }),
        db.invoice.findFirst({
            where: { organizationId, ...OWED_WHERE },
            select: { id: true },
        }),
    ]);
    return { bills, ever: ever !== null };
}

/**
 * The unpaid bills, read on the first ask and shared after: one Home build
 * hands it to every figure that folds them.
 */
export function unpaidBillsOnce(
    db: Db,
    organizationId: string,
): UnpaidBillsRead {
    let read: Promise<UnpaidBills> | null = null;
    return () => (read ??= readUnpaidBills(db, organizationId));
}

/**
 * What is owed now, by how late. Null for a business that has never billed
 * outside an order: no "₹0 owed" for a shop. `unpaid` is a read already
 * shared with another figure; without it the bills are read here.
 */
export async function readOwedByAge(
    db: Db,
    organizationId: string,
    clock: { now: Date; zone: string },
    money: boolean,
    unpaid?: UnpaidBillsRead,
): Promise<OwedByAge | null> {
    const { bills, ever } = await (unpaid
        ? unpaid()
        : readUnpaidBills(db, organizationId));
    if (!ever) return null;
    return foldOwedByAge(bills, clock, money);
}
