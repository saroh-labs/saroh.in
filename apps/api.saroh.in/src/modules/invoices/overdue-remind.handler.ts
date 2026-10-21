import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { BILLING_ORGANIZATION } from "../organizations/organization-lifecycle.policy";
import { refusalReason } from "./invoice-auto-send.handler";
import { CLAIM_REFUSED, InvoiceSendService } from "./invoice-send.service";
import { leftToPayCents } from "./invoice-state";
import { overdueBillsWhere } from "./overdue-bills";
import type { OverdueStage } from "./overdue-remind";
import {
    dueWindow,
    inSendingHours,
    OVERDUE_NOTICE_KIND,
    OVERDUE_REMIND_EVERY_MS,
    OVERDUE_REMIND_TYPE,
    overdueEventKey,
    overdueStage,
} from "./overdue-remind";

/** Businesses read a page at a time, and invoices per business per run. */
const BUSINESS_PAGE = 200;
const INVOICES_PER_BUSINESS = 500;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${OVERDUE_REMIND_TYPE}`;

/** What one invoice's reminder came to, for the run's log and the specs. */
export type OverdueOutcome =
    /** Reminded: AUTO_REMINDED on its history, the claim written. */
    | "SENT"
    /** Reminded in the last day, by hand, on WhatsApp or by Saroh: later. */
    | "WAIT"
    /** This reminder went already (a run before this one). */
    | "ALREADY"
    /** The business turned overdue reminders off meanwhile. */
    | "OFF"
    /** Paid, voided or credited before it went. */
    | "NOT_OWED"
    /** An autopay charge is under way on it. */
    | "AUTOPAY"
    /** It can't go (no provider, no address, the business details): quietly. */
    | "REFUSED";

export interface OverdueRunCounts {
    businesses: number;
    sent: number;
    waiting: number;
    refused: number;
    failed: number;
}

/**
 * `invoice.overdue-remind` (automatic notices U20, DEC-174 D3): the
 * hourly sweep that reminds overdue invoices for the businesses that
 * turned "Overdue reminders" on (off by default). See `overdue-remind.ts`
 * for when: at most twice, 3 and 10 days after the due date, in the
 * business's time zone, between 9 am and 8 pm there.
 *
 * Which invoices: the overdue bills (`overdueBillsWhere`, the one
 * definition: issued, past due, not an order's or a credit note, not a
 * live subscription's latest period invoice, so never one autopay will
 * charge, not a cancelled booking's paid link) with something left to pay.
 *
 * Each reminder goes through `InvoiceSendService.remindAutomatic`, the
 * same path as Send reminder: the business's own email provider (never
 * Saroh's address) or the account thread, the one-a-day rule counting
 * hand reminders and WhatsApp shares (a 429 is left for the next run and
 * never counted), what is left to pay, and AUTO_REMINDED on the invoice's
 * history. Its claim (`invoice-overdue:<id>:<1|2>`) is written on the
 * send's transaction, so a run delivered twice sends once. A reminder
 * that can't go (no provider, no address) is left quietly: the business
 * still has Send reminder, and the next run tries again inside its week.
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:invoice.overdue-remind`; it throws only when
 * the next run cannot be enqueued. A business or an invoice that fails is
 * logged and the rest go on.
 */
@Injectable()
export class OverdueRemindHandler {
    private readonly logger = new Logger(OverdueRemindHandler.name);

