import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    ANALYTICS_AGGREGATE_TYPE,
    AnalyticsAggregateHandler,
} from "./analytics-aggregate.handler";
import { AnalyticsCoreModule } from "./analytics-core.module";
import {
    AnalyticsController,
    AnalyticsPublicController,
} from "./analytics.controller";

/**
 * Analytics intake + org-safe aggregates (S7-002).
 *
 * Three halves wired together:
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
 *
 * NOTE: this module is registered in `app.module.ts` by the ticket owner.
 */
@Module({
    imports: [
        AnalyticsCoreModule,
        JobsModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [AnalyticsPublicController, AnalyticsController],
    providers: [AnalyticsAggregateHandler, OrganizationGuard],
    // Re-exported so existing consumers of AnalyticsModule are unaffected by
    // the extraction; new consumers should import AnalyticsCoreModule directly.
    exports: [AnalyticsCoreModule],
})
export class AnalyticsModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: AnalyticsAggregateHandler,
    ) {}

    /** Wire the aggregate consumer into the job worker at boot. */
    onModuleInit(): void {
        this.registry.register(ANALYTICS_AGGREGATE_TYPE, this.handler.handle);
    }
}
