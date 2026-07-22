import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { ModuleAvailabilityService } from "./module-availability.service";
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
    imports: [FeatureFlagModule, BillingModule],
    providers: [
        ModuleReadinessRegistry,
        ModuleAvailabilityService,
        ModuleLifecycleService,
    ],
    exports: [
        ModuleReadinessRegistry,
        ModuleAvailabilityService,
        ModuleLifecycleService,
    ],
})
export class CapabilitiesModule {}
