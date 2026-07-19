import type { Job } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { env } from "../../env";
import type { EnqueueJobInput, JobQueue } from "./job-queue.port";
import { nextBackoff } from "./job-queue.port";

/**
 * Postgres-backed {@link JobQueue} (S3-003).
 *
 * The one piece that MUST be a real database is {@link claimDue}: it uses
 * `FOR UPDATE SKIP LOCKED` so any number of concurrent workers can poll the
 * same table and never claim the same row. That SQL can't run against a mocked
 * Prisma, which is why the worker + the retry logic are unit-tested against the
 * in-memory `FakeJobQueue` instead, and only {@link fail}'s branch selection is
 * unit-tested here with a mocked `prisma.job`.
 */
export class PrismaJobQueue implements JobQueue {
    /**
     * @param visibilityMs How long a claimed-but-unfinished job stays invisible
     * before another worker may reclaim it (crash recovery). Defaults to the
     * app env.
     */
    constructor(
        private readonly visibilityMs: number = env.JOB_VISIBILITY_MS,
    ) {}

    async enqueue(input: EnqueueJobInput): Promise<Job> {
        return prisma.job.create({
            data: {
                type: input.type,
                payload: input.payload as Prisma.InputJsonValue,
                organizationId: input.organizationId ?? null,
                // Omit maxAttempts/runAt when absent so the schema defaults
                // (5 attempts, runAt = now) apply.
                ...(input.maxAttempts !== undefined
                    ? { maxAttempts: input.maxAttempts }
                    : {}),
                ...(input.runAt !== undefined ? { runAt: input.runAt } : {}),
            },
        });
    }

    /**
     * Atomically claim due jobs. A single `UPDATE … WHERE id IN (SELECT … FOR
     * UPDATE SKIP LOCKED)` is the standard Postgres work-queue pattern: the
     * inner select locks only rows no other worker holds, skipping the rest, and
     * the outer update flips them to PROCESSING in the same statement. Wrapped in
     * `$transaction` per the port contract. `RETURNING j.*` gives back the
     * claimed rows.
     */
    async claimDue(workerId: string, limit: number): Promise<Job[]> {
        const visibilitySecs = this.visibilityMs / 1000;
        return prisma.$transaction((tx) =>
            tx.$queryRaw<Job[]>(Prisma.sql`
                UPDATE "Job" AS j
                SET status = 'PROCESSING',
                    "lockedAt" = now(),
                    "lockedBy" = ${workerId}
                WHERE j.id IN (
                    SELECT id FROM "Job"
                    WHERE (status = 'PENDING' AND "runAt" <= now())
                       OR (status = 'PROCESSING'
                           AND "lockedAt" < now() - make_interval(secs => ${visibilitySecs}))
                    ORDER BY "runAt" ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT ${limit}
                )
                RETURNING j.*
            `),
        );
    }

    async complete(id: string): Promise<void> {
        await prisma.job.update({
            where: { id },
            data: {
                status: "DONE",
                processedAt: new Date(),
                lockedAt: null,
                lockedBy: null,
            },
        });
    }

    /**
     * Record a failure. Reads the job to know its attempt count, then either
     * dead-letters (FAILED, terminal) once `attempts+1 >= maxAttempts`, or
     * reschedules PENDING at `now + nextBackoff(attempts)`. The lock is always
     * released so a reclaim/retry can proceed.
     */
    async fail(id: string, error: string): Promise<void> {
        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) return;

        const attempts = job.attempts + 1;
        const deadLetter = attempts >= job.maxAttempts;

        await prisma.job.update({
            where: { id },
            data: deadLetter
                ? {
                      status: "FAILED",
                      attempts,
                      lastError: error,
                      processedAt: new Date(),
                      lockedAt: null,
                      lockedBy: null,
                  }
                : {
                      status: "PENDING",
                      attempts,
                      lastError: error,
                      runAt: new Date(Date.now() + nextBackoff(attempts)),
                      lockedAt: null,
                      lockedBy: null,
                  },
        });
    }
}
