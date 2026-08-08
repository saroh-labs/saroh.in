import type { Provider } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { JobHandlerRegistry } from "./job-handler.registry";
import { JOB_QUEUE } from "./job-queue.port";
import { JobWorkerService } from "./job-worker.service";
import { PrismaJobQueue } from "./prisma-job-queue";

/**
 * Nest provider exposing the {@link JobQueue} port under {@link JOB_QUEUE},
 * backed by Postgres. Tests inject a `FakeJobQueue` by constructing the worker
 * directly.
 */
export const jobQueueProvider: Provider = {
    provide: JOB_QUEUE,
    useFactory: () => new PrismaJobQueue(),
};

/**
 * Durable background-job infrastructure (S3-003).
 *
 * Exports {@link JOB_QUEUE} (so producers can `enqueue`) and
 * {@link JobHandlerRegistry} (so feature modules can `register` a handler for
 * their job `type`). The {@link JobWorkerService} runs the poll loop in-process
 * (disabled under NODE_ENV=test). Registered globally in `app.module.ts`.
 */
@Module({
    providers: [jobQueueProvider, JobHandlerRegistry, JobWorkerService],
    exports: [JOB_QUEUE, JobHandlerRegistry],
})
export class JobsModule {}
