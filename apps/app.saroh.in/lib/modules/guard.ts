import { cache } from "react";

import type { ModuleView } from "./schema";
import { listModules } from "./service";

/**
 * Route-level capability checking (#117, §21).
 *
 * `PRODUCT_STRATEGY.md` §21: "Capability-aware UX must be backed by
 * capability-aware server enforcement. Hiding a navigation item is not
 * security." The sidebar already filters itself off `moduleKey`
 * (`nav-items.tsx` `filterNavGroups`), but nothing stopped a merchant — or a
 * bookmark, or a link in an email — from opening a disabled module's page
 * directly and meeting a screen that cannot work.
 *
 * This is the UX half. The server half is `@RequireModule` +
 * `ModuleEnforcementGuard` in api.saroh.in, which stays dark until
 * `MODULE_ENFORCEMENT` is switched on. Neither substitutes for the other: this
 * one explains, that one enforces.
 */

/** Cached per request so several gated segments cost one API call. */
const modulesForRequest = cache(async (): Promise<ModuleView[]> =>
    listModules(),
);

export type ModuleAccess =
    | { state: "available" }
    | { state: "unavailable"; module: ModuleView }
    /** Availability could not be established; do not claim it is switched off. */
    | { state: "unknown" };

/**
 * Whether a module may be used in the active Organization.
 *
 * `listModules` returns every module with its state, so an empty list means
 * there is no active Organization rather than "nothing is enabled" — reported
 * as `unknown` and allowed through. Rendering "this is turned off" because we
 * failed to look it up would be exactly the untruthful state §5 forbids, and a
 * genuine outage still throws from `listModules` into the error boundary.
 */
export async function moduleAccess(moduleKey: string): Promise<ModuleAccess> {
    const modules = await modulesForRequest();
    if (modules.length === 0) return { state: "unknown" };

    const found = modules.find((m) => m.key === moduleKey);
    if (!found) return { state: "unknown" };

    return found.lifecycle === "ENABLED"
        ? { state: "available" }
        : { state: "unavailable", module: found };
}
