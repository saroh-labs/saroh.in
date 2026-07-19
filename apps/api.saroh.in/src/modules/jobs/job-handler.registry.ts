import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";

import type { JobHandler, JobHandlerRegistryPort } from "./job-queue.port";

/**
 * Maps a job `type` to its {@link JobHandler} (S3-003).
 *
 * Feature modules register their handler at boot — e.g. an enquiry module
 * (S3-006) will `register("enquiry.notify", …)`. The registry is a singleton
 * provider exported by `JobsModule`, so any importing module injects it and
 * registers without the jobs module depending on them (no cycles).
 *
 * A `type` with no registered handler falls back to a loud no-op that resolves
 * successfully, so the worker COMPLETES it rather than retrying forever — an
 * unknown/renamed type must never wedge the whole queue. The error log is the
 * signal to add or fix the registration.
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

    /** Look up the handler for `type`, or the loud no-op fallback. */
    get(type: string): JobHandler {
        return this.handlers.get(type) ?? this.defaultHandler;
    }

    /** True if a real handler is registered for `type` (excludes the fallback). */
    has(type: string): boolean {
        return this.handlers.has(type);
    }

    /**
     * Fallback for unknown types: log loudly and RESOLVE, so the worker marks
     * the job DONE and moves on instead of dead-lettering the whole backlog on
     * one stray type.
     */
    private readonly defaultHandler: JobHandler = (job: Job): Promise<void> => {
        this.logger.error(
            `No handler registered for job type "${job.type}" ` +
                `(id=${job.id}); completing as a no-op. Register a handler ` +
                `for this type or stop enqueuing it.`,
        );
        return Promise.resolve();
    };
}
