import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import {
    liveCatalogueVersion,
    prisma,
    startMissingFreeRows,
} from "@saroh/database";

import { FREE_PLAN_ID } from "./catalogue-access.service";

/**
 * Give a business its Free subscription row when a catalogue version goes
 * live (#839). Sign-up starts a business on Free only while a version is
 * live; one that joined while the first version was scheduled, or waiting
 * on the billing provider, has no row, reads as legacy `no-plan`, and plan
 * rules skip it. This job, queued at every go-live, closes that gap.
 *
 * Who it starts is the Free-rows backfill's rule (`startMissingFreeRows`):
 * a business that joined before the first version was published is an
 * existing business and starts only once it has a live plan override, so
 * this never puts an existing business on Free before it is grandfathered
 * (`docs/architecture/PRICING_ROLLOUT.md`). Idempotent: a business with a
 * row is never touched, so a duplicate run writes nothing.
 */
export const BILLING_FREE_ROWS_TYPE = "billing.free-rows.start";

export interface FreeRowsPayload {
    /** The version going live; for the logs only. */
    version: number;
}

type JobTx = Prisma.TransactionClient;

/**
 * Queue the job on the caller's transaction, at `runAt` (the go-live). Not
 * queued when it could only no-op: a version is live already and every
 * business that isn't deleted has its row.
 */
export async function enqueueFreeRows(
    tx: JobTx,
    payload: FreeRowsPayload,
    runAt: Date,
    now: Date,
): Promise<boolean> {
    if (!(await freeRowsMayBeMissing(tx, now))) return false;
    await tx.job.create({
        data: { type: BILLING_FREE_ROWS_TYPE, payload: { ...payload }, runAt },
    });
    return true;
}

/**
 * Whether a business may be without its Free row by the go-live: one is
 * already, or no version is live (so every sign-up until then gets none).
 */
async function freeRowsMayBeMissing(tx: JobTx, now: Date): Promise<boolean> {
    const missing = await tx.organization.count({
        where: { subscription: null, deletedRetainedAt: null },
    });
    if (missing > 0) return true;
    return (await liveCatalogueVersion(tx, now)) === null;
}

@Injectable()
export class FreeRowsHandler {
    private readonly logger = new Logger(FreeRowsHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const version = (job.payload as Partial<FreeRowsPayload> | null)
            ?.version;
        const report = await startMissingFreeRows(prisma, {
            planId: FREE_PLAN_ID,
        });
        if (!report) {
            // Cancelled, held, or a live version with no Free plan: the next
            // go-live queues another run.
            this.logger.warn(
                `billing_free_rows_no_plan job=${job.id} version=${version ?? "?"}`,
            );
            return;
        }
        this.logger.log(
            `billing_free_rows job=${job.id} version=${version ?? "?"} started=${report.started} not_grandfathered=${report.notGrandfathered} read=${report.organizations}`,
        );
    };
}
