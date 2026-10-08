import type { Prisma, prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { toMinor } from "../../common/money";
import {
    NOT_A_BOOKING_HOLD,
    OWED_WHERE,
    refundedBetweenWhere,
} from "../invoices/invoice-state";
import { realOrderWhere } from "../orders/open-orders";
import { MONEY_ON_THE_CALENDAR, sinceHref } from "./home-last-day";
import type {
    HomeInput,
    HomeWeek,
    HomeWeekChange,
    HomeWeekOwed,
    HomeWeekTakings,
} from "./home-model";
import { holds } from "./home-model";
import { onOneStore, seesBusinessBookings, storeWhere } from "./home-staff";

/**
 * Home's "This week" (round 2, F7): the week's money and work in a few
 * figures, each for whoever holds its own read.
 *
 * - **Takings so far** (`payment:read`, as the Last 24 hours' money; its
 *   link opens the invoices counted for someone who also holds
 *   `invoice:read`, else the Calendar's money — F11): what came in since Monday, net of refunds, against the
 *   same days last week. Each rupee once: an order's money is its invoice
 *   (ADR-008, every order has one), so paid invoices alone count it; a
 *   refund is its credit note, taken off on the day it was issued.
 * - **Bookings this week** (`booking:read`): confirmed bookings starting
 *   Monday to Sunday, against the whole of last week.
 * - **Orders this week** (`order:read` or `order:stage`): real orders
 *   placed since Monday.
 * - **Owed to you** (`invoice:read`): issued, unpaid invoices that aren't an
 *   order's own (`OWED_WHERE`), with how many are overdue.
 *
 * No payout figure (default 52). The week is the business's (DEC-033): it
 * starts Monday at midnight in the business's zone. The words are the
 * client's, as they are for the Last 24 hours; this file sends numbers and
 * the comparison, and the comparison is decided here so every client says
 * the same thing.
 */

type Db = typeof prisma;

/**
 * Fewer payments than this last week and the week is too thin to compare:
 * one big payment last week would make any week "Down 80%".
 */
export const MIN_PAYMENTS_TO_COMPARE = 3;

/**
 * Last week's takings under this share of this week's are too small to
 * compare against: "Up 900%" says nothing a merchant can use.
 */
export const MIN_LAST_WEEK_SHARE = 0.25;

/** Which figures this viewer may read, or null when none. */
export interface WeekScope {
    takings: boolean;
    bookings: boolean;
    orders: boolean;
    owed: boolean;
    /**
     * Takings read by someone who may not open the invoices behind them:
     * the figure links to the Calendar's money instead (F11).
     */
    takingsIn?: "calendar";
}

export function weekScope(
    input: HomeInput,
    available: ReadonlySet<string>,
): WeekScope | null {
    if (input.organizationRole === "REVIEWER") return null;
    const payments = available.has("PAYMENTS");
    // Takings are `payment:read`'s alone (the permission matrix; F11): a
    // person given it sees what came in, whether or not they read invoices.
    const takings = payments && holds(input, "payment:read");
    const scope: WeekScope = {
        takings,
        bookings: available.has("APPOINTMENTS") && seesBusinessBookings(input),
        orders:
            available.has("COMMERCE") &&
            (holds(input, "order:read") || holds(input, "order:stage")),
        owed: payments && holds(input, "invoice:read"),
        ...(takings && !holds(input, "invoice:read")
            ? { takingsIn: "calendar" as const }
            : {}),
    };
    return Object.values(scope).some(Boolean) ? scope : null;
}

/** The instants the week's figures are measured between. */
export interface WeekWindows {
    /** Monday 00:00 this week, in the business's zone. */
    start: Date;
    /** Monday 00:00 next week. */
    end: Date;
    /** Monday 00:00 last week. */
    lastStart: Date;
    /** The same moment last week as `now`: "the same days so far". */
    lastSoFar: Date;
    /** This week's Monday, `2026-09-14`. */
    startDate: string;
}

export function weekWindows(now: Date, zone: string): WeekWindows {
    const at = DateTime.fromJSDate(now, { zone });
    // Luxon's weeks are ISO weeks: they start on Monday.
    const monday = at.startOf("week");
    return {
        start: monday.toJSDate(),
        end: monday.plus({ weeks: 1 }).toJSDate(),
        lastStart: monday.minus({ weeks: 1 }).toJSDate(),
        // By the zone's calendar, so a clock change between the weeks
        // still compares 10:00 Friday with 10:00 Friday.
        lastSoFar: at.minus({ weeks: 1 }).toJSDate(),
        startDate: monday.toISODate() ?? "",
    };
}

/**
 * This week's takings against last week's same days: up, down or level by
 * a whole percent, or too thin to say — fewer than
 * {@link MIN_PAYMENTS_TO_COMPARE} payments last week, or last week under
 * {@link MIN_LAST_WEEK_SHARE} of this one.
 */
export function compareTakings(
    thisWeekMinor: number,
    lastWeekMinor: number,
    lastWeekPayments: number,
): HomeWeekChange {
    if (
        lastWeekPayments < MIN_PAYMENTS_TO_COMPARE ||
        lastWeekMinor <= 0 ||
        lastWeekMinor < thisWeekMinor * MIN_LAST_WEEK_SHARE
    ) {
        return { kind: "THIN" };
    }
    const percent = Math.round(
        ((thisWeekMinor - lastWeekMinor) / lastWeekMinor) * 100,
    );
    if (percent === 0) return { kind: "LEVEL", percent: 0 };
    return percent > 0
        ? { kind: "UP", percent }
        : { kind: "DOWN", percent: -percent };
}

/** Money in and out of one window, per currency, in minor units. */
export interface WindowMoney {
    /** Paid in, less refunds, per currency. */
    net: Map<string, number>;
    /** How many invoices were paid, per currency. */
    payments: Map<string, number>;
}

/** The where for invoices paid in `[from, to)`; credit notes never. */
export function paidBetweenWhere(
    organizationId: string,
    from: Date,
    to: Date,
): Prisma.InvoiceWhereInput {
    return {
        organizationId,
        paidAt: { gte: from, lt: to },
        kind: { not: "CREDIT_NOTE" },
        ...NOT_A_BOOKING_HOLD,
    };
}

// The where for money handed back lives with the invoice rules, which
// Home's last-24-hours strip reads too (UX-061).
export { refundedBetweenWhere };

interface SumRow {
    currency: string;
    _sum: { total: { toString(): string } | null };
    _count: { _all: number };
}

/** Paid in less handed back, per currency, from two grouped reads. */
export function windowMoney(paid: SumRow[], refunded: SumRow[]): WindowMoney {
    const net = new Map<string, number>();
    const payments = new Map<string, number>();
    for (const row of paid) {
        net.set(
            row.currency,
            (net.get(row.currency) ?? 0) + toMinor(row._sum.total ?? 0),
        );
        payments.set(
            row.currency,
            (payments.get(row.currency) ?? 0) + row._count._all,
        );
    }
    for (const row of refunded) {
        net.set(
            row.currency,
            (net.get(row.currency) ?? 0) - toMinor(row._sum.total ?? 0),
        );
    }
    return { net, payments };
}

/**
 * One takings figure per currency that moved this week, each against the
 * same currency last week. A currency only last week took nothing this
 * week, and says nothing.
 */
export function takingsFigures(
    thisWeek: WindowMoney,
    lastWeek: WindowMoney,
    href: string,
): HomeWeekTakings[] {
    return [...thisWeek.net.entries()]
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
                href,
            };
        });
}

