import { Prisma } from "@saroh/database";

import { moneyInPaymentSql } from "../invoices/money-in";

/**
 * "Spent" as SQL (R4, ADR-008, overview default 20): what a customer paid
 * and kept paid — paid orders, delivery included, and the payments on
 * invoices that are not an order's own, each net of what went back to them. Pure: builds
 * `Prisma.Sql`, runs nothing. The Customers list (`customers-list.sql.ts`)
 * and Customer Detail (`customer-spent.ts`) read the same rows, and
 * `customers-list.db.spec.ts` holds the two to one figure;
 * `customer-spent.money-in.db.spec.ts` holds Spent to the money-in rule.
 *
 * Each rupee once:
 * - **An order** counts its total less the refunds handed back on it (C14):
 *   every refund that has not failed (pending or settled, as Order Detail's
 *   "Refunded" says) on a payment that succeeded — the order's own, or a
 *   treatment's payment at booking (E9). Money handed back because the order
 *   was edited down (`forEdit`) is left alone: the order's total already
 *   dropped by it. Part of it recorded as handed back by hand
 *   (`refundedByHand`, #865) comes off too. A refunded order (`REFUNDED`)
 *   gave everything back and is not counted at all.
 * - **An invoice** that is not an order's own counts its **ledger**, by the
 *   money-in rule (DEC-173, `invoices/money-in.ts`): every payment that
 *   counts (not removed, not a bounced cheque; a cheque waiting for the
 *   bank counts), less its credit notes (ADR-008): a refund of its payment
 *   writes one, and so does money handed back by hand. A draft or void
 *   credit note gave nothing back. So ₹4,000 paid on an ₹8,400 bill is
 *   ₹4,000 spent, and a bounced cheque on a paid bill takes only the
 *   cheque out, never the whole bill. Its status is never read: PAID is
 *   only "the ledger covers the total".
 *
 * Never below zero: a figure is what they paid, not what they are owed.
 */

/**
 * Refunds that took money back from order `o`, in major units: online ones
 * and what was recorded as handed back by hand (`refundedByHand`, #865).
 * Insights' takings (`analytics/takings.sql.ts`) take them off by the same
 * rule.
 */
export function orderRefundedSql(organizationId: string): Prisma.Sql {
    return Prisma.sql`(o."refundedByHand" + COALESCE((
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
        ), 0))`;
}

/** Credit notes that corrected invoice `i`, in major units. Takings too. */
export function invoiceCreditedSql(organizationId: string): Prisma.Sql {
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
 * One row per ledger payment that counts (`moneyInPaymentSql`) on an
 * invoice billed to a contact: `invoiceId`, `contactId`, `currency`, `at`
 * (`receivedAt`) and `amount` in major units, net of the invoice's credit
 * notes. A credit note takes money off the latest payments first, as
 * Insights' takings net it (`analytics/takings.sql.ts`), so a refund never
 * makes a payment read below zero and an invoice's rows sum to what was
 * paid less what was credited, never below zero.
 *
 * `paidIn` keeps only the invoices with a payment received in `[from, to)`
 * (every payment of each is still read, so the netting sees them all; the
 * caller keeps the window's).
 */
export function spentLedgerRowsSql(
    organizationId: string,
    opts: {
        contactIds?: readonly string[];
        paidIn?: { from: Prisma.Sql; to: Prisma.Sql };
    } = {},
): Prisma.Sql {
    const onlyContacts = opts.contactIds
        ? Prisma.sql`AND i."contactId" = ANY(${[...opts.contactIds]}::text[])`
        : Prisma.empty;
    const onlyPaidIn = opts.paidIn
        ? Prisma.sql`AND p."invoiceId" IN (
            SELECT q."invoiceId" FROM "InvoicePayment" q
            WHERE q."organizationId" = ${organizationId}
              AND q."receivedAt" >= ${opts.paidIn.from}
              AND q."receivedAt" < ${opts.paidIn.to}
          )`
        : Prisma.empty;
    return Prisma.sql`
        SELECT p."invoiceId", i."contactId", i.currency, p."receivedAt" AS at,
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
          AND i."contactId" IS NOT NULL ${onlyContacts}
          AND ${moneyInPaymentSql()} ${onlyPaidIn}`;
}

/**
 * One row per invoice that is not an order's own and has money in on its
 * ledger, net of its credit notes: `contactId`, `currency`, `amount`.
 */
export function spentInvoiceRowsSql(
    organizationId: string,
    contactIds?: readonly string[],
): Prisma.Sql {
    return Prisma.sql`
        SELECT x."contactId", x.currency, SUM(x.amount) AS amount
        FROM (${spentLedgerRowsSql(organizationId, { contactIds })}) x
        GROUP BY x."invoiceId", x."contactId", x.currency`;
}

/**
 * The SQL form of "this contact has paid on an invoice": a ledger payment
 * that counts on an invoice that is not an order's own, billed to
 * `contact` (a column), received before `before` when given. For the
 * Customers list's "who is a customer" and Insights' "came before".
 */
export function paidOnInvoiceSql(
    organizationId: string,
    contact: Prisma.Sql,
    before?: Prisma.Sql,
): Prisma.Sql {
    const onlyBefore = before
        ? Prisma.sql`AND p."receivedAt" < ${before}`
        : Prisma.empty;
    return Prisma.sql`EXISTS (
            SELECT 1 FROM "InvoicePayment" p
            JOIN "Invoice" i ON i.id = p."invoiceId"
            WHERE p."organizationId" = ${organizationId}
              AND i."organizationId" = ${organizationId}
              AND i."contactId" = ${contact}
              AND ${moneyInPaymentSql()} ${onlyBefore}
        )`;
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
