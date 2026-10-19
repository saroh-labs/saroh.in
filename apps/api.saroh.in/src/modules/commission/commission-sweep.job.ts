import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { CommissionLineHandler } from "./commission-line.job";
import { errorName } from "./commission-queue";
import { OPEN_STATUSES } from "./commission-rules";

/** The hourly commission sweep. */
export const COMMISSION_SWEEP_TYPE = "commission.sweep";

export const COMMISSION_SWEEP_EVERY_MS = 60 * 60 * 1000;

/** How far back a payment with no line is looked for. */
export const COMMISSION_RERUN_DAYS = 60;

/** How far back a refund or dispute that changed is looked at. */
export const COMMISSION_REFUND_LOOKBACK_DAYS = 3;

/** Invoices one step takes per page, and pages per run. */
const PAGE = 200;
const MAX_PAGES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${COMMISSION_SWEEP_TYPE}`;

export interface SweepResult {
    /** Lines written for payments the line job missed. */
    written: number;
    /** Lines that moved (payable, held, cancelled, rated). */
    moved: number;
    /** Invoices that failed and were left for the next run. */
    failed: number;
}

/**
 * Commission's hourly sweep (DEC-169, admin console U21), three steps,
 * each a page of invoices settled one by one in its own transaction
 * (`settleInvoiceInTx`), so one that fails is logged and the rest go on:
 *
 * 1. **Re-run**: a payment of the last 60 days with no line, whose
 *    business had a manager on commission when it cleared, or, with none
 *    then, gained one later that month in India ("the month counts"): the
 *    line the job didn't write (its enqueue was lost, or it gave up, or
 *    the manager came after the payment).
 * 2. **Payable**: every open line whose period has ended, and every one
 *    HELD or PAYABLE: a period that ended clean becomes payable in its
 *    month, a mismatch resolved moves it on, a refund cancels it. A
 *    NO_RATE line is never back-paid, so it is not looked at again.
 * 3. **Refunds**: every payment whose refund or dispute changed in the
 *    last 3 days (the console's hand refunds and the automatic one
 *    included), so a refund after payout is raised.
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:commission.sweep`, as the manager link sweep
 * does; it throws only when the next run cannot be enqueued.
 */
@Injectable()
export class CommissionSweepJob {
    private readonly logger = new Logger(CommissionSweepJob.name);

