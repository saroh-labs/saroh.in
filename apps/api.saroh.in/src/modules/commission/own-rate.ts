import type { Prisma } from "@saroh/database";

import type { LineStatus } from "./commission-rules";
import { commissionPaise, refundSignal, splitEvenly } from "./commission-rules";
import {
    heldInTx,
    invoiceLockKey,
    LINE_NOTES,
    lockKeyInTx,
    refundsInTx,
    statementMonthInTx,
} from "./commission-settle";
import { backPayStatus, isLegalBackPay } from "./own-rate-rules";

type Tx = Prisma.TransactionClient;

/**
 * A business's own commission rate in the database (DEC-169, #1035): its
 * first paid plan (the floor for "Earns from"), and the back-pay that
 * saving one makes, worked out (the dry run) and applied (the save).
 * Callers check who may; the save holds `commission-business-rate:<org>`,
 * which every payment's settle takes first, so nothing of the business's
 * is settled while it back-pays.
 */

/**
 * The business's first paid plan: when its first Saroh payment with an
 * amount before GST cleared (the earliest `SarohInvoice.issuedAt` with
 * `taxablePaise > 0`). A commission line is dated by that same moment and
 * written only for such a payment, so no line is ever earlier. Null when
 * it has paid for nothing yet (a free month or a trial is not a paid plan).
 */
export async function firstPaidAtInTx(
    tx: Pick<Tx, "sarohInvoice">,
    organizationId: string,
): Promise<Date | null> {
    const first = await tx.sarohInvoice.findFirst({
        where: { organizationId, taxablePaise: { gt: 0 } },
        orderBy: { issuedAt: "asc" },
        select: { issuedAt: true },
    });
    return first?.issuedAt ?? null;
}

/** One payment an own rate would price, with where each of its lines goes. */
export interface BackPayPayment {
    sarohInvoiceId: string;
    issuedAt: Date;
    amountPaise: number;
    lines: {
        id: string;
        installment: number;
        amountPaise: number;
        periodEnd: Date;
        to: LineStatus;
    }[];
}

export interface BackPayPlan {
    /** NO_RATE payments in the window it prices. */
    payments: BackPayPayment[];
    /** What they earn together, in paise. */
    amountPaise: number;
    /** Payments in the window a general rate priced already: left as they are. */
    alreadyPriced: number;
}

/**
 * What saving an own rate would back-pay: the manager's payments from the
 * business made in [from, until) whose lines are all NO_RATE, each priced
 * at `basisPoints` as a fresh line would be (`commissionPaise` on the
 * payment before GST, split evenly over a year's twelve parts) and moved on
 * by `backPayStatus`. A refunded payment stays NO_RATE; a line a general
 * rate priced, or one PAID or CANCELLED, is never touched. Writes nothing.
 */
export async function planBackPayInTx(
    tx: Tx,
    input: {
        organizationId: string;
        platformAdminId: string;
        basisPoints: number;
        from: Date;
        until: Date | null;
    },
    now: Date,
): Promise<BackPayPlan> {
    const invoices = await tx.sarohInvoice.findMany({
        where: {
            organizationId: input.organizationId,
            taxablePaise: { gt: 0 },
            issuedAt: {
                gte: input.from,
                ...(input.until ? { lt: input.until } : {}),
            },
        },
        orderBy: { issuedAt: "asc" },
        select: {
            id: true,
            issuedAt: true,
            provider: true,
            providerPaymentId: true,
            taxablePaise: true,
            totalPaise: true,
            providerAmountPaise: true,
        },
    });
    const lines = invoices.length
        ? await tx.commissionLine.findMany({
              where: {
                  sarohInvoiceId: { in: invoices.map((i) => i.id) },
                  platformAdminId: input.platformAdminId,
              },
              orderBy: { installment: "asc" },
          })
        : [];

    const plan: BackPayPlan = {
        payments: [],
        amountPaise: 0,
        alreadyPriced: 0,
    };
    for (const invoice of invoices) {
        const mine = lines.filter((l) => l.sarohInvoiceId === invoice.id);
        if (mine.length === 0) continue;
        if (!mine.every((l) => l.status === "NO_RATE")) {
            if (mine.some((l) => l.basisPoints !== null)) {
                plan.alreadyPriced += 1;
            }
            continue;
        }
        const refund = refundSignal(await refundsInTx(tx, invoice));
        const held = await heldInTx(tx, invoice);
        const parts = mine[0].installments;
        const total = commissionPaise(invoice.taxablePaise, input.basisPoints);
        const shares = splitEvenly(total, parts);
        const priced: BackPayPayment["lines"] = [];
        for (const line of mine) {
            const to = backPayStatus({
                refund,
                held,
                periodEnded: line.periodEnd.getTime() <= now.getTime(),
            });
            if (!to) break;
            priced.push({
                id: line.id,
                installment: line.installment,
                amountPaise: shares[line.installment - 1] ?? 0,
                periodEnd: line.periodEnd,
                to,
            });
        }
        if (priced.length !== mine.length) continue;
        plan.payments.push({
            sarohInvoiceId: invoice.id,
            issuedAt: invoice.issuedAt,
            amountPaise: priced.reduce((t, l) => t + l.amountPaise, 0),
            lines: priced,
        });
    }
    plan.amountPaise = plan.payments.reduce((t, p) => t + p.amountPaise, 0);
    return plan;
}

/**
 * Back-pay at a just-saved own rate: the only way a NO_RATE line is ever
 * priced. Each payment under its invoice's lock, each line only while it
 * is still NO_RATE (`isLegalBackPay`), so a second save prices nothing
 * twice. A line that becomes PAYABLE goes in the statement of the month
 * its period ended, or the first one after it not yet paid. The caller
 * holds the business's lock, in the same transaction as the rate's row.
 */
export async function applyBackPayInTx(
    tx: Tx,
    rate: {
        id: string;
        organizationId: string;
        platformAdminId: string;
        basisPoints: number;
        earnsFrom: Date;
        until: Date | null;
    },
    now: Date,
): Promise<{ payments: number; lines: number; amountPaise: number }> {
    const plan = await planBackPayInTx(
        tx,
        {
            organizationId: rate.organizationId,
            platformAdminId: rate.platformAdminId,
            basisPoints: rate.basisPoints,
            from: rate.earnsFrom,
            until: rate.until,
        },
        now,
    );
    let payments = 0;
    let moved = 0;
    let amountPaise = 0;
    for (const payment of plan.payments) {
        await lockKeyInTx(tx, invoiceLockKey(payment.sarohInvoiceId));
        let priced = 0;
        for (const line of payment.lines) {
            if (!isLegalBackPay("NO_RATE", line.to)) continue;
            const statementMonth =
                line.to === "PAYABLE"
                    ? await statementMonthInTx(
                          tx,
                          rate.platformAdminId,
                          line.periodEnd,
                      )
                    : null;
            const { count } = await tx.commissionLine.updateMany({
                where: { id: line.id, status: "NO_RATE" },
                data: {
                    status: line.to,
                    businessRateId: rate.id,
                    basisPoints: rate.basisPoints,
                    amountPaise: line.amountPaise,
                    statementMonth,
                    note: LINE_NOTES[line.to] ?? null,
                },
            });
            if (count === 1) {
                priced += 1;
                amountPaise += line.amountPaise;
            }
        }
        moved += priced;
        if (priced > 0) payments += 1;
    }
    return { payments, lines: moved, amountPaise };
}