    constructor(private readonly sends: InvoiceSendService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const r = await this.sweep(now);
            if (r.sent + r.failed > 0) {
                this.logger.log(
                    `overdue_remind businesses=${r.businesses} sent=${r.sent} waiting=${r.waiting} refused=${r.refused} failed=${r.failed}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `overdue_remind failed before it finished: ${nameOf(error)}`,
            );
        }
        const next = new Date(now.getTime() + OVERDUE_REMIND_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next overdue reminder run; retrying this one",
            );
        }
    };

    /** Every business with overdue reminders on, a page at a time. */
    async sweep(now: Date): Promise<OverdueRunCounts> {
        const counts: OverdueRunCounts = {
            businesses: 0,
            sent: 0,
            waiting: 0,
            refused: 0,
            failed: 0,
        };
        let after = "";
        for (;;) {
            // Off is the default, so a row turned on is the business's choice.
            const page = await prisma.customerNoticeSetting.findMany({
                where: {
                    kind: "OVERDUE_REMINDERS",
                    enabled: true,
                    organizationId: { gt: after },
                    organization: BILLING_ORGANIZATION,
                },
                orderBy: { organizationId: "asc" },
                take: BUSINESS_PAGE,
                select: { organizationId: true },
            });
            for (const { organizationId } of page) {
                counts.businesses += 1;
                try {
                    const outcomes = await this.runBusiness(
                        organizationId,
                        now,
                    );
                    for (const o of outcomes.values()) {
                        if (o === "SENT") counts.sent += 1;
                        else if (o === "WAIT") counts.waiting += 1;
                        else if (o === "REFUSED") counts.refused += 1;
                    }
                } catch (error) {
                    counts.failed += 1;
                    this.logger.error(
                        `overdue_remind organization=${organizationId} failed: ${nameOf(error)}`,
                    );
                }
            }
            if (page.length < BUSINESS_PAGE) break;
            after = page[page.length - 1].organizationId;
        }
        return counts;
    }

    /**
     * One business's reminders due now, in its own RLS context: invoice id
     * → what came of it. Nothing outside its sending hours.
     */
    runBusiness(
        organizationId: string,
        now: Date,
    ): Promise<Map<string, OverdueOutcome>> {
        return runInOrgContext(organizationId, async () => {
            const out = new Map<string, OverdueOutcome>();
            const zone = await this.sends.zone(prisma, organizationId);
            if (!inSendingHours(now, zone)) return out;
            const { from, to } = dueWindow(now, zone);
            const rows = await prisma.invoice.findMany({
                where: {
                    AND: [
                        await overdueBillsWhere(prisma, organizationId, now),
                        { dueAt: { gte: from, lt: to } },
                    ],
                },
                orderBy: [{ dueAt: "asc" }, { id: "asc" }],
                take: INVOICES_PER_BUSINESS,
                select: { id: true, dueAt: true, total: true, paidCents: true },
            });
            const due = rows.flatMap((row) => {
                const stage = row.dueAt
                    ? overdueStage(row.dueAt, now, zone)
                    : null;
                return stage && leftToPayCents(row) > 0
                    ? [{ id: row.id, stage }]
                    : [];
            });
            if (due.length === 0) return out;
            // Claimed before: not tried again (the claim decides anyway).
            const claimed = new Set(
                (
                    await prisma.customerNotice.findMany({
                        where: {
                            organizationId,
                            eventKey: {
                                in: due.map((d) =>
                                    overdueEventKey(d.id, d.stage),
                                ),
                            },
                        },
                        select: { eventKey: true },
                    })
                ).map((c) => c.eventKey),
            );
            for (const { id, stage } of due) {
                if (claimed.has(overdueEventKey(id, stage))) continue;
                try {
                    out.set(
                        id,
                        await this.remindOne(organizationId, id, stage),
                    );
                } catch (error) {
                    this.logger.error(
                        `overdue_remind invoice=${id} organization=${organizationId} failed: ${nameOf(error)}`,
                    );
                }
            }
            return out;
        });
    }

    /** One reminder, through the send path; refusals are outcomes. */
    private async remindOne(
        organizationId: string,
        invoiceId: string,
        stage: OverdueStage,
    ): Promise<OverdueOutcome> {
        try {
            await this.sends.remindAutomatic(organizationId, invoiceId, {
                eventKey: overdueEventKey(invoiceId, stage),
                kind: OVERDUE_NOTICE_KIND,
                switchKind: "OVERDUE_REMINDERS",
            });
            return "SENT";
        } catch (err) {
            if (!(err instanceof HttpException)) throw err;
            if (err.getStatus() === Number(HttpStatus.TOO_MANY_REQUESTS)) {
                return "WAIT";
            }
            const reason = refusalReason(err);
            if (reason === CLAIM_REFUSED.taken) return "ALREADY";
            if (reason === CLAIM_REFUSED.off) return "OFF";
            if (reason === "autopay-pending") return "AUTOPAY";
            const still = await prisma.invoice.findFirst({
                where: { id: invoiceId, organizationId },
                select: { status: true },
            });
            return still?.status === "ISSUED" ? "REFUSED" : "NOT_OWED";
        }
    }

    /** Leave one waiting run, unless one is already waiting. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: OVERDUE_REMIND_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: OVERDUE_REMIND_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next overdue reminder run: ${nameOf(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: OVERDUE_REMIND_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the overdue reminder chain: ${nameOf(error)}`,
            );
        }
    }
}

/** An error's name, never its message (it may carry a customer's details). */
function nameOf(error: unknown): string {
    return error instanceof Error ? error.name : "unknown";
}
