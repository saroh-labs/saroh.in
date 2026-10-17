import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { raiseBillingActionInTx } from "./billing-actions";
import { isOneTime } from "./billing-term";
import { providerName, refundClaimKey, rupees } from "./double-charge";
import { keepProviderAmountInTx } from "./invoice-amount";
import type {
    BillingProviderFactory,
    ProviderPaidCharge,
} from "./providers/billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "./providers/billing-provider.port";

/**
 * `billing.reconcile` (DEC-166, owner 17 Oct 2026: "store the data so that
 * we can match them in razorpay"): once a day, what Saroh's billing
 * provider took is read back and matched to Saroh's invoices, so a charge
 * whose webhook never arrived (Razorpay gives up after its retries, or a
 * webhook switched off) is found instead of staying unbilled and unseen.
 *
 * For every live provider subscription (and every one that ended in the
 * last {@link RECONCILE_LOOKBACK_DAYS} days) and every checkout made in
 * that window — a yearly plan's order included — it asks the provider for
 * the payments it took (`reconcile.paidCharges`):
 *
 * - a payment on a Saroh invoice: the amount the provider took is kept on
 *   it and checked against its total (`invoice-amount.ts`);
 * - a payment with no Saroh invoice and no double-charge claim: an ERROR
 *   log and a Needs-action row, once per payment. It is not invoiced here:
 *   a charge applied out of order could move a plan the provider has
 *   moved since, so an operator looks first (the business's subscription
 *   sheet shows its state; the payment's notes carry Saroh's ids).
 *
 * A provider that can't answer for one reference is logged and the sweep
 * goes on; nothing is written for it. One PENDING run at a time
 * (`Job_one_pending_billing_reconcile`), rescheduled by itself and
 * restarted by the billing module's six-hourly check, like the plan-move
 * sweep (ADR-007).
 */
export const BILLING_RECONCILE_TYPE = "billing.reconcile";

/** Once a day. */
export const RECONCILE_EVERY_MS = 24 * 60 * 60 * 1000;
/** Ended subscriptions and checkouts this recent are still read. */
export const RECONCILE_LOOKBACK_DAYS = 40;
/** References asked per run, so one run stays inside the job lease. */
export const RECONCILE_MAX_REFS = 400;

export interface ReconcileReport {
    refs: number;
    payments: number;
    unmatched: number;
    mismatched: number;
    failed: number;
}

interface Ref {
    provider: string;
    ref: string;
    oneTime: boolean;
    organizationId: string;
}

