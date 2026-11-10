import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { LimitsModule } from "../rate-limits/limits.module";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";

/**
 * Owner-managed API keys (plan 2026-11-10-001, U5) and the guard that turns
 * one into a business's context (U6); public routes import this module and
 * put `@UseGuards(ApiKeyGuard)` on their controllers. Nest builds a route's
 * guard in the route's own module, so the guard's dependencies are
 * re-exported here: importing this module is enough.
 */
@Module({
    imports: [
        OrganizationContextModule,
        AuditModule,
        LimitsModule,
        FeatureFlagModule,
    ],
    controllers: [ApiKeysController],
    providers: [ApiKeysService, ApiKeyGuard],
    exports: [
        ApiKeysService,
        ApiKeyGuard,
        OrganizationContextModule,
        LimitsModule,
        FeatureFlagModule,
    ],
})
export class ApiKeysModule {}
