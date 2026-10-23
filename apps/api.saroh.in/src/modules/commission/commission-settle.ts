import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { raiseBillingActionInTx } from "../billing/billing-actions";
import type { LineStatus, RateKind } from "./commission-rules";
import {
    commissionPaise,
    installmentEnds,
    installmentsOf,
    isLegalLineMove,
    monthBounds,
    monthOf,
    nextStatus,
    OPEN_STATUSES,
    refundAfterPayout,
    refundSignal,
    splitEvenly,
    statementMonthFor,
} from "./commission-rules";
import { ownRateCovers } from "./own-rate-rules";

type Tx = Prisma.TransactionClient;

/** The lock that serialises everything that writes one invoice's lines. */
export const invoiceLockKey = (sarohInvoiceId: string) =>
    `commission-invoice:${sarohInvoiceId}`;

/**
 * The lock that serialises a business's own rate with its payments' lines
 * (#1035): saving one back-pays under it, and a payment's lines are
 * written under it, so a payment is priced by the rate or back-paid by it,
 * never missed between the two. Always taken before the invoice's lock.
 */
export const businessRateLockKey = (organizationId: string) =>
    `commission-business-rate:${organizationId}`;

/**
 * The lock that serialises a teammate's statement: a line put in a month
 * and Mark paid locking that month.
 */
export const payoutLockKey = (platformAdminId: string) =>
    `commission-payout:${platformAdminId}`;

