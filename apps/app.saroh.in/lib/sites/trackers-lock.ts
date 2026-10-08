import type { BillingAccessView } from "@/lib/billing/access";
import { accessRow, upgradeHref } from "@/lib/billing/access";
import type { PlanRefusal } from "@/lib/billing/refusal";

/**
 * Where the plan leaves a business's own trackers off (DEC-108, U7): the
 * catalogue's `site-trackers` row, which the API asks before a tracker is
 * added or turned back on (`assertIncluded`). Verification codes are on
 * every plan and never locked.
 *
 * As `roles-lock.ts`: a row off is refused whether the plan shows it
 * locked or hides it, so both count. Null while nothing enforces it, or
 * when the plan has it. The words name no plan and no catalogue row; only
 * the upgrade link names the plan that has it.
 */
export interface TrackersLock {
    /** Said where a tracker could be connected. */
    line: string;
    /** Said on a tracker saved before the plan changed. */
    kept: string;
    /** "See Plan B", or "See plans". */
    cta: string;
    href: string;
}

export const TRACKERS_LOCKED_LINE =
    "Connect your own analytics and ad tracking. Included in paid plans.";

export const TRACKERS_KEPT_LINE =
    "Saved, not running on your site. Upgrade to turn it back on.";

function lockTo(up: { planId: string; name: string } | null): TrackersLock {
    return {
        line: TRACKERS_LOCKED_LINE,
        kept: TRACKERS_KEPT_LINE,
        cta: up ? `See ${up.name}` : "See plans",
        href: upgradeHref(up?.planId),
    };
}

export function trackersLock(
    view: BillingAccessView | null,
): TrackersLock | null {
    if (view?.source !== "catalogue" || !view.enforced) return null;
    const row = accessRow(view, "site-trackers");
    if (!row || row.state === "on") return null;
    return lockTo(row.upgradeTo);
}

/**
 * The lock a save met (`MODULE_LOCKED`): the plan changed under the page,
 * or the access read couldn't be had. Said as the lock, never as an error.
 */
export function trackersLockOfRefusal(
    plan: PlanRefusal | undefined,
): TrackersLock | null {
    if (plan?.code !== "MODULE_LOCKED") return null;
    return lockTo(plan.upgradeTo);
}
