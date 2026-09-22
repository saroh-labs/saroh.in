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

/** Reflector metadata key: the route works while the module is still being set up. */
export const IGNORE_MODULE_READINESS_KEY = "saroh:ignoreModuleReadiness";

/**
 * The route needs the module switched on, but not its setup finished.
 *
 * A module's readiness blockers say "this is not configured yet" — Payments
 * with no provider connected, for one. For a route that works without that
 * setup it is the wrong refusal: a gym that records cash and UPI by hand
 * never connects a provider, and must still be able to issue invoices once
 * enforcement is on (ADR-007). The gates — who may, whether the module is on,
 * rollout, entitlement — still apply in full.
 *
 * Pair it with `@RequireModule`, which it does not replace.
 */
export const IgnoreModuleReadiness = () =>
    SetMetadata(IGNORE_MODULE_READINESS_KEY, true);
