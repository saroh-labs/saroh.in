import { getOnboardingUrl } from "@/lib/app-urls";

/** Longer than any catalogue id; anything past it is not one. */
const MAX_PLAN = 64;

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/**
 * Where a new account goes when the visitor picked a plan on saroh.in (plan
 * U27): onboarding, carrying `?plan=&cycle=` so the business it makes goes
 * on to that plan's checkout. Null for no plan or Free, which is where every
 * business starts anyway (onboarding with nothing to carry).
 *
 * Only carried, never trusted: onboarding checks the plan against the live
 * catalogue, and the checkout prices it on the server.
 */
export function onboardingForPlan(
    plan: string | string[] | undefined,
    cycle: string | string[] | undefined,
): string | null {
    const asked = first(plan)?.trim().slice(0, MAX_PLAN);
    if (!asked || asked === "free") return null;
    const q = new URLSearchParams({ plan: asked });
    const c = first(cycle);
    if (c === "month" || c === "year") q.set("cycle", c);
    return `${getOnboardingUrl()}?${q.toString()}`;
}
