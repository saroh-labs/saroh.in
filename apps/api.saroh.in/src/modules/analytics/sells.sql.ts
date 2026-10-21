import { Prisma } from "@saroh/database";

import { notRetired } from "../customer-workspace/customers-list.sql";
import {
    orderRefundedSql,
    paidOnInvoiceSql,
    spentLedgerRowsSql,
} from "../customer-workspace/spent.sql";
import { ts } from "../orders/order-list-filters";

/**
 * Insights' What sells as SQL (`sells.ts` has the rules in words). Pure:
 * builds `Prisma.Sql`, runs nothing. The money is Insights' takings rule
 * (`takings.sql.ts`) and Customers' "Spent" (`spent.sql.ts`), so the three
 * never disagree on what a sale kept. The columns are timestamp without
 * time zone holding UTC (DEV_LEARNINGS), bound with `ts` and read as UTC
 * before they are put in the business's zone.
 *
 * Indexes (U3, checked with EXPLAIN ANALYZE on a business of 20,000
 * orders, 40,000 lines, 6,000 bookings, 3,000 bills and 3,000 people: the
 * whole read took 70ms for 7 days and 300ms for 3 months, the heaviest
 * query, best sellers over 3 months and the 3 before, 75ms): orders by
 * `Order(organizationId)` and `Order(organizationId, createdAt)`, their
 * lines by `OrderItem(orderId)`, refund lines by
 * `PaymentRefundLine(orderItemId)`; bookings by
 * `Booking(organizationId, startAt)`; bills (since the money-in rule, by
 * their ledger) by `InvoicePayment(organizationId, receivedAt)` and
 * `InvoicePayment(invoiceId)`; a customer's earlier visits by
 * `CustomerIdentityLink(contactId, customerId)`, `Order(customerId)`,
 * `Invoice(contactId)` and `Booking(contactId)`. No new index was needed: when paid
 * (`COALESCE(paidAt, createdAt)`) is not indexable, as in takings, and
 * the business's own rows are what the organization index narrows to.
 */

/** When an order's money was taken: when it was paid, else when placed. */
const ORDER_PAID_AT = Prisma.sql`COALESCE(o."paidAt", o."createdAt")`;

/** PERIOD from `from` on, else BEFORE. */
function windowOf(column: Prisma.Sql, from: Date): Prisma.Sql {
    return Prisma.sql`CASE WHEN ${column} >= ${ts(from)} THEN 'PERIOD' ELSE 'BEFORE' END`;
}

/**
 * Every product sold on a paid order in `[beforeFrom, to)`, per window:
 * `productId`, `name`, `window`, `sold` (units less those refunded by
 * line), `amount` (what the lines charged less what was refunded on them,
 * major units, in `currency` only). A refunded order (`REFUNDED`) is not
 * paid and never counts; a refund made because the order was edited down
 * (`forEdit`) already lowered the line, so it is left alone.
 */
export function bestSellersSql(
    organizationId: string,
    currency: string | null,
    beforeFrom: Date,
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT l."productId", p.name, l.window,
            SUM(l.sold)::int AS sold,
            SUM(l.amount) FILTER (WHERE l.currency = ${currency}::text) AS amount
        FROM (
            SELECT oi."productId", o.currency,
                ${windowOf(ORDER_PAID_AT, from)} AS window,
                oi.quantity - COALESCE(r.quantity, 0) AS sold,
                oi.price * oi.quantity - COALESCE(r.amount, 0) AS amount
            FROM "Order" o
            JOIN "OrderItem" oi ON oi."orderId" = o.id
            LEFT JOIN LATERAL (
                SELECT SUM(rl.quantity) AS quantity,
                    SUM(rl."amountCents")::numeric / 100 AS amount
                FROM "PaymentRefundLine" rl
                JOIN "PaymentRefund" pr ON pr.id = rl."paymentRefundId"
                WHERE rl."orderItemId" = oi.id
                  AND rl."organizationId" = ${organizationId}
                  AND pr.status <> 'FAILED'
                  AND NOT pr."forEdit"
            ) r ON TRUE
            WHERE o."organizationId" = ${organizationId}
              AND o."paymentStatus" = 'PAID'
              AND oi."productId" IS NOT NULL
              AND ${ORDER_PAID_AT} >= ${ts(beforeFrom)}
              AND ${ORDER_PAID_AT} < ${ts(to)}
        ) l
        JOIN "Product" p ON p.id = l."productId"
        WHERE p."organizationId" = ${organizationId}
        GROUP BY l."productId", p.name, l.window`;
}

/**
 * Every service's bookings starting in `[beforeFrom, to)`, per window:
 * `bookings` (places held: CONFIRMED, came or not), `people` (different
 * people among them: the contact, else the booker's email), `sessions`
 * (different start times anyone booked, cancelled or not: a class session
 * whose places were all cancelled was still offered). A booking still
 * waiting for its payment (PENDING) is not booked yet.
 */
export function bookedSql(
    organizationId: string,
    beforeFrom: Date,
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT b."serviceId", s.name, s.capacity,
            ${windowOf(Prisma.sql`b."startAt"`, from)} AS window,
            (COUNT(*) FILTER (WHERE b.status = 'CONFIRMED'))::int AS bookings,
            (COUNT(DISTINCT COALESCE(b."contactId", lower(btrim(b."bookerEmail")), b.id))
                FILTER (WHERE b.status = 'CONFIRMED'))::int AS people,
            COUNT(DISTINCT b."startAt")::int AS sessions
        FROM "Booking" b
        JOIN "Service" s ON s.id = b."serviceId"
        WHERE b."organizationId" = ${organizationId}
          AND b.status IN ('CONFIRMED', 'CANCELLED')
          AND b."startAt" >= ${ts(beforeFrom)}
          AND b."startAt" < ${ts(to)}
        GROUP BY b."serviceId", s.name, s.capacity, 4`;
}

