import { Module } from "@nestjs/common";

import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminFlagsService } from "./admin-flags.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminOrganizationViewService } from "./admin-organization-view.service";
import { AdminController } from "./admin.controller";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";

/**
 * The Saroh control plane (S1-012) — the API behind admin.saroh.in. Closes the
 * gap `FeatureFlagModule` documented when it shipped without a controller:
 * flags could be evaluated but never operated.
 */
@Module({
    imports: [FeatureFlagModule],
    controllers: [AdminController],
    providers: [
        IdempotencyService,
        AdminFlagsService,
        AdminAccessService,
        AdminAuditService,
        AdminMetricsService,
        AdminOrganizationViewService,
        PlatformAdminGuard,
        PlatformPermissionGuard,
        OrganizationAccessSessionGuard,
    ],
})
export class AdminModule {}
