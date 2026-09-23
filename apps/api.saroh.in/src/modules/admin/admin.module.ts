import { Module } from "@nestjs/common";

import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { BillingModule } from "../billing/billing.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { DomainsModule } from "../domains/domains.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { HealthModule } from "../health/health.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
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
import { AdminPeopleController } from "./admin-people.controller";
import { AdminPeopleService } from "./admin-people.service";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";
import { AdminController } from "./admin.controller";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";

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
    ],
    controllers: [
        AdminController,
        AdminOrganizationsController,
        AdminStaffController,
        AdminPeopleController,
        AdminMachineryController,
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
        AdminStaffService,
        AdminPeopleService,
        AdminMachineryService,
        AdminOperationsService,
        AdminHealthService,
        PlatformAdminGuard,
        PlatformPermissionGuard,
        OrganizationAccessSessionGuard,
    ],
})
export class AdminModule {}
