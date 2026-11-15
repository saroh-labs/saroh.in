import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * What the two Ask AI alarms share (U8): their self-rescheduling chain
 * (ADR-007, one waiting run under `job-chain:<type>`, as `ai.retention`
 * keeps its own) and the once-a-window record each email is sent behind.
 */
export class AlarmChain {
    /**
     * `enqueue` writes the next run's `Job`, its type named by the job's
     * own constant (`job-consumers.spec.ts` reads it there).
     */
    constructor(
        private readonly type: string,
        private readonly logger: Logger,
        private readonly enqueue: (
            tx: Pick<Prisma.TransactionClient, "job">,
            runAt: Date,
        ) => Promise<unknown>,
    ) {}

    /** Leave one run waiting at `runAt`, unless one is. Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        const lock = `job-chain:${this.type}`;
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
                const waiting = await tx.job.count({
                    where: { type: this.type, status: "PENDING" },
                });
                if (waiting > 0) return;
                await this.enqueue(tx, runAt);
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next ${this.type} run: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. Never throws. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: this.type,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live === 0) await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the ${this.type} chain: ${errorName(error)}`,
            );
        }
    }

    /**
     * A run: `work`, logged past on failure, then the next run `everyMs`
     * later. Throws only when the next run can't be queued.
     */
    async run(work: () => Promise<unknown>, everyMs: number): Promise<void> {
        const now = new Date();
        try {
            await work();
        } catch (error) {
            this.logger.error(`${this.type} failed: ${errorName(error)}`);
        }
        if (!(await this.schedule(new Date(now.getTime() + everyMs)))) {
            throw new Error(
                `Could not schedule the next ${this.type} run; retrying this one`,
            );
        }
    }
}

/**
 * Claim an alarm's once-a-window record. False when it was already
 * claimed: the alarm went off in this window before.
 */
export async function claimAlert(
    db: Pick<Prisma.TransactionClient, "aiAlert">,
    kind: string,
    windowKey: string,
): Promise<boolean> {
    // skipDuplicates, not a caught P2002: an error would end a transaction.
    const { count } = await db.aiAlert.createMany({
        data: [{ kind, windowKey }],
        skipDuplicates: true,
    });
    return count === 1;
}

export function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
