import type { BillingAccessView } from "@/lib/billing/access";
import { accessRow, upgradeHref } from "@/lib/billing/access";

/**
 * Where the plan leaves roles of your own off (UX-030): the catalogue's
 * `roles` row ("Custom roles"), which the API asks before a role is made
 * (`assertIncluded`) and before anyone is given an extra permission.
 *
 * A row off is refused whether the plan shows it locked or hides it from
 * the plan's card, so both count here — `rowLock` only reads "locked",
 * and a hidden row used to leave New role offered, its refusal unseen.
 * Null while nothing enforces it, or when the plan has it.
 */
export interface RolesLock {
    /** "Roles of your own come with Plan B." */
    line: string;
    /** "See Plan B". */
    cta: string;
    href: string;
}

export function rolesLock(view: BillingAccessView | null): RolesLock | null {
    if (view?.source !== "catalogue" || !view.enforced) return null;
    const row = accessRow(view, "roles");
    if (!row || row.state === "on") return null;
    const up = row.upgradeTo;
    if (!up) {
        return {
            line: `Roles of your own aren't in your ${view.plan?.name ?? "current"} plan.`,
            cta: "See plans",
            href: upgradeHref(),
        };
    }
    return {
        line: `Roles of your own come with ${up.name}.`,
        cta: `See ${up.name}`,
        href: upgradeHref(up.planId),
    };
}
