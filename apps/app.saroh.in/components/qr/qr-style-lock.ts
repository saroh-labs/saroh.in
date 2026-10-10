import type { BillingAccessView } from "@/lib/billing/access";
import { accessRow, upgradeHref } from "@/lib/billing/access";
import type { PlanRefusal } from "@/lib/billing/refusal";

/**
 * Where the plan leaves a QR code plain: the catalogue's `qr-branding` row,
 * which the API asks before a code is made or turned branded
 * (`assertIncluded`) and answers on the list as `included`. A plain code is
 * on every plan and never locked.
 *
 * As `trackers-lock.ts`: a row off is refused whether the plan shows it
 * locked or hides it, so both count. Null while nothing enforces it, or
 * when the plan has it. The words name no price and no catalogue row; the
 * plan that has it is named only by the link, from the catalogue.
 */
export interface QrStyleLock {
    /** Said under Style; the plan's name follows it as the link. */
    line: string;
    /** The link's words: the plan that has it, or "a paid plan". */
    plan: string;
    /** Said on a branded code made before the plan changed. */
    kept: string;
    /** "See Plan B", or "See plans": the link's accessible name. */
    cta: string;
    href: string;
}

/** The design's line; the plan's name is the link that ends it. */
export const QR_LOCKED_LINE =
    "Logo, colours, print files and scan counts come with";

export const QR_KEPT_LINE =
    "Made in your own look before your plan changed. It keeps that look and still scans.";

function lockTo(up: { planId: string; name: string } | null): QrStyleLock {
    return {
        line: QR_LOCKED_LINE,
        plan: up ? up.name : "a paid plan",
        kept: QR_KEPT_LINE,
        cta: up ? `See ${up.name}` : "See plans",
        href: upgradeHref(up?.planId),
    };
}

/**
 * The lock, from the billing access view and the list's own `included`.
 *
 * The access view names the plan that has it; a role that can't read it
 * (or a read that failed) still gets the lock when the list says the plan
 * doesn't include it, pointing at the plans. `included` true, or unknown
 * with nothing in the view, locks nothing: the API still refuses, and says
 * why (`qrStyleLockOfRefusal`).
 */
export function qrStyleLock(
    view: BillingAccessView | null,
    included?: boolean,
): QrStyleLock | null {
    if (view?.source === "catalogue" && view.enforced) {
        const row = accessRow(view, "qr-branding");
        if (row && row.state !== "on") return lockTo(row.upgradeTo);
        if (row) return null;
    }
    return included === false ? lockTo(null) : null;
}

/**
 * The lock a save met (`MODULE_LOCKED`): the plan changed under the page,
 * or the access read couldn't be had. Said as the lock, never as an error.
 */
export function qrStyleLockOfRefusal(
    plan: PlanRefusal | undefined,
): QrStyleLock | null {
    if (plan?.code !== "MODULE_LOCKED") return null;
    return lockTo(plan.upgradeTo);
}
