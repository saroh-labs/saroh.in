import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import {
    paidSinceFilter,
    refundedBetweenWhere,
} from "../invoices/invoice-state";
import { realOrderWhere } from "../orders/open-orders";
import type { HomeInput, HomeLastDay, HomeSinceItem } from "./home-model";
import { holds } from "./home-model";
import { onOneStore, storeWhere } from "./home-staff";
import { businessDay } from "./home-today";

/**
 * Home's header (round 2, F6): the greeting's clock and the "Last 24 hours"
 * strip — new orders, new bookings, reviews and the money taken — each a
 * link that opens exactly the rows it counts.
 *
 * The clock is the business's (DEC-033), as Today's is: "Good morning" at
 * 09:30 in Mumbai even for an owner reading it from London. The window is
 * the 24 hours before this read, the same instant for every figure, and it
 * travels in each link (`?since=`) so the list it opens filters from the
 * same instant rather than from whenever it is opened.
 *
 * Each figure asks for its own read, so the API leaves out what the caller
 * may not see: orders with `order:read` or `order:stage`, bookings with
 * `booking:read`, reviews with `product-review:read`, and money with
 * `payment:read` (F11; its link opens the invoices counted only for someone
 * who also holds `invoice:read`). A Reviewer's Home is its own (F9) and
 * gets no strip.
 */

type Db = typeof prisma;

/** How far back the strip looks. */
export const SINCE_HOURS = 24;

/** Which figures this viewer may read, or null when none. */
export interface SinceScope {
    orders: boolean;
    bookings: boolean;
    reviews: boolean;
    money: boolean;
    /**
     * Money read by someone who may not open the invoices behind it: the
     * figure links to the Calendar's money instead (F11).
     */
    moneyIn?: "calendar";
}

/**
 * Where money taken links for someone who holds `payment:read` but not
 * `invoice:read`: the Calendar, whose money is `payment:read`'s (E19), not
 * an Invoices list that would only tell them they can't open it.
 */
export const MONEY_ON_THE_CALENDAR = "/calendar";

export function sinceScope(
    input: HomeInput,
    available: ReadonlySet<string>,
): SinceScope | null {
    if (input.organizationRole === "REVIEWER") return null;
    const commerce = available.has("COMMERCE");
    // Money taken is `payment:read`'s alone (the permission matrix; F11).
    const money = available.has("PAYMENTS") && holds(input, "payment:read");
    const scope: SinceScope = {
        orders:
            commerce &&
            (holds(input, "order:read") || holds(input, "order:stage")),
        bookings: available.has("APPOINTMENTS") && holds(input, "booking:read"),
        reviews: commerce && holds(input, "product-review:read"),
        money,
        ...(money && !holds(input, "invoice:read")
            ? { moneyIn: "calendar" as const }
            : {}),
    };
    return Object.values(scope).some(Boolean) ? scope : null;
}

/** "morning" before noon, "afternoon" before five, else "evening". */
export function partOfDay(now: Date, zone: string): HomeLastDay["partOfDay"] {
    const hour = DateTime.fromJSDate(now, { zone }).hour;
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    return "evening";
}

/**
 * The header without its reads: what Home shows when the strip's read
 * failed (and says so), or when this viewer reads none of it.
 */
export function lastDayHeader(now: Date, zone: string): HomeLastDay {
    return {
        zone,
        date: businessDay(now, zone).date,
        partOfDay: partOfDay(now, zone),
        since: new Date(
            now.getTime() - SINCE_HOURS * 60 * 60 * 1000,
        ).toISOString(),
        fresh: false,
        items: [],
    };
}

/** A list's address with the window on it. */
export function sinceHref(path: string, since: string): string {
    const glue = path.includes("?") ? "&" : "?";
    return `${path}${glue}since=${encodeURIComponent(since)}`;
}

/** Where each figure's rows are listed, filtered from `since`. */
export const SINCE_PATHS = {
    ORDERS: "/commerce/orders",
    // Every booking, not only upcoming ones: one made last night for next
    // month is new, and so is one for this morning that has passed.
    BOOKINGS: "/bookings/all?view=all",
    REVIEWS: "/commerce/products?tab=reviews",
    PAYMENTS: "/billing/invoices",
} as const;

/**
 * The paid invoices the money figure adds up — each rupee once. The
 * Invoices list's `?paidSince=` reads the same, so its link opens exactly
 * the invoices counted.
 */
export function paidSinceWhere(organizationId: string, since: Date) {
    return { organizationId, ...paidSinceFilter(since) };
}

/** The end of an open window: nothing is issued after it. */
const FAR_FUTURE = new Date("9999-12-31T00:00:00.000Z");

/**
 * The strip's figures above zero, in the design's order: orders, bookings,
 * reviews, money. Money is one figure per currency, as it came in. A staff
 * member's orders and reviews are their storefronts' (F11, `storeIds`).
 */
