import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { enqueueBillingEmail } from "./billing-email.job";
import {
    addBillingNoteInTx,
    BILLING_NOTE_AUTHOR,
    raiseBillingOpsNoticeInTx,
} from "./billing-ops-notice";
import type { DoubleChargeRefundPayload } from "./double-charge";
import {
    providerName,
    refundDoneKey,
    REFUNDED_AUDIT_ACTION,
    rupees,
} from "./double-charge";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

/**
 * `billing.refund.double-charge` (DEC-164): gives a double charge back in
 * full through the provider (`ProviderRefundCapability`; Razorpay reads the
 * payment first and answers with a refund already made, so a repeat never
 * refunds twice). Queued once per payment by `recordDoubleChargeInTx`.
 *
 * - Refunded: a second audit row (a run that finds it does nothing more),
 *   the log `billing_double_charge_refunded`, one `DOUBLE_CHARGE_REFUNDED`
 *   email to the people who manage billing, and a note on the business so
 *   the owner sees it too.
 * - Refused (a 4xx: it would answer the same again): never retried. The
 *   owner gets a note to refund it by hand, quoting the provider's words,
 *   and an ERROR log.
 * - Not answered (a 5xx, the network): retried by the queue with its
 *   backoff, each failure logged at ERROR; the last try leaves the same
 *   note.
 */
@Injectable()
export class DoubleChargeRefundHandler {
    private readonly logger = new Logger(DoubleChargeRefundHandler.name);

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers: BillingProviderFactory,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const p = job.payload as Partial<DoubleChargeRefundPayload> | null;
        const organizationId = job.organizationId;
        if (!p?.provider || !p.providerPaymentId || !organizationId) {
            this.logger.error(`billing_refund_bad_payload job=${job.id}`);
            return;
        }
        const { provider, providerPaymentId } = p;
        const done = await prisma.adminAuditEvent.findUnique({
            where: {
                idempotencyKey: refundDoneKey(provider, providerPaymentId),
            },
            select: { id: true },
        });
        if (done) return;

        const where = providerName(provider);
        const refs = {
            provider,
            payment: providerPaymentId,
            subscription: p.providerSubscriptionId,
        };
        const owed =
            typeof p.amountPaise === "number"
                ? ` (${rupees(p.amountPaise)})`
                : "";

        const refunds = this.providers.get(provider).refunds;
        let refund: { providerRefundId: string; amountPaise: number | null };
        try {
            if (!refunds) {
                throw new BillingProviderError(
                    "REFUSED",
                    `${where} can't refund through Saroh`,
                    `${where} can't refund through Saroh`,
                );
            }
            refund = await refunds.refundPayment({
                providerPaymentId,
                reference: `refund:${providerPaymentId}`,
                organizationId,
                providerSubscriptionId: p.providerSubscriptionId ?? null,
                reason: "double_charge",
            });
        } catch (error) {
            const refused =
                error instanceof BillingProviderError &&
                error.kind === "REFUSED";
            const attempt = job.attempts + 1;
            const last = refused || attempt >= job.maxAttempts;
            const message =
                error instanceof Error ? error.message : "unknown error";
            this.logger.error(
                `billing_double_charge_refund_failed org=${organizationId} payment=${providerPaymentId} attempt=${attempt}/${job.maxAttempts}${refused ? " refused" : ""}: ${message}`,
            );
            if (last) {
                const said =
                    error instanceof BillingProviderError
                        ? (error.said ?? message)
                        : message;
                const why = refused
                    ? `the automatic refund was refused (${said})`
                    : `the automatic refund didn't go through after ${attempt} tries (${message})`;
                await prisma.$transaction((tx) =>
                    raiseBillingOpsNoticeInTx(tx, this.logger, {
                        code: "billing_double_charge_refund_given_up",
                        organizationId,
                        refs,
                        note: `Refund payment ${providerPaymentId}${owed} in ${where} by hand: ${why}. It charged the business twice (${p.reason ?? "charged twice"}). Its autopay has been stopped. Tell the business once it is refunded.`,
                    }),
                );
            }
            if (refused) return;
            throw error;
        }

        const amountPaise = refund.amountPaise ?? p.amountPaise ?? null;
        await prisma.$transaction(async (tx) => {
            const written = await tx.adminAuditEvent.createMany({
                data: [
                    {
                        actorUserId: BILLING_NOTE_AUTHOR,
                        permission: "system",
                        action: REFUNDED_AUDIT_ACTION,
                        targetType: "payment",
                        targetId: providerPaymentId,
                        organizationId,
                        reason: p.reason ?? null,
                        outcome: "SUCCESS",
                        idempotencyKey: refundDoneKey(
                            provider,
                            providerPaymentId,
                        ),
                        metadata: {
                            provider,
                            providerRefundId: refund.providerRefundId,
                            amountPaise,
                        },
                    },
                ],
                skipDuplicates: true,
            });
            if (written.count === 0) return;
            await enqueueBillingEmail(tx, {
                kind: "DOUBLE_CHARGE_REFUNDED",
                organizationId,
                providerPaymentId,
                amountPaise,
            });
            await addBillingNoteInTx(tx, {
                organizationId,
                refs: { ...refs, refund: refund.providerRefundId },
                note: `Refunded payment ${providerPaymentId}${
                    typeof amountPaise === "number"
                        ? ` (${rupees(amountPaise)})`
                        : ""
                } in ${where} automatically, refund ${refund.providerRefundId}: it charged the business twice (${p.reason ?? "charged twice"}). The people who manage its billing have been emailed. Nothing to do.`,
            });
        });
        this.logger.warn(
            `billing_double_charge_refunded org=${organizationId} payment=${providerPaymentId} refund=${refund.providerRefundId}`,
        );
    };
}
