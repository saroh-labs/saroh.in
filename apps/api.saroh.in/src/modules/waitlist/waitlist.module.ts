import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { env } from "../../env";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { PublicLaunchOfferController } from "./public-offer.controller";
import {
    WAITLIST_RETENTION_TYPE,
    WaitlistRetentionHandler,
} from "./waitlist-retention.handler";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";

/** How often a stopped retention chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * PUBLIC waitlist capture. Intentionally guardless and org-agnostic: a signup
 * happens before any Organization or User exists, so there is nothing to scope
 * to and no session to check. Also the retention sweep (U30, KTD-17), and
 * the launch offer saroh.in's waitlist page shows (`PublicLaunchOfferController`).
 */
@Module({
    imports: [JobsModule],
    controllers: [WaitlistController, PublicLaunchOfferController],
    providers: [WaitlistService, WaitlistRetentionHandler],
    exports: [WaitlistService],
})
export class WaitlistModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly retention: WaitlistRetentionHandler,
    ) {}

    /**
     * Registers the retention sweep and starts its chain — the renewal job's
     * shape (ADR-007): never under test, where no worker runs, and never
     * throwing, so a database not up yet cannot stop the boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(WAITLIST_RETENTION_TYPE, this.retention.handle);
        if (env.NODE_ENV === "test") return;
        await this.retention.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.retention.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
