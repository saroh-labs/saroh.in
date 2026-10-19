import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { raiseBillingActionInTx } from "../billing/billing-actions";
import type {
    CommissionLinePayload,
    CommissionRefundPayload,
} from "./commission-queue";
import { errorName } from "./commission-queue";
import type { Settled } from "./commission-settle";
import { settleInvoiceInTx } from "./commission-settle";

/**
 * The commission jobs a payment queues after it has committed (DEC-169,
 * admin console U21):
 *
 * - `commission.line` writes the payment's lines (`settleInvoiceInTx`):
 *   the business's manager when it cleared, their link's kind and the
 *   rate in force, copied onto the line.
 * - `commission.refund` brings a refunded or disputed payment's lines up
 *   to date: cancelled before payout, a Needs action after.
 *
 * Both are idempotent (one line per invoice and installment, every move
 * conditional on the status it moves from) and retried by the queue. On
 * the last try a line the job couldn't write is a Needs action
 * (`commission_line_failed`, once per invoice) and the job ends; the
 * hourly sweep keeps trying it. Nothing here ever reads or writes a
 * payment's own rows beyond reading its invoice and refunds.
 */
@Injectable()
export class CommissionLineHandler {
    private readonly logger = new Logger(CommissionLineHandler.name);

    readonly handleLine = async (job: Job): Promise<void> => {
        const p = job.payload as Partial<CommissionLinePayload> | null;
        if (!p?.sarohInvoiceId) {
            this.logger.warn(`commission_line_skipped job=${job.id}`);
            return;
        }
        await this.run(job, [p.sarohInvoiceId]);
    };

    readonly handleRefund = async (job: Job): Promise<void> => {
        const p = job.payload as Partial<CommissionRefundPayload> | null;
        if (!p?.provider || !p.providerPaymentId) {
            this.logger.warn(`commission_refund_skipped job=${job.id}`);
            return;
        }
        // A double charge has no invoice, so it earns and loses nothing.
        const invoices = await prisma.sarohInvoice.findMany({
            where: {
                provider: p.provider,
                providerPaymentId: p.providerPaymentId,
            },
            select: { id: true },
        });
        await this.run(
            job,
            invoices.map((i) => i.id),
        );
    };

    /** Settle one invoice in its own transaction. */
    settle(sarohInvoiceId: string, now: Date = new Date()): Promise<Settled> {
        return prisma.$transaction((tx) =>
            settleInvoiceInTx(tx, this.logger, sarohInvoiceId, now),
        );
    }

    private async run(job: Job, invoiceIds: string[]): Promise<void> {
        for (const id of invoiceIds) {
            try {
                await this.settle(id);
            } catch (error) {
                const attempt = job.attempts + 1;
                const last = attempt >= job.maxAttempts;
                this.logger.error(
                    `commission_line_failed invoice=${id} job=${job.id} attempt=${attempt}/${job.maxAttempts}: ${errorName(error)}`,
                );
                if (!last) throw error;
                await this.giveUp(id, attempt);
            }
        }
    }

    /** The last try: a Needs action, once per invoice. Throws if it can't. */
    private async giveUp(sarohInvoiceId: string, tries: number): Promise<void> {
        const invoice = await prisma.sarohInvoice.findUnique({
            where: { id: sarohInvoiceId },
            select: { organizationId: true, number: true },
        });
        await prisma.$transaction((tx) =>
            raiseBillingActionInTx(tx, {
                organizationId: invoice?.organizationId ?? null,
                code: "commission_line_failed",
                refs: { invoice: invoice?.number ?? sarohInvoiceId },
                note: `Saroh couldn't work out the account manager's commission on invoice ${invoice?.number ?? sarohInvoiceId} after ${tries} tries. The payment and the invoice are recorded as normal. The hourly commission sweep tries again; mark this resolved once the line shows on Payouts.`,
                dedupeKey: `commission-line-failed:${sarohInvoiceId}`,
            }),
        );
    }
}
