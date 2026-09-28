import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { runInOrgContext } from "@saroh/database";

import { PaymentsService } from "./payments.service";

/** The job that sends one automatic refund (round-2 G13, DEC-032). */
export const SEND_REFUND_TYPE = "payments.send-refund";

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
        const outcome = await runInOrgContext(organizationId, () =>
            this.payments.sendQueuedRefund(organizationId, refundId),
        );
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
}

function refundIdOf(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const id = (payload as { refundId?: unknown }).refundId;
    return typeof id === "string" && id.length > 0 ? id : null;
}
