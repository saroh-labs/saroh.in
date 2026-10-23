import { Prisma } from "@saroh/database";

import {
    invoiceCreditedSql,
    orderRefundedSql,
} from "../customer-workspace/spent.sql";
import { moneyInPaymentSql } from "../invoices/money-in";
import { ts } from "../orders/order-list-filters";
import { INVOICES_PLACE, ONLINE_PLACE } from "./takings";

/**
 * Insights' takings as SQL (`takings.ts` has the rule in words). Pure:
 * builds `Prisma.Sql`, runs nothing. Money in is the one rule the Invoices
 * strip and Home read (`invoices/money-in.ts`, DEC-173): an invoice that
 * isn't an order's counts each payment on its ledger on the day it came
 * in. The refunds and credit notes come from Customers' "Spent"
 * (`spent.sql.ts`), so the two never disagree on what a sale kept.
 */

/**
 * One row per ledger payment that counts (`moneyInPaymentSql`) on an
 * invoice with a payment in `[from, to)`: `at` (`receivedAt`),
 * `currency`, and `amount` in major units, net of the invoice's credit
 * notes. A credit note takes money off the latest payments first, so an
 * invoice paid at once is netted as before the ledger, and a refund never
 * makes a payment read below zero. Every payment of the invoice is read,
 * so the netting sees them all; the caller keeps the window's.
 */
function ledgerPaymentsSql(
    organizationId: string,
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT p."receivedAt" AS at, p.currency,
            GREATEST(
                p."amountCents" - GREATEST(
                    ROUND(${invoiceCreditedSql(organizationId)} * 100)
                    - COALESCE(SUM(p."amountCents") OVER (
                        PARTITION BY p."invoiceId"
                        ORDER BY p."receivedAt" DESC, p.id DESC
                        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ), 0),
                    0
                ),
                0
            )::numeric / 100 AS amount
        FROM "InvoicePayment" p
        JOIN "Invoice" i ON i.id = p."invoiceId"
        WHERE p."organizationId" = ${organizationId}
          AND i."organizationId" = ${organizationId}
          AND ${moneyInPaymentSql()}
          AND p."invoiceId" IN (
            SELECT q."invoiceId" FROM "InvoicePayment" q
            WHERE q."organizationId" = ${organizationId}
              AND q."receivedAt" >= ${ts(from)}
              AND q."receivedAt" < ${ts(to)}
          )`;
}

/** When an order's money was taken: when it was paid, else when placed. */
const ORDER_PAID_AT = Prisma.sql`COALESCE(o."paidAt", o."createdAt")`;

/**
 * Every sale paid in `[from, to)` (bound as the UTC wall-clock, `ts`):
 * `at`, `place`, `currency`, `amount` (net, major units), `orders` (1 for
 * an order), one row per paid order and per invoice payment.
 */
function salesSql(organizationId: string, from: Date, to: Date): Prisma.Sql {
    return Prisma.sql`
        SELECT ${ORDER_PAID_AT} AS at,
            CASE WHEN o."placedOnline" THEN ${ONLINE_PLACE}::text
                ELSE 'location:' || o."storeId" END AS place,
            o.currency,
            GREATEST(o.total - ${orderRefundedSql(organizationId)}, 0) AS amount,
            1 AS orders
        FROM "Order" o
        WHERE o."organizationId" = ${organizationId}
          AND o."paymentStatus" = 'PAID'
          AND ${ORDER_PAID_AT} >= ${ts(from)}
          AND ${ORDER_PAID_AT} < ${ts(to)}
        UNION ALL
        SELECT x.at, ${INVOICES_PLACE}::text AS place, x.currency, x.amount,
            0 AS orders
        FROM (${ledgerPaymentsSql(organizationId, from, to)}) x
        WHERE x.at >= ${ts(from)}
          AND x.at < ${ts(to)}
          AND x.amount > 0`;
}

/**
 * The sales of `[from, to)` summed per day in `zone`, place and currency:
 * `day`, `place`, `currency`, `amount`, `orders`, `payments`. The columns
 * are timestamp-without-timezone holding UTC (DEV_LEARNINGS), so each is
 * read as UTC before it is put in the business's zone.
 */
export function takingsByDaySql(
    organizationId: string,
    zone: string,
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT to_char((s.at AT TIME ZONE 'UTC') AT TIME ZONE ${zone}::text, 'YYYY-MM-DD') AS day,
            s.place, s.currency,
            SUM(s.amount) AS amount,
            SUM(s.orders)::int AS orders,
            COUNT(*)::int AS payments
        FROM (${salesSql(organizationId, from, to)}) s
        GROUP BY 1, 2, 3`;
}

/**
 * The business's date of the first money it ever took (an order paid, or
 * a payment that counts on an invoice that is not an order's, by the
 * money-in rule), in `zone`; null for none.
 */
export function firstSaleSql(organizationId: string, zone: string): Prisma.Sql {
    return Prisma.sql`
        SELECT to_char((MIN(s.at) AT TIME ZONE 'UTC') AT TIME ZONE ${zone}::text, 'YYYY-MM-DD') AS day
        FROM (
            SELECT MIN(${ORDER_PAID_AT}) AS at FROM "Order" o
            WHERE o."organizationId" = ${organizationId}
              AND o."paymentStatus" IN ('PAID', 'REFUNDED')
            UNION ALL
            SELECT MIN(p."receivedAt") FROM "InvoicePayment" p
            JOIN "Invoice" i ON i.id = p."invoiceId"
            WHERE p."organizationId" = ${organizationId}
              AND i."organizationId" = ${organizationId}
              AND ${moneyInPaymentSql()}
        ) s`;
}

/**
 * What an order usually comes to (Insights' Money tile, DEC-171): the
 * middle paid order, net of refunds, per currency, in the period
 * `[from, to)` and the one before it `[beforeFrom, from)`. The median, not
 * the mean: one big order does not make "usually" untrue. `window` is
 * PERIOD or BEFORE; `amount` in major units; `orders` how many.
 */
export function usualOrderSql(
    organizationId: string,
    beforeFrom: Date,
    from: Date,
    to: Date,
): Prisma.Sql {
    return Prisma.sql`
        SELECT CASE WHEN s.at >= ${ts(from)} THEN 'PERIOD' ELSE 'BEFORE' END AS window,
            s.currency,
            percentile_disc(0.5) WITHIN GROUP (ORDER BY s.amount) AS amount,
            COUNT(*)::int AS orders
        FROM (${salesSql(organizationId, beforeFrom, to)}) s
        WHERE s.orders = 1
        GROUP BY 1, 2`;
}
