import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { BillingModule } from "../billing/billing.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationContextModule } from "../organizations/organization-context.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CapabilitiesController } from "./capabilities.controller";
import { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleEnforcementGuard } from "./module-enforcement.guard";
import { ModuleLifecycleService } from "./module-lifecycle.service";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

/**
 * Modular capabilities (ADR-003). Provides the module lifecycle commands, the
 * effective-availability read model, and the readiness registry. Depends on
 * FeatureFlagModule (rollout gate) and BillingModule (entitlement gate); the
 * typed registry itself is a plain module with no DI. Controllers are added in
 * #115.
 */
@Module({
    imports: [
        FeatureFlagModule,
        BillingModule,
        OrganizationsModule,
        OrganizationContextModule,
        // Activation instrumentation (#176) — the write primitives only, so no
        // cycle through AnalyticsModule's controllers and org guard.
        AnalyticsCoreModule,
    ],
    controllers: [CapabilitiesController],
    providers: [
        ModuleReadinessRegistry,
        ModuleAvailabilityService,
        ModuleLifecycleService,
        ModuleEnforcementGuard,
        OrganizationGuard,
    ],
    exports: [
        ModuleReadinessRegistry,
        ModuleAvailabilityService,
        ModuleLifecycleService,
        // Exported so any domain module can adopt @RequireModule enforcement by
        // importing CapabilitiesModule and adding ModuleEnforcementGuard to its
        // controller's @UseGuards. Dark by default.
        ModuleEnforcementGuard,
        // Re-exported with it: the guard is instantiated in the CONSUMER's
        // injector, so OrganizationContextService must resolve there too.
        // Without this every adopting module would have to know that internal
        // dependency and import it itself.
        OrganizationContextModule,
    ],
})
export class CapabilitiesModule {}
