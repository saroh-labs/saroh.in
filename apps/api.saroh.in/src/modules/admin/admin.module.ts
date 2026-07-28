import { Module } from "@nestjs/common";

import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { AdminFlagsService } from "./admin-flags.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminController } from "./admin.controller";

/**
 * The Saroh control plane (S1-012) — the API behind admin.saroh.in. Closes the
 * gap `FeatureFlagModule` documented when it shipped without a controller:
 * flags could be evaluated but never operated.
 */
@Module({
    imports: [FeatureFlagModule],
    controllers: [AdminController],
    providers: [
        AdminFlagsService,
        AdminMetricsService,
        PlatformAdminGuard,
        PlatformPermissionGuard,
    ],
})
export class AdminModule {}