    constructor(private readonly lines: CommissionLineHandler) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const r = await this.sweep(now);
            if (r.written + r.moved + r.failed > 0) {
                this.logger.log(
                    `commission_sweep written=${r.written} moved=${r.moved} failed=${r.failed}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `commission_sweep failed before it finished: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + COMMISSION_SWEEP_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next commission sweep; retrying this one",
            );
        }
    };

    async sweep(now: Date): Promise<SweepResult> {
        const result: SweepResult = { written: 0, moved: 0, failed: 0 };
        const tried = new Set<string>();
        const settle = async (ids: string[]) => {
            for (const id of ids) {
                if (tried.has(id)) continue;
                tried.add(id);
                try {
                    const s = await this.lines.settle(id, now);
                    result.written += s.written;
                    result.moved += s.moved;
                } catch (error) {
                    result.failed += 1;
                    this.logger.error(
                        `commission_sweep could not settle invoice=${id}: ${errorName(error)}`,
                    );
                }
            }
        };

        await this.pages((after) => this.missingLines(now, after), settle);
        await this.pages((after) => this.openLines(now, after), settle);
        await settle(await this.refunded(now));
        return result;
    }

    /** Page through `read` by id, never re-reading an id it has passed. */
    private async pages(
        read: (after: string) => Promise<string[]>,
        settle: (ids: string[]) => Promise<void>,
    ): Promise<void> {
        let after = "";
        for (let page = 0; page < MAX_PAGES; page++) {
            const ids = await read(after);
            if (ids.length === 0) return;
            await settle(ids);
            if (ids.length < PAGE) return;
            after = ids[ids.length - 1];
        }
    }

    /** Payments with no line whose manager when they cleared is on commission. */
    private async missingLines(now: Date, after: string): Promise<string[]> {
        const since = new Date(now.getTime() - COMMISSION_RERUN_DAYS * DAY_MS);
        const rows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT i."id"
              FROM "SarohInvoice" i
             WHERE i."issuedAt" >= ${since}
               AND i."taxablePaise" > 0
               AND i."id" > ${after}
               AND NOT EXISTS (
                   SELECT 1 FROM "CommissionLine" l WHERE l."sarohInvoiceId" = i."id")
               AND EXISTS (
                   SELECT 1
                     FROM "AccountManagerLink" a
                     JOIN "StaffProfile" p ON p."platformAdminId" = a."platformAdminId"
                    WHERE a."organizationId" = i."organizationId"
                      AND p."onCommission" = true
                      AND (
                          (a."startedAt" <= i."issuedAt"
                           AND (a."endedAt" IS NULL OR a."endedAt" > i."issuedAt"))
                          -- "The month counts": with no manager when it
                          -- cleared, one who took it on later that month
                          -- in India (linkForPaymentInTx).
                          OR (a."startedAt" > i."issuedAt"
                              AND date_trunc('month', a."startedAt" + interval '330 minutes')
                                = date_trunc('month', i."issuedAt" + interval '330 minutes')
                              AND NOT EXISTS (
                                  SELECT 1 FROM "AccountManagerLink" o
                                   WHERE o."organizationId" = i."organizationId"
                                     AND o."startedAt" <= i."issuedAt"
                                     AND (o."endedAt" IS NULL OR o."endedAt" > i."issuedAt")))))
             ORDER BY i."id"
             LIMIT ${PAGE}`;
        return rows.map((r) => r.id);
    }

    /** Invoices with a line that may move now. */
    private async openLines(now: Date, after: string): Promise<string[]> {
        const rows = await prisma.commissionLine.findMany({
            where: {
                sarohInvoiceId: { gt: after },
                OR: [
                    {
                        status: { in: [...OPEN_STATUSES] },
                        periodEnd: { lte: now },
                    },
                    { status: { in: ["HELD", "PAYABLE"] } },
                ],
            },
            select: { sarohInvoiceId: true },
            distinct: ["sarohInvoiceId"],
            orderBy: { sarohInvoiceId: "asc" },
            take: PAGE,
        });
        return rows.map((r) => r.sarohInvoiceId);
    }

    /** Invoices whose payment's refund or dispute changed lately. */
    private async refunded(now: Date): Promise<string[]> {
        const since = new Date(
            now.getTime() - COMMISSION_REFUND_LOOKBACK_DAYS * DAY_MS,
        );
        const refunds = await prisma.billingRefund.findMany({
            where: { updatedAt: { gte: since } },
            select: {
                invoiceId: true,
                provider: true,
                providerPaymentId: true,
            },
            take: PAGE * MAX_PAGES,
        });
        if (refunds.length === 0) return [];
        const invoices = await prisma.sarohInvoice.findMany({
            where: {
                OR: [
                    {
                        id: {
                            in: refunds
                                .map((r) => r.invoiceId)
                                .filter((id): id is string => id !== null),
                        },
                    },
                    ...refunds.map((r) => ({
                        provider: r.provider,
                        providerPaymentId: r.providerPaymentId,
                    })),
                ],
            },
            select: { id: true },
        });
        const lined = await prisma.commissionLine.findMany({
            where: { sarohInvoiceId: { in: invoices.map((i) => i.id) } },
            select: { sarohInvoiceId: true },
            distinct: ["sarohInvoiceId"],
        });
        return lined.map((l) => l.sarohInvoiceId);
    }

    /** Leave one run waiting at `runAt`, unless one is. Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: COMMISSION_SWEEP_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: COMMISSION_SWEEP_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next commission sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: COMMISSION_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the commission sweep chain: ${errorName(error)}`,
            );
        }
    }
}