export async function readSince(
    db: Db,
    organizationId: string,
    scope: SinceScope,
    sinceIso: string,
    storeIds: readonly string[] | null = null,
): Promise<HomeSinceItem[]> {
    const since = new Date(sinceIso);
    const newSince = { organizationId, createdAt: { gte: since } };
    const inTheirs = { ...newSince, ...storeWhere(storeIds) };
    const [orders, bookings, reviews, money, refunded] = await Promise.all([
        // Real orders only, as the Orders list its link opens counts them:
        // an abandoned online checkout (placed online, never paid) is not
        // a new order.
        scope.orders
            ? db.order.count({ where: { ...inTheirs, ...realOrderWhere() } })
            : 0,
        // Confirmed: a hold still waiting on payment, or one let go, isn't
        // a booking anyone will turn up for.
        scope.bookings
            ? db.booking.count({ where: { ...newSince, status: "CONFIRMED" } })
            : 0,
        scope.reviews ? db.productReview.count({ where: inTheirs }) : 0,
        scope.money
            ? db.invoice.groupBy({
                  by: ["currency"],
                  where: paidSinceWhere(organizationId, since),
                  _sum: { total: true },
                  _count: { _all: true },
                  orderBy: { currency: "asc" },
              })
            : [],
        // Money handed back in the window comes off what was taken
        // (UX-061), as the week's takings read it: "taken" is net.
        scope.money
            ? db.invoice.groupBy({
                  by: ["currency"],
                  where: refundedBetweenWhere(
                      organizationId,
                      since,
                      FAR_FUTURE,
                  ),
                  _sum: { total: true },
                  _count: { _all: true },
                  orderBy: { currency: "asc" },
              })
            : [],
    ]);

    const items: HomeSinceItem[] = [];
    const count = (kind: "ORDERS" | "BOOKINGS" | "REVIEWS", n: number) => {
        if (n > 0) {
            items.push({
                kind,
                count: n,
                amountMinor: null,
                currency: null,
                href: sinceHref(
                    kind === "ORDERS"
                        ? onOneStore(SINCE_PATHS.ORDERS, storeIds)
                        : SINCE_PATHS[kind],
                    sinceIso,
                ),
            });
        }
    };
    count("ORDERS", orders);
    count("BOOKINGS", bookings);
    count("REVIEWS", reviews);
    const back = new Map(
        refunded.map((r) => [
            r.currency,
            Math.round(Number(r._sum.total ?? 0) * 100),
        ]),
    );
    for (const row of money) {
        // Decimal in MAJOR units on the row; the wire is minor units. Net
        // of what went back meanwhile (UX-061).
        const amountMinor =
            Math.round(Number(row._sum.total ?? 0) * 100) -
            (back.get(row.currency) ?? 0);
        if (amountMinor <= 0) continue;
        items.push({
            kind: "PAYMENTS",
            count: row._count._all,
            amountMinor,
            currency: row.currency,
            href:
                scope.moneyIn === "calendar"
                    ? MONEY_ON_THE_CALENDAR
                    : sinceHref(SINCE_PATHS.PAYMENTS, sinceIso),
        });
    }
    return items;
}

/**
 * Whether the business has yet to sell, book or be paid for anything. Asked
 * only for someone who may set it up; everyone else is greeted as usual.
 */
export async function isFresh(
    db: Db,
    organizationId: string,
): Promise<boolean> {
    const where = { organizationId };
    const [order, booking, paid] = await Promise.all([
        // An abandoned online checkout is not a sale.
        db.order.findFirst({
            where: { ...where, ...realOrderWhere() },
            select: { id: true },
        }),
        db.booking.findFirst({ where, select: { id: true } }),
        db.invoice.findFirst({
            where: { organizationId, paidAt: { not: null } },
            select: { id: true },
        }),
    ]);
    return !order && !booking && !paid;
}

/**
 * The whole header: the clock, whether the business is new, and — for one
 * that isn't — the strip. Throws when a read fails; `HomeService` names the
 * part and falls back to {@link lastDayHeader}. A staff member's strip
 * counts their storefronts' orders and reviews (F11, `storeIds`).
 */
export async function readLastDay(
    db: Db,
    input: HomeInput,
    available: ReadonlySet<string>,
    clock: { now: Date; zone: string },
    storeIds: readonly string[] | null = null,
): Promise<HomeLastDay> {
    const header = lastDayHeader(clock.now, clock.zone);
    const mayOrganize =
        input.organizationRole !== "REVIEWER" && holds(input, "org:update");
    if (mayOrganize && (await isFresh(db, input.organizationId))) {
        return { ...header, fresh: true };
    }
    const scope = sinceScope(input, available);
    if (!scope) return header;
    return {
        ...header,
        items: await readSince(
            db,
            input.organizationId,
            scope,
            header.since,
            storeIds,
        ),
    };
}
