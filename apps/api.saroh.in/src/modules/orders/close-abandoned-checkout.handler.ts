import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import {
    CHECKOUT_NOT_COMPLETED,
    CLOSE_ABANDONED_CHECKOUT_TYPE,
    closeCheckoutInTx,
} from "./online-checkout";

export { CLOSE_ABANDONED_CHECKOUT_TYPE } from "./online-checkout";

/**
 * Closes one abandoned checkout (round-2 G13). The site's checkout start
 * writes this job, in the order's own transaction, to run a day later
 * (`CHECKOUT_OPEN_MS`); the payload is the order's id only.
 *
 * Idempotent: `closeCheckoutInTx` re-reads the order under its lock and
 * closes only one still PENDING and unpaid, so a checkout paid meanwhile,
 * or a repeat of this job, changes nothing. An order gone since is nothing
 * to do. A payment that arrives after the close is refused and refunded by
 * `reserveOnPayment` in the webhook.
 */
@Injectable()
export class CloseAbandonedCheckoutHandler {
    private readonly logger = new Logger(CloseAbandonedCheckoutHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const orderId = orderIdOf(job.payload);
        if (!orderId || !job.organizationId) {
            this.logger.warn(
                `${CLOSE_ABANDONED_CHECKOUT_TYPE} job ${job.id} names no order; nothing to close`,
            );
            return;
        }
        const closed = await runInOrgContext(job.organizationId, () =>
            prisma.$transaction((tx) =>
                closeCheckoutInTx(tx, orderId, CHECKOUT_NOT_COMPLETED),
            ),
        );
        if (closed) this.logger.log(`Closed abandoned checkout ${orderId}`);
    };
}

function orderIdOf(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const id = (payload as { orderId?: unknown }).orderId;
    return typeof id === "string" && id.length > 0 ? id : null;
}
