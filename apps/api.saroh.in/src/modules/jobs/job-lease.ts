import { Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

const logger = new Logger("JobLease");

/** How often a long handler renews its lease: well inside the default 5 min. */
export const LEASE_RENEW_MS = 60_000;

/**
 * Keep a claimed job's lease while a handler that can outlive
 * `JOB_VISIBILITY_MS` runs (a data export, DEC-120): every
 * {@link LEASE_RENEW_MS} it moves `lockedAt` on, fenced on the lease like
 * the queue's own writes (`status = PROCESSING AND lockedBy = <worker>`),
 * so another worker never reclaims a job that is still being worked on.
 * `lockedAt` is written as the claim writes it, UTC in a timestamp without
 * a zone (`prisma-job-queue.ts`).
 *
 * Returns the stop. A renewal that fails is logged and tried again on the
 * next tick; the handler goes on.
 */
export function keepJobLease(
    job: Pick<Job, "id" | "lockedBy" | "type">,
    everyMs: number = LEASE_RENEW_MS,
): () => void {
    if (!job.lockedBy) return () => undefined;
    const lockedBy = job.lockedBy;
    const timer = setInterval(() => {
        prisma.$executeRaw`UPDATE "Job" SET "lockedAt" = (now() AT TIME ZONE 'UTC') WHERE id = ${job.id} AND status = 'PROCESSING' AND "lockedBy" = ${lockedBy}`.catch(
            (error: unknown) => {
                logger.warn(
                    `job_lease_renew_failed job=${job.id} type=${job.type} error=${(error as Error).name}`,
                );
            },
        );
    }, everyMs);
    timer.unref();
    return () => clearInterval(timer);
}
