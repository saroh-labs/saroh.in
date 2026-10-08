import type { PlanIntent } from "@saroh/pricing-catalog";
import { resolvePlanIntent } from "@saroh/pricing-catalog";

import { liveCatalogue } from "./service";

/**
 * The plan a visitor picked on saroh.in, as onboarding receives it from
 * sign-up (`?plan=&cycle=`, plan U27), checked against the live catalogue
 * (`GET /public/pricing`, the price list saroh.in draws). Server-only.
 *
 * A catalogue that can't be read is not a reason to stop someone setting up:
 * the plan goes on to the checkout unchecked, and the checkout's own answer
 * is what they're told (`resolvePlanIntent`'s `unchecked`).
 */
export async function readPlanIntent(query: {
    plan?: string | string[];
    cycle?: string | string[];
}): Promise<PlanIntent> {
    const plan = first(query.plan);
    if (!plan) return { kind: "none" };
    return resolvePlanIntent(
        { plan, cycle: first(query.cycle) },
        await liveCatalogue(),
    );
}

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}
