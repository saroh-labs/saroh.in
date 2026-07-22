import { SetMetadata } from "@nestjs/common";

import type { ModuleKey } from "./module-registry";

/** Reflector metadata key carrying the module a handler/controller requires. */
export const REQUIRE_MODULE_KEY = "saroh:requireModule";

/**
 * Mark a controller or handler as requiring a capability module (ADR-003 / #117).
 * `ModuleEnforcementGuard` reads this and, when enforcement is enabled, refuses
 * the request if the module is not effectively available for the actor's
 * Organization/Project. Enforcement is DARK by default (no-op unless the
 * `MODULE_ENFORCEMENT` env switch is set), so annotating an endpoint is safe to
 * ship ahead of the controlled rollout.
 *
 * Apply AFTER OrganizationGuard so the resolved OrganizationContext is present:
 *   @UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
 *   @RequireModule("CRM")
 */
export const RequireModule = (moduleKey: ModuleKey) =>
    SetMetadata(REQUIRE_MODULE_KEY, moduleKey);
