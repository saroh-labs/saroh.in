import { Prisma } from "@saroh/database";

import {
    invoiceCreditedSql,
    orderRefundedSql,
    PAID_NON_ORDER_INVOICE,
} from "../customer-workspace/spent.sql";
import { ts } from "../orders/order-list-filters";
import { INVOICES_PLACE, ONLINE_PLACE } from "./takings";

/**
 * Insights' takings as SQL (`takings.ts` has the rule in words). Pure:
 * builds `Prisma.Sql`, runs nothing. The refunds and credit notes come
 * from Customers' "Spent" (`spent.sql.ts`), so the two never disagree on
 * what a sale kept.
 */

/** When an order's money was taken: when it was paid, else when placed. */
const ORDER_PAID_AT = Prisma.sql`COALESCE(o."paidAt", o."createdAt")`;

/**
 * Every sale paid in `[from, to)` (bound as the UTC wall-clock, `ts`): `at`, `place`, `currency`, `amount` (net,
 * major units), `orders` (1 for an order), one row per sale.
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
        SELECT i."paidAt" AS at, ${INVOICES_PLACE}::text AS place, i.currency,
            GREATEST(i.total - ${invoiceCreditedSql(organizationId)}, 0) AS amount,
            0 AS orders
        FROM "Invoice" i
        WHERE i."organizationId" = ${organizationId}
          AND ${PAID_NON_ORDER_INVOICE}
          AND i."paidAt" >= ${ts(from)}
          AND i."paidAt" < ${ts(to)}`;
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
 * an invoice that is not an order's paid), in `zone`; null for none.
 */
export function firstSaleSql(organizationId: string, zone: string): Prisma.Sql {
    return Prisma.sql`
        SELECT to_char((MIN(s.at) AT TIME ZONE 'UTC') AT TIME ZONE ${zone}::text, 'YYYY-MM-DD') AS day
        FROM (
            SELECT MIN(${ORDER_PAID_AT}) AS at FROM "Order" o
            WHERE o."organizationId" = ${organizationId}
              AND o."paymentStatus" IN ('PAID', 'REFUNDED')
            UNION ALL
            SELECT MIN(i."paidAt") FROM "Invoice" i
            WHERE i."organizationId" = ${organizationId}
              AND i."orderId" IS NULL AND i.kind <> 'CREDIT_NOTE'
              AND i."paidAt" IS NOT NULL
        ) s`;
}
