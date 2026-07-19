import {
    Inject,
    Injectable,
    Logger,
    type OnModuleDestroy,
    type OnModuleInit,
} from "@nestjs/common";
import type { Job } from "@saroh/database";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";

import { env } from "../../env";
import { JobHandlerRegistry } from "./job-handler.registry";
import type { JobQueue } from "./job-queue.port";
import { JOB_QUEUE } from "./job-queue.port";

/**
 * Polling job worker (S3-003).
 *
 * On an interval it claims a batch of due jobs (the port guarantees no other
 * worker gets the same rows), dispatches each to its handler, then COMPLETEs on
 * success or FAILs (recording the error) on throw — the port decides
 * retry-vs-dead-letter. This is the "reliably queues owner notification" half:
 * a committed lead's `enquiry.notify` job is retried until it succeeds or
 * exhausts its attempts.
 *
 * The loop does NOT start under `NODE_ENV=test` (Nest instantiates providers in
 * integration/e2e tests; a live poller would fight the test DB and leak
 * timers). Tests instead call {@link runOnce} to drive one tick deterministically.
 */
@Injectable()
export class JobWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(JobWorkerService.name);
    /** Stable per-process id recorded on each claimed row (`lockedBy`). */
    private readonly workerId = `${hostname()}#${process.pid}#${randomBytes(3).toString("hex")}`;
    private timer?: ReturnType<typeof setInterval>;
    /** Re-entrancy guard: a slow tick must not overlap the next interval fire. */
    private ticking = false;

    constructor(
        @Inject(JOB_QUEUE) private readonly queue: JobQueue,
        private readonly registry: JobHandlerRegistry,
    ) {}

    onModuleInit(): void {
        if (env.NODE_ENV === "test") {
            this.logger.log("NODE_ENV=test — job poll loop disabled.");
            return;
        }
        this.logger.log(
            `Starting job worker "${this.workerId}" ` +
                `(poll ${env.JOB_WORKER_POLL_MS}ms, batch ${env.JOB_WORKER_BATCH}).`,
        );
        this.timer = setInterval(() => {
            void this.runOnce();
        }, env.JOB_WORKER_POLL_MS);
        // Don't keep the event loop alive just for the poller.
        this.timer.unref?.();
    }

    onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /**
     * Run exactly one poll tick: claim a batch and dispatch each job. Returns
     * the number of jobs processed this tick. Safe to call directly from tests.
     * Overlapping ticks are skipped (returns 0) so a long-running batch can't
     * be double-processed by the interval.
     */
    async runOnce(): Promise<number> {
        if (this.ticking) return 0;
        this.ticking = true;
        try {
            const jobs = await this.queue.claimDue(
                this.workerId,
                env.JOB_WORKER_BATCH,
            );
            for (const job of jobs) {
                await this.dispatch(job);
            }
            return jobs.length;
        } catch (err) {
            // A claim failure (e.g. DB blip) must not kill the interval; log and
            // let the next tick retry.
            this.logger.error(
                `Job poll tick failed: ${(err as Error).message}`,
            );
            return 0;
        } finally {
            this.ticking = false;
        }
    }

    private async dispatch(job: Job): Promise<void> {
        const handler = this.registry.get(job.type);
        try {
            await handler(job);
            await this.queue.complete(job.id);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
                `Job ${job.id} (${job.type}) failed attempt ` +
                    `${job.attempts + 1}/${job.maxAttempts}: ${message}`,
            );
            await this.queue.fail(job.id, message);
        }
    }
}
