/**
 * The launch offer saroh.in's waitlist page shows (marketing plan, Gate W).
 * Pure, so the rule is tested on its own.
 *
 * In waitlist mode no plans catalogue is installed, so the offer reads the
 * environment only: the plan is a constant the waitlist owns, named as the
 * public pages name it, and the length is the owner's `LAUNCH_OFFER_DAYS`,
 * never written in the code.
 */

/** The plan the launch offer puts a business on. */
export const LAUNCH_OFFER_PLAN = "grow";

/** That plan's public name. */
export const LAUNCH_OFFER_PLAN_NAME = "Grow";

export interface PublicLaunchOffer {
    planId: string;
    planName: string;
    days: number;
}

/**
 * The offer as `GET /public/waitlist/offer` answers it, or null when this
 * instance gives none (`LAUNCH_OFFER_DAYS` unset or not a whole number of
 * days).
 */
export function publicLaunchOffer(
    days: number | undefined,
): PublicLaunchOffer | null {
    if (days === undefined || !Number.isInteger(days) || days < 1) return null;
    return {
        planId: LAUNCH_OFFER_PLAN,
        planName: LAUNCH_OFFER_PLAN_NAME,
        days,
    };
}
