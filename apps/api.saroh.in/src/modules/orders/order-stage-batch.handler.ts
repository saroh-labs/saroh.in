import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { runInOrgContext } from "@saroh/database";

import {
    ORDER_STAGE_BATCH_COMMIT_TYPE,
    OrderStageBatchService,
} from "./order-stage-batch.service";

export { ORDER_STAGE_BATCH_COMMIT_TYPE } from "./order-stage-batch.service";

/**
 * Commits one held bulk move (round-2 B6) when its ten seconds are up. The
 * batch's own transaction wrote this job; the payload is the batch's id.
 *
 * Idempotent: `commitBatch` moves only lines with no result yet, and a
 * batch cancelled by "Undo all" moves nothing, so a batch already sent by
 * "Send now", or a repeat of this job, changes nothing. A line that failed
 * for no reason of its own makes the job throw, and the worker retries it.
 */
@Injectable()
export class OrderStageBatchCommitHandler {
    private readonly logger = new Logger(OrderStageBatchCommitHandler.name);

    constructor(private readonly batches: OrderStageBatchService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const batchId = batchIdOf(job.payload);
        const organizationId = job.organizationId;
        if (!batchId || !organizationId) {
            this.logger.warn(
                `${ORDER_STAGE_BATCH_COMMIT_TYPE} job ${job.id} names no batch; nothing to commit`,
            );
            return;
        }
        const batch = await runInOrgContext(organizationId, async () => {
            const found = await this.batches.exists(organizationId, batchId);
            return found
                ? this.batches.commitBatch(organizationId, batchId)
                : null;
        });
        if (!batch) {
            this.logger.warn(
                `Bulk move ${batchId} isn't there any more; nothing to commit`,
            );
        }
    };
}

function batchIdOf(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const id = (payload as { batchId?: unknown }).batchId;
    return typeof id === "string" && id.length > 0 ? id : null;
}
