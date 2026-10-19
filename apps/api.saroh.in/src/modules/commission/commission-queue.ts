import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { ParsedBillingEvent } from "../billing/providers/billing-provider.port";

/** Write one payment's commission lines (`commission-line.job.ts`). */
export const COMMISSION_LINE_TYPE = "commission.line";

/** Bring the lines of a refunded or disputed payment up to date. */
export const COMMISSION_REFUND_TYPE = "commission.refund";

/** Tries before the line job gives up and raises a Needs action. */
export const COMMISSION_LINE_MAX_ATTEMPTS = 8;

export interface CommissionLinePayload {
    sarohInvoiceId: string;
}

export interface CommissionRefundPayload {
    provider: string;
    providerPaymentId: string;
}

/**
 * Queues commission after a billing event has committed (DEC-169, admin
 * console U21). The billing webhook calls it once its transaction is
 * done, never inside it, so nothing here can roll back or slow a
 * payment: every failure is logged and swallowed, and the hourly
 * `commission.sweep` writes whatever a lost enqueue left out.
 *
 * Only what the job will act on is queued (`backend-jobs.md`): a line
 * for an invoice whose business had a manager when it was issued, and a
 * refund re-check for a payment whose invoice has lines.
 *
 * Not a tenant write: the jobs carry the business's id but are written
 * with no organization context, as every job queued outside a business's
 * transaction is.
 */
@Injectable()
export class CommissionQueue {
    private readonly logger = new Logger(CommissionQueue.name);

    /** Never throws. */
    async afterBillingEvent(
        provider: string,
        event: ParsedBillingEvent,
    ): Promise<void> {
        try {
            const payment =
                event.refund?.providerPaymentId ??
                event.dispute?.providerPaymentId;
            if (payment) {
                await this.queueRefund(provider, payment);
                return;
            }
            const invoices = await prisma.sarohInvoice.findMany({
                where: { provider, providerEventId: event.providerEventId },
                select: { id: true, organizationId: true, issuedAt: true },
            });
            for (const invoice of invoices) {
                await this.queueLine(invoice);
            }
        } catch (error) {
            this.logger.error(
                `commission_enqueue_failed provider=${provider} event=${event.providerEventId}: ${errorName(error)}. The hourly sweep writes the line.`,
            );
        }
    }

    /** A line for an invoice whose business had a manager when it was issued. */
    async queueLine(invoice: {
        id: string;
        organizationId: string;
        issuedAt: Date;
    }): Promise<boolean> {
        const managed = await prisma.accountManagerLink.count({
            where: {
                organizationId: invoice.organizationId,
                startedAt: { lte: invoice.issuedAt },
                OR: [{ endedAt: null }, { endedAt: { gt: invoice.issuedAt } }],
            },
        });
        if (managed === 0) return false;
        await prisma.job.create({
            data: {
                type: COMMISSION_LINE_TYPE,
                organizationId: invoice.organizationId,
                maxAttempts: COMMISSION_LINE_MAX_ATTEMPTS,
                payload: {
                    sarohInvoiceId: invoice.id,
                } satisfies CommissionLinePayload,
            },
        });
        return true;
    }

    /** A re-check for a refunded or disputed payment whose invoice has lines. */
    async queueRefund(
        provider: string,
        providerPaymentId: string,
    ): Promise<boolean> {
        const invoices = await prisma.sarohInvoice.findMany({
            where: { provider, providerPaymentId },
            select: { id: true, organizationId: true },
        });
        if (invoices.length === 0) return false;
        const lines = await prisma.commissionLine.count({
            where: { sarohInvoiceId: { in: invoices.map((i) => i.id) } },
        });
        if (lines === 0) return false;
        await prisma.job.create({
            data: {
                type: COMMISSION_REFUND_TYPE,
                organizationId: invoices[0].organizationId,
                maxAttempts: COMMISSION_LINE_MAX_ATTEMPTS,
                payload: {
                    provider,
                    providerPaymentId,
                } satisfies CommissionRefundPayload,
            },
        });
        return true;
    }
}

export function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