export async function lockKeyInTx(tx: Tx, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Why a payment made no line. */
export type NoLine =
    "gone" | "nothing-earned" | "no-manager" | "off-commission";

export interface Settled {
    /** Lines written now (0 when they existed already, or none are owed). */
    written: number;
    /** Lines that moved. */
    moved: number;
    /** Why no line was written, when none exists. */
    noLine?: NoLine;
}

interface InvoiceFacts {
    id: string;
    organizationId: string;
    number: string;
    provider: string;
    providerPaymentId: string | null;
    issuedAt: Date;
    cycle: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    taxablePaise: number;
    totalPaise: number;
    providerAmountPaise: number | null;
}

/**
 * The business's own rate pricing a payment its manager `platformAdminId`
 * earned at `at`, if one does (#1035).
 */
export async function ownRateForInTx(
    tx: Pick<Tx, "businessCommissionRate">,
    organizationId: string,
    platformAdminId: string,
    at: Date,
): Promise<{ id: string; basisPoints: number } | null> {
    const rates = await tx.businessCommissionRate.findMany({
        where: { organizationId, platformAdminId, earnsFrom: { lte: at } },
        orderBy: [{ earnsFrom: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            platformAdminId: true,
            basisPoints: true,
            earnsFrom: true,
            until: true,
        },
    });
    const own = rates.find((r) => ownRateCovers(r, platformAdminId, at));
    return own ? { id: own.id, basisPoints: own.basisPoints } : null;
}

/** The rate in force for `kind` at `at`, else the first one set after it. */
export async function rateForInTx(
    tx: Pick<Tx, "commissionRate">,
    kind: RateKind,
    at: Date,
): Promise<{ id: string; basisPoints: number } | null> {
    const inForce = await tx.commissionRate.findFirst({
        where: { kind, effectiveFrom: { lte: at } },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
        select: { id: true, basisPoints: true },
    });
    if (inForce) return inForce;
    return tx.commissionRate.findFirst({
        where: { kind, effectiveFrom: { gt: at } },
        orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
        select: { id: true, basisPoints: true },
    });
}

/** The business's link at the moment its payment cleared, if it had one. */
export async function linkAtInTx(
    tx: Pick<Tx, "accountManagerLink">,
    organizationId: string,
    at: Date,
) {
    return tx.accountManagerLink.findFirst({
        where: {
            organizationId,
            startedAt: { lte: at },
            OR: [{ endedAt: null }, { endedAt: { gt: at } }],
        },
        orderBy: { startedAt: "desc" },
        select: { id: true, platformAdminId: true, kind: true },
    });
}

/**
 * The link a payment's lines are written for (DEC-169, owner 19 Oct):
 * the link open when it cleared; else, when the business had no manager
 * then, the first link started later in the same month in India. "The
 * month counts": a manager who takes a business on earns that month's
 * payments, even one that came in earlier in it, and nothing from the
 * months before. A previous manager whose link was open at the payment
 * keeps it.
 */
export async function linkForPaymentInTx(
    tx: Pick<Tx, "accountManagerLink">,
    organizationId: string,
    at: Date,
) {
    const open = await linkAtInTx(tx, organizationId, at);
    if (open) return open;
    return tx.accountManagerLink.findFirst({
        where: {
            organizationId,
            startedAt: { gt: at, lt: monthBounds(monthOf(at)).to },
        },
        orderBy: { startedAt: "asc" },
        select: { id: true, platformAdminId: true, kind: true },
    });
}

/**
 * A manager just took the business on at `startedAt`: write the lines of
 * that month's earlier payments that have none, now theirs ("the month
 * counts"). Each through `settleInvoiceInTx`, so under the business's and
 * the invoice's locks and once: a payment with lines is left as it is.
 * Run in a short transaction of its own after the link committed (so the
 * link is what `linkForPaymentInTx` finds, and a failure here never undoes
 * the assignment; the sweep repairs it). Returns the lines written.
 */
export async function settleMonthBeforeLinkInTx(
    tx: Tx,
    logger: Pick<Logger, "warn">,
    organizationId: string,
    startedAt: Date,
    now: Date,
): Promise<number> {
    const invoices = await tx.sarohInvoice.findMany({
        where: {
            organizationId,
            taxablePaise: { gt: 0 },
            issuedAt: {
                gte: monthBounds(monthOf(startedAt)).from,
                lt: startedAt,
            },
        },
        orderBy: { issuedAt: "asc" },
        select: { id: true },
    });
    let written = 0;
    for (const invoice of invoices) {
        const lined = await tx.commissionLine.count({
            where: { sarohInvoiceId: invoice.id },
        });
        if (lined > 0) continue;
        written += (await settleInvoiceInTx(tx, logger, invoice.id, now))
            .written;
    }
    return written;
}

export async function refundsInTx(
    tx: Tx,
    invoice: Pick<InvoiceFacts, "id" | "provider" | "providerPaymentId">,
) {
    return tx.billingRefund.findMany({
        where: {
            OR: [
                { invoiceId: invoice.id },
                ...(invoice.providerPaymentId
                    ? [
                          {
                              provider: invoice.provider,
                              providerPaymentId: invoice.providerPaymentId,
                          },
                      ]
                    : []),
            ],
        },
        select: { id: true, kind: true, status: true, providerRefundId: true },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * The provider took a different amount and the Needs-action row for it
 * (`saroh_invoice_amount_mismatch`, once per invoice) isn't resolved.
 */
export async function heldInTx(
    tx: Tx,
    invoice: Pick<InvoiceFacts, "id" | "totalPaise" | "providerAmountPaise">,
): Promise<boolean> {
    if (
        invoice.providerAmountPaise === null ||
        invoice.providerAmountPaise === invoice.totalPaise
    ) {
        return false;
    }
    const action = await tx.billingAction.findUnique({
        where: { dedupeKey: `amount-mismatch:${invoice.id}` },
        select: { resolvedAt: true },
    });
    return !action?.resolvedAt;
}

/** The statement a line becoming payable now goes in, under the payout lock. */
export async function statementMonthInTx(
    tx: Tx,
    platformAdminId: string,
    periodEnd: Date,
): Promise<string> {
    await lockKeyInTx(tx, payoutLockKey(platformAdminId));
    const paid = await tx.commissionPayout.findMany({
        where: { platformAdminId },
        select: { month: true },
    });
    return statementMonthFor(periodEnd, new Set(paid.map((p) => p.month)));
}

export const LINE_NOTES: Partial<Record<LineStatus, string>> = {
    HELD: "The billing provider took a different amount from the invoice. Paid once the mismatch is resolved in Billing › Needs action.",
    NO_RATE:
        "No commission rate was set for this kind of business when it paid, so it earns nothing. A rate set later starts from its own date; only an own rate for this business can price it.",
    CANCELLED: "The payment was refunded, or a dispute on it was lost.",
};

/**
 * Write a cleared Saroh payment's commission lines if it has none, then
 * bring every line of it up to date (DEC-169, admin console U21): money
 * gone back cancels it, no rate makes it NO_RATE for good (no back-pay), a
 * mismatch HELD, an
 * open refund or dispute PENDING, and a period that ended without them
 * makes it PAYABLE in its month. A line already PAID is never changed: a
 * refund after payout raises a Needs action for the owner, once.
 *
 * Idempotent, and serialised per invoice by `commission-invoice:<id>`:
 * the line job, the refund job and the sweep can all run it. Called only
 * outside a payment's transaction, on its own: it reads the invoice, it
 * never writes one.
 */
export async function settleInvoiceInTx(
    tx: Tx,
    logger: Pick<Logger, "warn">,
    sarohInvoiceId: string,
    now: Date,
): Promise<Settled> {
    const owner = await tx.sarohInvoice.findUnique({
        where: { id: sarohInvoiceId },
        select: { organizationId: true },
    });
    if (owner) {
        await lockKeyInTx(tx, businessRateLockKey(owner.organizationId));
    }
    await lockKeyInTx(tx, invoiceLockKey(sarohInvoiceId));
    const invoice = await tx.sarohInvoice.findUnique({
        where: { id: sarohInvoiceId },
        select: {
            id: true,
            organizationId: true,
            number: true,
            provider: true,
            providerPaymentId: true,
            issuedAt: true,
            cycle: true,
            periodStart: true,
            periodEnd: true,
            taxablePaise: true,
            totalPaise: true,
            providerAmountPaise: true,
        },
    });
    if (!invoice) return { written: 0, moved: 0, noLine: "gone" };

    const refunds = await refundsInTx(tx, invoice);
    const refund = refundSignal(refunds);
    const held = await heldInTx(tx, invoice);

    let written = 0;
    let lines = await tx.commissionLine.findMany({
        where: { sarohInvoiceId },
        orderBy: { installment: "asc" },
    });
    if (lines.length === 0) {
        const plan = await planLinesInTx(tx, invoice);
        if ("noLine" in plan) return { written: 0, moved: 0, ...plan };
        await tx.commissionLine.createMany({
            data: plan.lines.map((line) => ({
                ...line,
                status: line.basisPoints === null ? "NO_RATE" : "PENDING",
                note: line.basisPoints === null ? LINE_NOTES.NO_RATE : null,
            })),
            skipDuplicates: true,
        });
        lines = await tx.commissionLine.findMany({
            where: { sarohInvoiceId },
            orderBy: { installment: "asc" },
        });
        written = plan.lines.length;
    }

    let moved = 0;
    for (const line of lines) {
        const status = line.status as LineStatus;
        const facts = {
            status,
            refund,
            rated: line.basisPoints !== null,
            held,
            periodEnded: line.periodEnd.getTime() <= now.getTime(),
        };
        if (refundAfterPayout(facts)) {
            const back = refunds.find(
                (r) =>
                    (r.kind === "REFUND" && r.status === "PROCESSED") ||
                    (r.kind === "DISPUTE" && r.status === "LOST"),
            );
            await raiseBillingActionInTx(tx, {
                organizationId: invoice.organizationId,
                code: "commission_refund_after_payout",
                refs: {
                    invoice: invoice.number,
                    payment: invoice.providerPaymentId,
                    refund: back?.providerRefundId,
                    line: line.id,
                    payout: line.payoutId,
                },
                note: `Saroh invoice ${invoice.number} was refunded after its account manager's commission for it was paid (statement ${line.statementMonth ?? "unknown"}). Nothing was taken back: decide with them whether to.`,
                dedupeKey: `commission-refund-after-payout:${line.id}`,
            });
            continue;
        }
        if (!OPEN_STATUSES.includes(status)) continue;

        const to = nextStatus(facts);
        if (to === status) continue;
        if (!isLegalLineMove(status, to)) {
            logger.warn(
                `commission_line_move_refused line=${line.id} from=${status} to=${to}`,
            );
            continue;
        }
        const statementMonth =
            to === "PAYABLE"
                ? status === "PAYABLE" && line.statementMonth
                    ? line.statementMonth
                    : await statementMonthInTx(
                          tx,
                          line.platformAdminId,
                          line.periodEnd,
                      )
                : null;
        const { count } = await tx.commissionLine.updateMany({
            where: { id: line.id, status },
            data: {
                status: to,
                statementMonth,
                note: LINE_NOTES[to] ?? null,
            },
        });
        moved += count;
    }
    return { written, moved };
}

type PlannedLine = Omit<
    Prisma.CommissionLineCreateManyInput,
    "status" | "note"
> & { basisPoints: number | null };

/**
 * The lines a payment earns, or why it earns none: nothing before GST
 * (a free month, a fully discounted charge); no manager when it cleared;
 * a manager not paid by commission. A year paid at once is twelve lines.
 */
async function planLinesInTx(
    tx: Tx,
    invoice: InvoiceFacts,
): Promise<{ lines: PlannedLine[] } | { noLine: NoLine }> {
    if (invoice.taxablePaise <= 0) return { noLine: "nothing-earned" };
    const link = await linkForPaymentInTx(
        tx,
        invoice.organizationId,
        invoice.issuedAt,
    );
    if (!link) return { noLine: "no-manager" };
    const profile = await tx.staffProfile.findUnique({
        where: { platformAdminId: link.platformAdminId },
        select: { onCommission: true },
    });
    if (!profile?.onCommission) return { noLine: "off-commission" };

    const kind = link.kind as RateKind;
    // The business's own rate for this manager wins over the kind's (#1035).
    const own = await ownRateForInTx(
        tx,
        invoice.organizationId,
        link.platformAdminId,
        invoice.issuedAt,
    );
    const rate = own ?? (await rateForInTx(tx, kind, invoice.issuedAt));
    const parts = installmentsOf(invoice.cycle);
    const ends = installmentEnds({
        periodStart: invoice.periodStart ?? invoice.issuedAt,
        periodEnd: invoice.periodEnd ?? invoice.issuedAt,
        installments: parts,
    });
    const bases = splitEvenly(invoice.taxablePaise, parts);
    const amounts = rate
        ? splitEvenly(
              commissionPaise(invoice.taxablePaise, rate.basisPoints),
              parts,
          )
        : null;
    return {
        lines: ends.map((periodEnd, i) => ({
            organizationId: invoice.organizationId,
            platformAdminId: link.platformAdminId,
            linkId: link.id,
            sarohInvoiceId: invoice.id,
            installment: i + 1,
            installments: parts,
            kind,
            baseAmountPaise: bases[i],
            rateId: own ? null : (rate?.id ?? null),
            businessRateId: own?.id ?? null,
            basisPoints: rate?.basisPoints ?? null,
            amountPaise: amounts ? amounts[i] : null,
            periodEnd,
        })),
    };
}
