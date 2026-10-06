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

/** An invite token's shape (32 random bytes, base64url); anything else isn't one. */
const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Where a new account goes when it came from an opening-day invite (plan
 * U31): onboarding, carrying the invite, which grants the launch offer to
 * the business it makes instead of a checkout. It wins over a plan: an
 * invitee was promised the offer, not asked to pay.
 *
 * Only carried, never trusted: the API checks the token, that it is unused
 * and unexpired, and that it was sent to the address this account's sign-up
 * code was checked against.
 */
export function onboardingForInvite(
    invite: string | string[] | undefined,
): string | null {
    const token = first(invite)?.trim();
    if (!token || !INVITE_TOKEN.test(token)) return null;
    return `${getOnboardingUrl()}?${new URLSearchParams({ invite: token }).toString()}`;
}
