import { Injectable, Logger } from "@nestjs/common";

import type { JobHandler, JobHandlerRegistryPort } from "./job-queue.port";

/**
 * Maps a job `type` to its {@link JobHandler} (S3-003).
 *
 * Feature modules register their handler at boot — NotificationsModule
 * registers `enquiry.notify`, for one. The registry is a singleton provider
 * exported by `JobsModule`, so any importing module injects it and registers
 * without the jobs module depending on them (no cycles).
 *
 * A `type` with no registered handler has no fallback: `get` returns
 * `undefined` and the worker dead-letters the job. It used to return a no-op
 * that resolved, so the worker marked such jobs DONE — and `booking.notify`,
 * enqueued on every booking since S4-002 with its handler left to a later
 * ticket, was recorded as delivered every time while nothing was sent.
 * `job-consumers.spec.ts` now pins producers and consumers against each other.
 */
@Injectable()
export class JobHandlerRegistry implements JobHandlerRegistryPort {
    private readonly logger = new Logger(JobHandlerRegistry.name);
    private readonly handlers = new Map<string, JobHandler>();

    /**
     * Register the handler for `type`. Registering a type twice is a wiring bug
     * (two owners for one job kind), so it throws rather than silently
     * shadowing the first handler.
     */
    register(type: string, handler: JobHandler): void {
        if (this.handlers.has(type)) {
            throw new Error(
                `A handler for job type "${type}" is already registered.`,
            );
        }
        this.handlers.set(type, handler);
        this.logger.log(`Registered job handler for "${type}".`);
    }

    /** The handler registered for `type`, or `undefined` when there is none. */
    get(type: string): JobHandler | undefined {
        return this.handlers.get(type);
    }

    /** True if a handler is registered for `type`. */
    has(type: string): boolean {
        return this.handlers.has(type);
    }
}