/**
 * Paid orders (when paid) and attended bookings (when they started) in
 * `[from, to)`, counted by ISO weekday and hour in `zone`: `dow`, `hour`,
 * `kind`, `count`.
 */
export function busiestSql(
    organizationId: string,
    zone: string,
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT EXTRACT(ISODOW FROM e.local)::int AS dow,
            EXTRACT(HOUR FROM e.local)::int AS hour,
            e.kind, COUNT(*)::int AS count
        FROM (
            SELECT (${ORDER_PAID_AT} AT TIME ZONE 'UTC') AT TIME ZONE ${zone}::text AS local,
                'ORDER' AS kind
            FROM "Order" o
            WHERE o."organizationId" = ${organizationId}
              AND o."paymentStatus" = 'PAID'
              AND ${ORDER_PAID_AT} >= ${ts(from)}
              AND ${ORDER_PAID_AT} < ${ts(to)}
            UNION ALL
            SELECT (b."startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}::text,
                'BOOKING'
            FROM "Booking" b
            WHERE b."organizationId" = ${organizationId}
              AND b.status = 'CONFIRMED'
              AND b.outcome = 'ATTENDED'
              AND b."startAt" >= ${ts(from)}
              AND b."startAt" < ${ts(to)}
        ) e
        GROUP BY 1, 2, 3`;
}

/**
 * What each person did in `[from, to)`: paid orders (through the storefront
 * customers linked to them, net of refunds), bills that are not an order's
 * own with money in during the window (their ledger payments received in
 * it, net of credit notes, by the money-in rule as Spent reads it), and
 * bookings they came to. `kind`,
 * `amount` (0 for a visit), `currency`, `delivery`, `online`.
 */
function didSql(organizationId: string, from: Date, to: Date): Prisma.Sql {
    return Prisma.sql`
        SELECT l."contactId", 'ORDER' AS kind, o.currency,
            GREATEST(o.total - ${orderRefundedSql(organizationId)}, 0) AS amount,
            o.fulfilment::text IN ('LOCAL_DELIVERY', 'SHIPPING') AS delivery,
            o."placedOnline" AS online
        FROM "Order" o
        JOIN "CustomerIdentityLink" l
          ON l."customerId" = o."customerId" AND l."organizationId" = ${organizationId}
        WHERE o."organizationId" = ${organizationId}
          AND o."paymentStatus" = 'PAID'
          AND ${ORDER_PAID_AT} >= ${ts(from)}
          AND ${ORDER_PAID_AT} < ${ts(to)}
        UNION ALL
        SELECT x."contactId", 'BILL', x.currency, SUM(x.amount),
            FALSE, NULL
        FROM (${spentLedgerRowsSql(organizationId, {
            paidIn: { from: ts(from), to: ts(to) },
        })}) x
        WHERE x.at >= ${ts(from)}
          AND x.at < ${ts(to)}
        GROUP BY x."invoiceId", x."contactId", x.currency
        UNION ALL
        SELECT b."contactId",
            CASE WHEN s.capacity > 1 THEN 'CLASS' ELSE 'BOOKING' END,
            NULL, 0, FALSE, NULL
        FROM "Booking" b
        JOIN "Service" s ON s.id = b."serviceId"
        WHERE b."organizationId" = ${organizationId}
          AND b."contactId" IS NOT NULL
          AND b.status = 'CONFIRMED'
          AND b.outcome = 'ATTENDED'
          AND b."startAt" >= ${ts(from)}
          AND b."startAt" < ${ts(to)}`;
}

/** Did contact `c` pay or come before `from`, ever? */
function cameBeforeSql(organizationId: string, from: Date): Prisma.Sql {
    return Prisma.sql`(
        EXISTS (
            SELECT 1 FROM "CustomerIdentityLink" el
            JOIN "Order" eo ON eo."customerId" = el."customerId"
            WHERE el."contactId" = a."contactId"
              AND el."organizationId" = ${organizationId}
              AND eo."organizationId" = ${organizationId}
              AND eo."paymentStatus" IN ('PAID', 'REFUNDED')
              AND COALESCE(eo."paidAt", eo."createdAt") < ${ts(from)}
        )
        OR ${paidOnInvoiceSql(organizationId, Prisma.sql`a."contactId"`, ts(from))}
        OR EXISTS (
            SELECT 1 FROM "Booking" eb
            WHERE eb."contactId" = a."contactId"
              AND eb."organizationId" = ${organizationId}
              AND eb.status = 'CONFIRMED'
              AND eb.outcome = 'ATTENDED'
              AND eb."startAt" < ${ts(from)}
        )
    )`;
}

/**
 * The best customers of `[from, to)`: one row per person (a contact, never
 * a merge's tombstone or a removed one), ranked by what they paid in
 * `currency` when `byMoney`, else by how often they paid or came; the top
 * `limit`, each carrying `total` (everyone who paid or came) and
 * `cameBack` (of them, who had before).
 */
export function bestCustomersSql(
    organizationId: string,
    currency: string | null,
    from: Date,
    to: Date,
    opts: { byMoney: boolean; limit: number },
): Prisma.Sql {
    const visits = Prisma.sql`(a.orders + a.bills + a.classes + a.bookings)`;
    const rank = opts.byMoney
        ? Prisma.sql`COALESCE(a.amount, 0) DESC, ${visits} DESC`
        : Prisma.sql`${visits} DESC`;
    return Prisma.sql`
        WITH did AS (${didSql(organizationId, from, to)}),
        a AS (
            SELECT d."contactId",
                SUM(d.amount) FILTER (WHERE d.currency = ${currency}::text) AS amount,
                (COUNT(*) FILTER (WHERE d.kind = 'ORDER'))::int AS orders,
                (COUNT(*) FILTER (WHERE d.kind = 'ORDER' AND d.delivery))::int AS deliveries,
                (COUNT(*) FILTER (WHERE d.kind = 'BILL'))::int AS bills,
                (COUNT(*) FILTER (WHERE d.kind = 'CLASS'))::int AS classes,
                (COUNT(*) FILTER (WHERE d.kind = 'BOOKING'))::int AS bookings,
                COALESCE(BOOL_OR(d.online), FALSE) AS online,
                COALESCE(BOOL_OR(NOT d.online), FALSE) AS "inStore"
            FROM did d
            GROUP BY d."contactId"
        ),
        people AS (
            SELECT a.*, c."firstName", c."lastName", c.email, c.company,
                ${cameBeforeSql(organizationId, from)} AS came_before
            FROM a
            JOIN "Contact" c ON c.id = a."contactId"
            WHERE c."organizationId" = ${organizationId}
              AND ${notRetired("c")}
        )
        SELECT a."contactId", a."firstName", a."lastName", a.email, a.company,
            a.amount, a.orders, a.deliveries, a.bills, a.classes, a.bookings,
            a.online, a."inStore",
            (COUNT(*) OVER ())::int AS total,
            (COUNT(*) FILTER (WHERE a.came_before) OVER ())::int AS "cameBack"
        FROM people a
        ORDER BY ${rank}, a."contactId"
        LIMIT ${opts.limit}`;
}

/**
 * What each of `contactIds` bought or booked most in `[from, to)`: the
 * product with most units on their paid orders, or the service they came
 * to most, whichever is more (a product on a tie). `contactId`, `name`.
 */
export function buysMostSql(
    organizationId: string,
    contactIds: readonly string[],
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT DISTINCT ON (t."contactId") t."contactId", t.name
        FROM (
            SELECT l."contactId", p.name, SUM(oi.quantity)::int AS n, 0 AS pref
            FROM "CustomerIdentityLink" l
            JOIN "Order" o ON o."customerId" = l."customerId"
            JOIN "OrderItem" oi ON oi."orderId" = o.id
            JOIN "Product" p ON p.id = oi."productId"
            WHERE l."organizationId" = ${organizationId}
              AND l."contactId" = ANY(${[...contactIds]}::text[])
              AND o."organizationId" = ${organizationId}
              AND o."paymentStatus" = 'PAID'
              AND ${ORDER_PAID_AT} >= ${ts(from)}
              AND ${ORDER_PAID_AT} < ${ts(to)}
            GROUP BY l."contactId", p.name
            UNION ALL
            SELECT b."contactId", s.name, COUNT(*)::int, 1
            FROM "Booking" b
            JOIN "Service" s ON s.id = b."serviceId"
            WHERE b."organizationId" = ${organizationId}
              AND b."contactId" = ANY(${[...contactIds]}::text[])
              AND b.status = 'CONFIRMED'
              AND b.outcome = 'ATTENDED'
              AND b."startAt" >= ${ts(from)}
              AND b."startAt" < ${ts(to)}
            GROUP BY b."contactId", s.name
        ) t
        ORDER BY t."contactId", t.n DESC, t.pref, t.name`;
}
