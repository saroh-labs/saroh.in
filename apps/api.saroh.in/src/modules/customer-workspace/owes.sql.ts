import { Prisma } from "@saroh/database";

/**
 * "Owes" as SQL (DEC-275): what a person has still to pay, the one rule the
 * Customers list, the customer's page and Contacts read, so the three never
 * disagree. Pure: builds `Prisma.Sql`, runs nothing.
 *
 * - **An order** that is real (never an abandoned online checkout, nor one
 *   to pay online now), not cancelled, and still UNPAID owes its total. A
 *   FAILED payment is left out: that is an online checkout that never took
 *   money, not a bill.
 * - **An invoice** that is not an order's own (the order is the ledger for
 *   its own payment, ADR-008), not a credit note, and ISSUED owes what is
 *   left to pay on it (`leftToPayCents`, DEC-173). Memberships, packs and
 *   bookings bill through invoices, so they are in here.
 *
 * Rows: `contactId`, `currency`, `amount` (major units), `part`.
 */
export function owesRowsSql(
    organizationId: string,
    opts: {
        contactIds?: readonly string[];
        /** Their orders' part: with `order:read` only. */
        orders: boolean;
        /** Their invoices' part: with `invoice:read` only. */
        invoices: boolean;
    },
): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (opts.orders) {
        const only = opts.contactIds
            ? Prisma.sql`AND l."contactId" = ANY(${[...opts.contactIds]}::text[])`
            : Prisma.empty;
        parts.push(Prisma.sql`
            SELECT l."contactId", o.currency, o.total AS amount, 'order' AS part
            FROM "CustomerIdentityLink" l
            JOIN "Order" o ON o."customerId" = l."customerId"
            WHERE l."organizationId" = ${organizationId} ${only}
              AND o."organizationId" = ${organizationId}
              AND ${unpaidOrderSql()}`);
    }
    if (opts.invoices) {
        const only = opts.contactIds
            ? Prisma.sql`AND i."contactId" = ANY(${[...opts.contactIds]}::text[])`
            : Prisma.empty;
        parts.push(Prisma.sql`
            SELECT i."contactId", i.currency,
                (ROUND(i.total * 100) - i."paidCents")::numeric / 100 AS amount,
                'invoice' AS part
            FROM "Invoice" i
            WHERE i."organizationId" = ${organizationId}
              AND i."contactId" IS NOT NULL ${only}
              AND i."orderId" IS NULL
              AND i.kind <> 'CREDIT_NOTE'
              AND i.status = 'ISSUED'
              AND ROUND(i.total * 100) - i."paidCents" > 0`);
    }
    if (parts.length === 0) {
        return Prisma.sql`SELECT NULL::text AS "contactId", NULL::text AS currency, NULL::numeric AS amount, NULL::text AS part WHERE FALSE`;
    }
    return Prisma.join(parts, " UNION ALL ");
}

/**
 * An order over the `o` alias that still owes its total: real, not
 * cancelled, unpaid. A store customer's own unpaid orders read it too
 * (the Customers list's unlinked payers).
 */
export function unpaidOrderSql(): Prisma.Sql {
    return Prisma.sql`(o."paymentStatus" = 'UNPAID'
        AND o.status <> 'CANCELLED'
        AND NOT (o."placedOnline" AND NOT o."payOnHandover"))`;
}
