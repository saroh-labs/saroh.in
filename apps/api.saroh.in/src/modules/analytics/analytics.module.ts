import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { env } from "../../env";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    ANALYTICS_AGGREGATE_TYPE,
    AnalyticsAggregateHandler,
} from "./analytics-aggregate.handler";
import { AnalyticsCoreModule } from "./analytics-core.module";
import {
    ANALYTICS_RETENTION_TYPE,
    AnalyticsRetentionHandler,
} from "./analytics-retention.handler";
import {
    ANALYTICS_ROLLUP_TYPE,
    AnalyticsRollupHandler,
} from "./analytics-rollup.handler";
import {
    AnalyticsController,
    AnalyticsPublicController,
} from "./analytics.controller";
import { TakingsService } from "./takings.service";

/** How often a stopped rollup or retention chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Analytics intake + org-safe aggregates (S7-002).
 *
 * Four parts wired together:
 *  - The PUBLIC intake: {@link AnalyticsPublicController} takes an anonymous
 *    beacon and derives the org from the target Site (no guards).
 *  - The READ surface: {@link AnalyticsController} lets an org's owners/admins
 *    read their pre-computed daily aggregates, behind the same double-guard as
 *    the other org-scoped modules ({@link OrganizationsModule} supplies the
 *    `OrganizationContextService` that `OrganizationGuard` needs, via forwardRef).
 *  - The CONSUMER: {@link AnalyticsAggregateHandler} is registered with the
 *    {@link JobHandlerRegistry} (from {@link JobsModule}) for the
 *    `analytics.aggregate` job type on boot, so the durable worker recomputes an
 *    org's daily rollups org-isolated + idempotently.
 *  - The SCHEDULE: {@link AnalyticsRollupHandler}, the hourly
 *    `analytics.rollup` chain that queues those aggregates for every
 *    business and day that received events (DEC-075). Before it, nothing
 *    queued them and a real business's Insights read no rows.
 *  - The RETENTION: {@link AnalyticsRetentionHandler}, the daily
 *    `analytics.retention` chain that deletes events past their 400-day
 *    `expiresAt` and never an aggregate (#799, DEC-012).
 *
 * NOTE: this module is registered in `app.module.ts` by the ticket owner.
 */
@Module({
    imports: [
        AnalyticsCoreModule,
        JobsModule,
        forwardRef(() => OrganizationsModule),
        CapabilitiesModule,
    ],
    controllers: [AnalyticsPublicController, AnalyticsController],
    providers: [
        AnalyticsAggregateHandler,
        AnalyticsRollupHandler,
        AnalyticsRetentionHandler,
        OrganizationGuard,
        TakingsService,
    ],
    // Re-exported so existing consumers of AnalyticsModule are unaffected by
    // the extraction; new consumers should import AnalyticsCoreModule directly.
    exports: [AnalyticsCoreModule],
})
export class AnalyticsModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: AnalyticsAggregateHandler,
        private readonly rollup: AnalyticsRollupHandler,
        private readonly retention: AnalyticsRetentionHandler,
    ) {}

    /**
     * Wire the consumers into the job worker at boot and start the rollup
     * and retention chains — the renewal job's shape (ADR-007): never under test, where no
     * worker runs, and never throwing, so a database not up yet cannot stop
     * the boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(ANALYTICS_AGGREGATE_TYPE, this.handler.handle);
        this.registry.register(ANALYTICS_ROLLUP_TYPE, this.rollup.handle);
        this.registry.register(ANALYTICS_RETENTION_TYPE, this.retention.handle);
        if (env.NODE_ENV === "test") return;
        await this.rollup.ensureScheduled();
        await this.retention.ensureScheduled();
        this.chainCheck = setInterval(() => {
            void this.rollup.ensureScheduled();
            void this.retention.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