@Injectable()
export class BillingReconcileHandler {
    private readonly logger = new Logger(BillingReconcileHandler.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const report = await this.sweep(now);
            this.logger.log(
                `billing.reconcile: ${report.refs} refs, ${report.payments} payments, ${report.unmatched} unmatched, ${report.mismatched} amounts differ, ${report.failed} not answered`,
            );
        } catch (error) {
            this.logger.error(
                `billing.reconcile: sweep failed before it finished: ${error instanceof Error ? error.message : "unknown"}`,
            );
        }
        if (
            !(await this.schedule(new Date(now.getTime() + RECONCILE_EVERY_MS)))
        ) {
            throw new Error(
                "Could not schedule the next billing reconcile; retrying this one",
            );
        }
    };

    /** Read what the provider took for each reference and match it. */
    async sweep(now: Date): Promise<ReconcileReport> {
        const report: ReconcileReport = {
            refs: 0,
            payments: 0,
            unmatched: 0,
            mismatched: 0,
            failed: 0,
        };
        for (const ref of await this.refs(now)) {
            const provider = this.providers.get(ref.provider);
            if (!provider.reconcile) continue;
            report.refs += 1;
            let charges: ProviderPaidCharge[];
            try {
                charges = await provider.reconcile.paidCharges(
                    ref.ref,
                    ref.oneTime,
                );
            } catch (error) {
                report.failed += 1;
                this.logger.warn(
                    `billing_reconcile_lookup_failed provider=${ref.provider} ref=${ref.ref}: ${error instanceof Error ? error.message : "unknown"}`,
                );
                continue;
            }
            for (const charge of charges) {
                report.payments += 1;
                const outcome = await this.match(ref, charge);
                if (outcome === "unmatched") report.unmatched += 1;
                if (outcome === "mismatched") report.mismatched += 1;
            }
        }
        return report;
    }

    /** One payment the provider took, against Saroh's invoices. */
    async match(
        ref: Ref,
        charge: ProviderPaidCharge,
    ): Promise<"matched" | "mismatched" | "unmatched" | "claimed"> {
        return prisma.$transaction(async (tx) => {
            const invoice = await tx.sarohInvoice.findFirst({
                where: {
                    provider: ref.provider,
                    providerPaymentId: charge.providerPaymentId,
                },
                select: {
                    id: true,
                    organizationId: true,
                    number: true,
                    provider: true,
                    providerPaymentId: true,
                    totalPaise: true,
                    providerAmountPaise: true,
                },
            });
            if (invoice) {
                const differs = await keepProviderAmountInTx(
                    tx,
                    this.logger,
                    invoice,
                    charge.amountPaise,
                );
                return differs ? "mismatched" : "matched";
            }
            // A double charge has no invoice on purpose: it is refunded.
            const claimed = await tx.adminAuditEvent.findUnique({
                where: {
                    idempotencyKey: refundClaimKey(
                        ref.provider,
                        charge.providerPaymentId,
                    ),
                },
                select: { id: true },
            });
            if (claimed) return "claimed";
            const where = providerName(ref.provider);
            const raised = await raiseBillingActionInTx(tx, {
                organizationId: ref.organizationId,
                code: "billing_reconcile_payment_unmatched",
                refs: {
                    provider: ref.provider,
                    [ref.oneTime ? "order" : "subscription"]: ref.ref,
                    payment: charge.providerPaymentId,
                },
                note: `${where} took payment ${charge.providerPaymentId}${charge.amountPaise !== null ? ` (${rupees(charge.amountPaise)})` : ""}${charge.paidAt ? ` on ${charge.paidAt.toISOString().slice(0, 10)}` : ""} on ${ref.ref}, but Saroh has no invoice for it: its webhook probably never arrived. Check the business's plan and paid-until date on its subscription, then refund the payment in ${where} or ask for the invoice to be written.`,
                dedupeKey: `reconcile-unmatched:${ref.provider}:${charge.providerPaymentId}`,
            });
            if (raised) {
                this.logger.error(
                    `billing_reconcile_payment_unmatched org=${ref.organizationId} provider=${ref.provider} ref=${ref.ref} payment=${charge.providerPaymentId}`,
                );
            }
            return "unmatched";
        });
    }

    /**
     * The references to read: every subscription billed through a provider
     * that is live or ended in the window, and every checkout made in it,
     * once each, oldest-changed first so every one is reached in turn.
     */
    async refs(now: Date): Promise<Ref[]> {
        const since = new Date(
            now.getTime() - RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
        );
        const [subs, checkouts] = await Promise.all([
            prisma.subscription.findMany({
                where: {
                    provider: { not: null },
                    providerSubscriptionId: { not: null },
                    OR: [
                        { status: { not: "CANCELLED" } },
                        { updatedAt: { gte: since } },
                    ],
                },
                orderBy: { updatedAt: "asc" },
                take: RECONCILE_MAX_REFS,
                select: {
                    organizationId: true,
                    provider: true,
                    providerSubscriptionId: true,
                },
            }),
            prisma.billingCheckout.findMany({
                where: { createdAt: { gte: since } },
                orderBy: { createdAt: "asc" },
                take: RECONCILE_MAX_REFS,
                select: {
                    organizationId: true,
                    provider: true,
                    providerSubscriptionId: true,
                    providerPlanId: true,
                },
            }),
        ]);
        const seen = new Map<string, Ref>();
        for (const c of checkouts) {
            seen.set(`${c.provider}:${c.providerSubscriptionId}`, {
                provider: c.provider,
                ref: c.providerSubscriptionId,
                oneTime: isOneTime(c),
                organizationId: c.organizationId,
            });
        }
        for (const s of subs) {
            if (!s.provider || !s.providerSubscriptionId) continue;
            const key = `${s.provider}:${s.providerSubscriptionId}`;
            if (seen.has(key)) continue;
            seen.set(key, {
                provider: s.provider,
                ref: s.providerSubscriptionId,
                oneTime: s.providerSubscriptionId.startsWith("order_"),
                organizationId: s.organizationId,
            });
        }
        return [...seen.values()].slice(0, RECONCILE_MAX_REFS);
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: BILLING_RECONCILE_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next billing reconcile: ${error instanceof Error ? error.name : "unknown"}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: BILLING_RECONCILE_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the billing reconcile chain: ${error instanceof Error ? error.name : "unknown"}`,
            );
        }
    }
}
