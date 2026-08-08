import { Module } from "@nestjs/common";

import { FeatureFlagService } from "./feature-flags.service";

/**
 * Feature-flags module (S1-012). Exposes FeatureFlagService for other modules
 * to inject. No controller is registered — admin management endpoints would
 * need guards owned by another agent's src/common changes, so they are
 * deferred to a follow-up; the service + module are the shipped surface.
 */
@Module({
    providers: [FeatureFlagService],
    exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
