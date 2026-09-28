import { Prisma } from "@saroh/database";

/**
 * "Spent" as SQL (R4, ADR-008, overview default 20): what a customer paid
 * and kept paid — paid orders, delivery included, and paid invoices that are
 * not an order's own, each net of what went back to them. Pure: builds
 * `Prisma.Sql`, runs nothing. The Customers list (`customers-list.sql.ts`)
 * and Customer Detail (`customer-spent.ts`) read the same rows, and
 * `customers-list.db.spec.ts` holds the two to one figure.
 *
 * Each rupee once:
 * - **An order** counts its total less the refunds handed back on it (C14):
 *   every refund that has not failed (pending or settled, as Order Detail's
 *   "Refunded" says) on a payment that succeeded — the order's own, or a
 *   treatment's payment at booking (E9). Money handed back because the order
 *   was edited down (`forEdit`) is left alone: the order's total already
 *   dropped by it. A refunded order (`REFUNDED`) gave everything back and is
 *   not counted at all.
 * - **An invoice** that is not an order's own counts its total less its
 *   credit notes (ADR-008): a refund of its payment writes one, and so does
 *   money handed back by hand. A draft or void credit note gave nothing back.
 *
 * Never below zero: a figure is what they paid, not what they are owed.
 */

/**
 * A paid invoice that is not an order's own and not a credit note
 * (`invoice-state.ts` `OWED_WHERE`): the order already counts that money, so
 * a sum that took the order's invoice too would count each rupee twice.
 */
export const PAID_NON_ORDER_INVOICE = Prisma.sql`(i.status = 'PAID' AND i."orderId" IS NULL AND i.kind <> 'CREDIT_NOTE')`;

/** Refunds that took money back from order `o`, in major units. */
function orderRefundedSql(organizationId: string): Prisma.Sql {
    return Prisma.sql`COALESCE((
            SELECT SUM(pr."amountCents")::numeric / 100
            FROM "PaymentRefund" pr
            JOIN "PaymentIntent" pi ON pi.id = pr."paymentIntentId"
            WHERE pr."organizationId" = ${organizationId}
              AND pr.status <> 'FAILED'
              AND NOT pr."forEdit"
              AND pi.status = 'SUCCEEDED'
              AND (
                pi."orderId" = o.id
                OR pi."invoiceId" IN (
                    SELECT bi.id FROM "Invoice" bi
                    WHERE bi."orderId" = o.id
                      AND bi.source = 'BOOKING'
                      AND bi.kind = 'INVOICE'
                )
              )
        ), 0)`;
}

/** Credit notes that corrected invoice `i`, in major units. */
function invoiceCreditedSql(organizationId: string): Prisma.Sql {
    return Prisma.sql`COALESCE((
            SELECT SUM(cn.total)
            FROM "Invoice" cn
            WHERE cn."organizationId" = ${organizationId}
              AND cn."relatedInvoiceId" = i.id
              AND cn.kind = 'CREDIT_NOTE'
              AND cn.status NOT IN ('DRAFT', 'VOID')
        ), 0)`;
}

/**
 * One row per paid order, net of its refunds: `contactId`, `currency`,
 * `amount`. Through the store customers linked to the contact.
 */
export function spentOrderRowsSql(
    organizationId: string,
    contactIds?: readonly string[],
): Prisma.Sql {
    const onlyLinks = contactIds
        ? Prisma.sql`AND l."contactId" = ANY(${[...contactIds]}::text[])`
        : Prisma.empty;
    return Prisma.sql`
        SELECT l."contactId", o.currency,
            GREATEST(o.total - ${orderRefundedSql(organizationId)}, 0) AS amount
        FROM "CustomerIdentityLink" l
        JOIN "Order" o ON o."customerId" = l."customerId"
        WHERE l."organizationId" = ${organizationId} ${onlyLinks}
          AND o."organizationId" = ${organizationId}
          AND o."paymentStatus" = 'PAID'`;
}

/**
 * One row per paid invoice that is not an order's own, net of its credit
 * notes: `contactId`, `currency`, `amount`.
 */
export function spentInvoiceRowsSql(
    organizationId: string,
    contactIds?: readonly string[],
): Prisma.Sql {
    const onlyInvoices = contactIds
        ? Prisma.sql`AND i."contactId" = ANY(${[...contactIds]}::text[])`
        : Prisma.empty;
    return Prisma.sql`
        SELECT i."contactId", i.currency,
            GREATEST(i.total - ${invoiceCreditedSql(organizationId)}, 0) AS amount
        FROM "Invoice" i
        WHERE i."organizationId" = ${organizationId}
          AND i."contactId" IS NOT NULL ${onlyInvoices}
          AND ${PAID_NON_ORDER_INVOICE}`;
}

/**
 * Both, one row per payment; callers sum it per contact and currency.
 */
export function spentRowsSql(
    organizationId: string,
    contactIds?: readonly string[],
): Prisma.Sql {
    return Prisma.sql`${spentOrderRowsSql(organizationId, contactIds)}
        UNION ALL
        ${spentInvoiceRowsSql(organizationId, contactIds)}`;
}
