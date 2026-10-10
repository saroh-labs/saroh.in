import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import {
    businessLeaving,
    errorResult,
    logDeletionProviderCall,
} from "../organizations/deletion-provider-log";
import { PaymentsService } from "./payments.service";
import { SEND_REFUND_TYPE } from "./send-refund-type";

export { SEND_REFUND_TYPE };

/**
 * Tries before the job gives up: the worker backs off from a second to
 * five minutes, so twelve spread the sends over about twenty minutes —
 * long enough to ride out a provider's short outage. A refund still
 * unsent after that stays PENDING on its order, where staff see it and
 * try again (`retryRefund`).
 */
export const SEND_REFUND_ATTEMPTS = 12;

/**
 * Write the job that sends a reserved refund, on the transaction that
 * reserved it — so a committed refusal always has its send (the outbox,
 * DEC-008). The payload is the refund's id only.
 */
export async function enqueueRefundSendInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    refundId: string,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId,
            type: SEND_REFUND_TYPE,
            payload: { refundId },
            maxAttempts: SEND_REFUND_ATTEMPTS,
        },
    });
}

/**
 * Sends one automatic refund: a site checkout's payment that lost the last
 * unit, or arrived after it closed. Idempotent on the refund's id: the
 * provider is asked first for a refund under that reference, a row already
 * taken or settled sends nothing, and a repeat send uses the same
 * reference, which the provider makes once (DEC-026).
 *
 * An unknown answer throws, so the worker tries again with backoff. A
 * definite refusal leaves the row FAILED — the money is still owed, and the
 * order shows staff so; sending again would be refused again.
 */
@Injectable()
export class SendRefundHandler {
    private readonly logger = new Logger(SendRefundHandler.name);

    constructor(private readonly payments: PaymentsService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const refundId = refundIdOf(job.payload);
        if (!refundId || !job.organizationId) {
            this.logger.warn(
                `${SEND_REFUND_TYPE} job ${job.id} names no refund; nothing to send`,
            );
            return;
        }
        const organizationId = job.organizationId;
        // A closing or deleted business (#921): the send is on its deletion
        // trail, in the one line an operator follows it by.
        const leaving = await businessLeaving(organizationId).catch(
            () => false,
        );
        let outcome: Awaited<ReturnType<PaymentsService["sendQueuedRefund"]>>;
        try {
            outcome = await runInOrgContext(organizationId, () =>
                this.payments.sendQueuedRefund(organizationId, refundId),
            );
        } catch (error) {
            if (leaving) {
                await this.trail(organizationId, refundId, errorResult(error));
            }
            throw error;
        }
        if (leaving) {
            // ACCEPTED (taken) and DONE (already settled) both worked.
            await this.trail(
                organizationId,
                refundId,
                outcome === "ACCEPTED" || outcome === "DONE"
                    ? "ok"
                    : outcome.toLowerCase(),
            );
        }
        if (outcome === "UNKNOWN") {
            throw new Error(
                `Refund ${refundId}: no answer from the provider yet`,
            );
        }
        if (outcome === "REFUSED") {
            this.logger.error(
                `Automatic refund ${refundId} was refused by the provider; the money is still owed`,
            );
        }
    };

    /** One `deletion_provider_call` line for this send; never throws. */
    private async trail(
        organizationId: string,
        refundId: string,
        result: string,
    ): Promise<void> {
        const refund = await prisma.paymentRefund
            .findFirst({
                where: { id: refundId, organizationId },
                select: {
                    providerRefundId: true,
                    paymentIntent: { select: { provider: true } },
                },
            })
            .catch(() => null);
        logDeletionProviderCall(this.logger, {
            organizationId,
            provider: refund?.paymentIntent.provider ?? "unknown",
            call: "refund.send",
            result,
            ref: refund?.providerRefundId ?? refundId,
        });
    }
}

function refundIdOf(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const id = (payload as { refundId?: unknown }).refundId;
    return typeof id === "string" && id.length > 0 ? id : null;
}
