import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import { LIVE_PAYMENT_WHERE, NOT_A_BOOKING_HOLD } from "./invoice-state";

/**
 * "Money in" (DEC-173): the one rule for when money came in and how much,
 * read by the Invoices money strip (Paid this month), Home (Money in
 * today, This week, How it's going, since you were last here) and
 * Insights' takings. Each rupee once, on the day it came in:
 *
 * - **Paper that isn't an order's** (an invoice written by hand, a
 *   booking's, a plan's, a pack's, a course's, and their supplementary
 *   invoices) counts its **ledger**: every payment that counts
 *   (`LIVE_PAYMENT_WHERE`: not removed, not a bounced cheque; a cheque
 *   waiting for the bank counts as received), on its `receivedAt`. A part
 *   payment counts on the day it came in, a bounced or removed payment
 *   stops counting wherever it fell, and a payment back-dated by the
 *   merchant counts on the day they gave.
 * - **An order's paper** (its invoice and the corrections to it) has no
 *   ledger rows: the order is its ledger (ADR-008). It counts its total on
 *   the day it was paid (`paidAt`).
 * - **Never** a credit note, nor a pay-now hold's or an online pack's or
 *   plan's draft that isn't numbered yet (`NOT_A_BOOKING_HOLD`).
 *
 * Money handed back is not part of this rule; each surface keeps its own
 * reading of refunds, as DEC-173 records: the strip is money received,
 * Home takes a refund off on the day its credit note was issued, Insights
 * takes it off the sale it gave money back on.
 *
 * The rule is written twice, once for Prisma (`moneyInPaymentWhere`,
 * `orderPaperPaidWhere`) and once for SQL (`moneyInPaymentSql`), and
 * `money-in.db.spec.ts` pins the strip, Home and Insights to the same
 * figure, so the two can't drift.
 */

type Db = typeof prisma;

/** A window `[from, to)`; no `to` reads to the end of time. */
function between(from: Date, to?: Date) {
    return { gte: from, ...(to ? { lt: to } : {}) };
}

/** The paper whose ledger counts: not an order's, not a credit note, not a hold. */
export const LEDGER_PAPER_WHERE = {
    orderId: null,
    kind: { not: "CREDIT_NOTE" },
    ...NOT_A_BOOKING_HOLD,
} satisfies Prisma.InvoiceWhereInput;

/** The ledger payments that came in during `[from, to)`. */
export function moneyInPaymentWhere(
    organizationId: string,
    from: Date,
    to?: Date,
): Prisma.InvoicePaymentWhereInput {
    return {
        organizationId,
        ...LIVE_PAYMENT_WHERE,
        receivedAt: between(from, to),
        invoice: LEDGER_PAPER_WHERE,
    };
}

/** An order's paper paid during `[from, to)`: the order is its ledger. */
export function orderPaperPaidWhere(
    organizationId: string,
    from: Date,
    to?: Date,
): Prisma.InvoiceWhereInput {
    return {
        organizationId,
        orderId: { not: null },
        kind: { not: "CREDIT_NOTE" },
        paidAt: between(from, to),
    };
}

/**
 * The invoices money came in on from `since`, as the Invoices list's
 * `?paidSince=` and `?paidFrom=` find them: a payment that counts received
 * since, or an order's paper paid since. Its own `OR`, so a caller ANDs it.
 */
export function moneyInSinceWhere(since: Date): Prisma.InvoiceWhereInput {
    return {
        kind: { not: "CREDIT_NOTE" },
        OR: [
            {
                orderId: null,
                payments: {
                    some: { ...LIVE_PAYMENT_WHERE, receivedAt: { gte: since } },
                },
            },
            { orderId: { not: null }, paidAt: { gte: since } },
        ],
    };
}

/**
 * The SQL form of a ledger payment that counts, over `"InvoicePayment" p`
 * joined to its `"Invoice" i`: `LIVE_PAYMENT_WHERE` and
 * `LEDGER_PAPER_WHERE`. Insights' takings read it. A function, so a spec
 * that mocks `@saroh/database` can still import this file.
 */
export const moneyInPaymentSql = (): Prisma.Sql => Prisma.sql`(
    p."removedAt" IS NULL
    AND (p."bankStatus" IS NULL OR p."bankStatus" <> 'BOUNCED')
    AND i."orderId" IS NULL
    AND i.kind <> 'CREDIT_NOTE'
    AND NOT (i.source IN ('BOOKING', 'PACK', 'SUBSCRIPTION') AND i.number IS NULL)
)`;

/** Money in during one window, per currency, in minor units. */
export interface MoneyIn {
    /** Per currency: what came in. */
    totals: Map<string, number>;
    /** Per currency: how many payments brought it (an order's paper is one). */
    payments: Map<string, number>;
    /** The invoices it came in on. */
    invoiceIds: Set<string>;
}

function add(by: Map<string, number>, currency: string, n: number) {
    by.set(currency, (by.get(currency) ?? 0) + n);
}

/** Money in during `[from, to)` by the rule above. */
export async function readMoneyIn(
    db: Db,
    organizationId: string,
    from: Date,
    to?: Date,
): Promise<MoneyIn> {
    const [ledger, orderPaper] = await Promise.all([
        db.invoicePayment.groupBy({
            by: ["invoiceId", "currency"],
            where: moneyInPaymentWhere(organizationId, from, to),
            _sum: { amountCents: true },
            _count: { _all: true },
            orderBy: [{ invoiceId: "asc" }, { currency: "asc" }],
        }),
        db.invoice.findMany({
            where: orderPaperPaidWhere(organizationId, from, to),
            select: { id: true, currency: true, total: true },
        }),
    ]);
    const out: MoneyIn = {
        totals: new Map(),
        payments: new Map(),
        invoiceIds: new Set(),
    };
    for (const row of ledger) {
        add(out.totals, row.currency, row._sum.amountCents ?? 0);
        add(out.payments, row.currency, row._count._all);
        out.invoiceIds.add(row.invoiceId);
    }
    for (const inv of orderPaper) {
        add(out.totals, inv.currency, toMinor(inv.total));
        add(out.payments, inv.currency, 1);
        out.invoiceIds.add(inv.id);
    }
    return out;
}
