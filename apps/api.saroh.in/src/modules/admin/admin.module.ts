import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Module } from "@nestjs/common";

import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { env } from "../../env";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { DomainsModule } from "../domains/domains.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { HealthModule } from "../health/health.module";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { MediaStorageModule } from "../media/media-storage.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AdminPricingController } from "../pricing/admin-pricing.controller";
import { CatalogueWritesService } from "../pricing/catalogue-writes.service";
import { CouponsService } from "../pricing/coupons.service";
import { PricingModule } from "../pricing/pricing.module";
import { WaitlistModule } from "../waitlist/waitlist.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminBusinessReportsController } from "./admin-business-reports.controller";
import { AdminBusinessReportsService } from "./admin-business-reports.service";
import { AdminDeploymentsController } from "./admin-deployments.controller";
import { AdminDeploymentsService } from "./admin-deployments.service";
import { AdminFlagsService } from "./admin-flags.service";
import { AdminHealthService } from "./admin-health.service";
import { AdminLifecycleService } from "./admin-lifecycle.service";
import { AdminMachineryController } from "./admin-machinery.controller";
import { AdminMachineryService } from "./admin-machinery.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminOrganizationViewService } from "./admin-organization-view.service";
import { AdminOrganizationsController } from "./admin-organizations.controller";
import { AdminOrganizationsService } from "./admin-organizations.service";
import { AdminOverridesService } from "./admin-overrides.service";
import { AdminPeopleController } from "./admin-people.controller";
import { AdminPeopleService } from "./admin-people.service";
import { AdminSiteTrackersService } from "./admin-site-trackers.service";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";
import { AdminUsageController } from "./admin-usage.controller";
import { AdminUsageService } from "./admin-usage.service";
import { AdminWaitlistController } from "./admin-waitlist.controller";
import { AdminWaitlistService } from "./admin-waitlist.service";
import { AdminController } from "./admin.controller";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";
import {
    ORGANIZATION_DELETION_CLEANUP_TYPE,
    OrganizationDeletionCleanupHandler,
} from "./organization-deletion-cleanup.handler";
import {
    ORGANIZATION_DELETION_TYPE,
    OrganizationDeletionHandler,
} from "./organization-deletion.handler";
import {
    ORGANIZATION_RETENTION_ERASE_TYPE,
    OrganizationRetentionEraseHandler,
} from "./organization-retention-erase.handler";
import {
    SECURITY_LOG_RETENTION_TYPE,
    SecurityLogRetentionHandler,
} from "./security-log-retention.handler";

/** How often a stopped deletion chain is looked for and restarted. */
const CHAIN_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * The Saroh control plane (S1-012) — the API behind admin.saroh.in. Closes the
 * gap `FeatureFlagModule` documented when it shipped without a controller:
 * flags could be evaluated but never operated.
 */
@Module({
    imports: [
        FeatureFlagModule,
        BillingModule,
        CapabilitiesModule,
        OrganizationsModule,
        DomainsModule,
        HealthModule,
        WebhooksModule,
        PricingModule,
        WaitlistModule,
        JobsModule,
        // A deleted business's files, erased when its retention ends
        // (`organization.retention.erase`, DEC-122).
        MediaStorageModule,
    ],
    controllers: [
        AdminController,
        AdminOrganizationsController,
        AdminStaffController,
        AdminPeopleController,
        AdminMachineryController,
        AdminWaitlistController,
        AdminPricingController,
        AdminDeploymentsController,
        AdminBusinessReportsController,
        AdminUsageController,
    ],
    providers: [
        IdempotencyService,
        AdminFlagsService,
        AdminAccessService,
        AdminAuditService,
        AdminMetricsService,
        AdminOrganizationViewService,
        AdminOrganizationsService,
        AdminLifecycleService,
        AdminOverridesService,
        AdminSiteTrackersService,
        AdminStaffService,
        AdminPeopleService,
        AdminMachineryService,
        AdminOperationsService,
        AdminHealthService,
        AdminWaitlistService,
        AdminDeploymentsService,
        AdminBusinessReportsService,
        AdminUsageService,
        // Pricing catalogue writes (U4): they audit through AdminAuditService.
        CatalogueWritesService,
        CouponsService,
        PlatformAdminGuard,
        PlatformPermissionGuard,
        OrganizationAccessSessionGuard,
        // The daily sweep that deletes a business past its window (#907),
        // and what a deleted business leaves behind (#921).
        OrganizationDeletionHandler,
        OrganizationDeletionCleanupHandler,
        // 180 days after deletion: files and personal data erased (DEC-122).
        OrganizationRetentionEraseHandler,
        // Security logs kept one year (DEC-122).
        SecurityLogRetentionHandler,
    ],
})
export class AdminModule implements OnModuleInit, OnModuleDestroy {
    private chainCheck?: ReturnType<typeof setInterval>;

    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly deletion: OrganizationDeletionHandler,
        private readonly cleanup: OrganizationDeletionCleanupHandler,
        private readonly retentionErase: OrganizationRetentionEraseHandler,
        private readonly securityLogs: SecurityLogRetentionHandler,
    ) {}

    /**
     * Registers the deletion sweep and starts its chain — the renewal job's
     * shape (ADR-007): never under test, where no worker runs, and never
     * throwing, so a database not up yet cannot stop the boot.
     */
    async onModuleInit(): Promise<void> {
        this.registry.register(
            ORGANIZATION_DELETION_TYPE,
            this.deletion.handle,
        );
        this.registry.register(
            ORGANIZATION_DELETION_CLEANUP_TYPE,
            this.cleanup.handle,
        );
        this.registry.register(
            ORGANIZATION_RETENTION_ERASE_TYPE,
            this.retentionErase.handle,
        );
        this.registry.register(
            SECURITY_LOG_RETENTION_TYPE,
            this.securityLogs.handle,
        );
        if (env.NODE_ENV === "test") return;
        await this.deletion.schedule(new Date());
        await this.retentionErase.schedule(new Date());
        await this.securityLogs.schedule(new Date());
        this.chainCheck = setInterval(() => {
            void this.deletion.ensureScheduled();
            void this.retentionErase.ensureScheduled();
            void this.securityLogs.ensureScheduled();
        }, CHAIN_CHECK_MS);
        this.chainCheck.unref();
    }

    onModuleDestroy(): void {
        clearInterval(this.chainCheck);
    }
}
