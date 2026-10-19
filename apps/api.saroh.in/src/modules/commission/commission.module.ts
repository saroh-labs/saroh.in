import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { CommissionLineHandler } from "./commission-line.job";
import {
    COMMISSION_LINE_TYPE,
    COMMISSION_REFUND_TYPE,
    CommissionQueue,
} from "./commission-queue";
import {
    COMMISSION_SWEEP_TYPE,
    CommissionSweepJob,
} from "./commission-sweep.job";

/** How often a stopped sweep chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Commission (DEC-169, admin console U21): what Saroh's account managers
 * earn on the payments of the businesses they look after. It depends on
 * nothing in billing's DI: the billing webhook takes {@link CommissionQueue}
 * (exported) to queue a line after its transaction commits, and the jobs
 * read invoices and refunds directly. The console's reads and writes are
 * `admin/admin-commission.service.ts`.
 */
@Module({
    imports: [JobsModule],
    providers: [CommissionQueue, CommissionLineHandler, CommissionSweepJob],
    exports: [CommissionQueue],
})
export class CommissionModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly lines: CommissionLineHandler,
        private readonly sweep: CommissionSweepJob,
    ) {}

    /** Never under test (no worker runs), never throwing at boot. */
    async onModuleInit(): Promise<void> {
        this.registry.register(COMMISSION_LINE_TYPE, this.lines.handleLine);
        this.registry.register(COMMISSION_REFUND_TYPE, this.lines.handleRefund);
        this.registry.register(COMMISSION_SWEEP_TYPE, this.sweep.handle);
        if (env.NODE_ENV === "test") return;
        await this.sweep.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.sweep.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