/** Where each figure's rows are listed. */
export const WEEK_PATHS = {
    // Invoices paid since Monday — the list's `?since=` is paid-since.
    TAKINGS: "/billing/invoices",
    BOOKINGS: "/bookings",
    // Orders placed since Monday.
    ORDERS: "/commerce/orders",
    OWED: "/billing/invoices?view=issued",
    OVERDUE: "/billing/invoices?view=overdue",
} as const;

async function readMoney(
    db: Db,
    organizationId: string,
    from: Date,
    to: Date,
): Promise<WindowMoney> {
    const sums = (where: Prisma.InvoiceWhereInput) =>
        db.invoice.groupBy({
            by: ["currency"],
            where,
            _sum: { total: true },
            _count: { _all: true },
            orderBy: { currency: "asc" },
        });
    const [paid, refunded] = await Promise.all([
        sums(paidBetweenWhere(organizationId, from, to)),
        sums(refundedBetweenWhere(organizationId, from, to)),
    ]);
    return windowMoney(paid, refunded);
}

async function readOwed(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<HomeWeekOwed | null> {
    const unpaid = {
        organizationId,
        ...OWED_WHERE,
        status: "ISSUED",
    } satisfies Prisma.InvoiceWhereInput;
    const [sums, overdue, ever] = await Promise.all([
        db.invoice.groupBy({
            by: ["currency"],
            where: unpaid,
            _sum: { total: true },
            _count: { _all: true },
            orderBy: { currency: "asc" },
        }),
        db.invoice.count({ where: { ...unpaid, dueAt: { lt: now } } }),
        // A business that has never billed anyone outside an order has
        // nothing to be owed: no "₹0" row for a shop.
        db.invoice.findFirst({
            where: { organizationId, ...OWED_WHERE },
            select: { id: true },
        }),
    ]);
    if (!ever) return null;
    return {
        totals: sums.map((row) => ({
            currency: row.currency,
            amountMinor: toMinor(row._sum.total ?? 0),
        })),
        bills: sums.reduce((n, row) => n + row._count._all, 0),
        overdue,
        href: overdue > 0 ? WEEK_PATHS.OVERDUE : WEEK_PATHS.OWED,
    };
}

/**
 * The whole block for one viewer: only the figures their reads allow, the
 * rest absent (never zero). Throws when a read fails; `HomeService` names
 * "This week" and sends none. A staff member's orders are their
 * storefronts' (F11, `storeIds`); the money is the business's, and isn't
 * narrowed.
 */
export async function readWeek(
    db: Db,
    organizationId: string,
    scope: WeekScope,
    clock: { now: Date; zone: string },
    storeIds: readonly string[] | null = null,
): Promise<HomeWeek> {
    const w = weekWindows(clock.now, clock.zone);
    const monday = w.start.toISOString();
    const booked = (gte: Date, lt: Date) =>
        db.booking.count({
            where: {
                organizationId,
                // Standing bookings, as Today counts them: a cancelled one
                // isn't coming, and an unpaid hold isn't a booking yet.
                status: "CONFIRMED",
                startAt: { gte, lt },
            },
        });

    const [thisMoney, lastMoney, bookings, lastBookings, orders, owed] =
        await Promise.all([
            scope.takings
                ? readMoney(db, organizationId, w.start, clock.now)
                : null,
            scope.takings
                ? readMoney(db, organizationId, w.lastStart, w.lastSoFar)
                : null,
            scope.bookings ? booked(w.start, w.end) : null,
            scope.bookings ? booked(w.lastStart, w.start) : null,
            scope.orders
                ? db.order.count({
                      where: {
                          organizationId,
                          ...storeWhere(storeIds),
                          createdAt: { gte: w.start },
                          ...realOrderWhere(),
                      },
                  })
                : null,
            scope.owed ? readOwed(db, organizationId, clock.now) : null,
        ]);

    const week: HomeWeek = { zone: clock.zone, startDate: w.startDate };
    if (thisMoney && lastMoney) {
        week.takings = takingsFigures(
            thisMoney,
            lastMoney,
            scope.takingsIn === "calendar"
                ? MONEY_ON_THE_CALENDAR
                : sinceHref(WEEK_PATHS.TAKINGS, monday),
        );
    }
    if (bookings !== null && lastBookings !== null) {
        week.bookings = {
            count: bookings,
            lastWeek: lastBookings,
            href: WEEK_PATHS.BOOKINGS,
        };
    }
    if (orders !== null) {
        week.orders = {
            count: orders,
            href: sinceHref(onOneStore(WEEK_PATHS.ORDERS, storeIds), monday),
        };
    }
    if (owed) week.owed = owed;
    return week;
}
