import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { runInOrgContext } from "@saroh/database";

import { MANDATE_CANCEL_TYPE, scopeOfJob } from "./mandate-cancel-job";
import { MandatesService } from "./mandates.service";

/**
 * Asks the provider to cancel the mandates a subscription's end or a merge
 * marked CANCELLED (round-2 D20). By the time this runs they can't be
 * charged: this only gets the provider's confirmation.
 *
 * Idempotent: a mandate the provider has confirmed is skipped, so a job
 * delivered twice asks once. An unsure answer throws, and the worker asks
 * again on its backoff. A refusal is logged and not retried; asking again
 * would be refused again.
 */
@Injectable()
export class MandateCancelHandler {
    private readonly logger = new Logger(MandateCancelHandler.name);

    constructor(private readonly mandates: MandatesService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const scope = scopeOfJob(job.organizationId, job.payload);
        if (!scope) {
            this.logger.warn(
                `${MANDATE_CANCEL_TYPE} job ${job.id} names no subscription or contact; nothing to cancel`,
            );
            return;
        }
        const settled = await runInOrgContext(scope.organizationId, () =>
            this.mandates.settle(scope),
        );
        if (settled.unsure > 0) {
            throw new Error(
                `${settled.unsure} mandate cancel(s) not answered by the provider yet`,
            );
        }
    };
}
