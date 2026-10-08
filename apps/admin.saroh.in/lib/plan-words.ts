import { formatDate } from "./format";

/**
 * The plan a business is on now, as the API resolves it (UX-087): a live
 * plan override wins over its subscription's plan. The console words it
 * here and decides nothing; the API's `CatalogueAccessService.resolve` is
 * the one place that says which plan wins. Client-safe.
 */
export interface EffectivePlan {
    id: string;
    name: string;
    /** The plan its subscription puts it on (Free with none). */
    basePlanId: string;
    basePlanName: string;
    /** Set while a plan override puts it on `id`; null `expiresAt` lasts until removed. */
    override: { expiresAt: string | null } | null;
}

/** Why a count reads as it does (the API's `UsageNote`). */
export type UsageNote = "online-only";

/** What each usage note says beside the count. */
export const USAGE_NOTE_WORDS: Record<UsageNote, string> = {
    // Owner, 8 Oct: only places customers visit count as locations.
    "online-only": "Online only, no locations",
};

/**
 * What sits after the plan's name while an override puts it there:
 * "override until 31 Dec 2026 · base plan Free". Null with no override.
 * The base plan is left out when the override names the same plan.
 */
export function planNote(plan: EffectivePlan): string | null {
    const until = overrideWords(plan);
    if (!until) return null;
    return plan.basePlanId === plan.id
        ? until
        : `${until} · base plan ${plan.basePlanName}`;
}

function overrideWords(plan: EffectivePlan): string | null {
    if (!plan.override) return null;
    return plan.override.expiresAt
        ? `override until ${formatDate(plan.override.expiresAt)}`
        : "override until removed";
}

/**
 * The plan in one line: "Pro (override until 31 Dec 2026) · base plan Free",
 * or just "Pro". Off the catalogue there is no effective plan, and the
 * subscription's own plan name (`fallback`) is the plan, or "No plan".
 */
export function planLine(
    plan: EffectivePlan | null,
    fallback: string | null = null,
): string {
    if (!plan) return fallback ?? "No plan";
    const until = overrideWords(plan);
    if (!until) return plan.name;
    return plan.basePlanId === plan.id
        ? `${plan.name} (${until})`
        : `${plan.name} (${until}) · base plan ${plan.basePlanName}`;
}

/**
 * Why the legacy plan picker can't be used, or null when it can. With a
 * catalogue version live, plans come from the catalogue (put on a plan),
 * so an empty legacy list is not "no plan offered".
 */
export function legacyPickerBlocked(
    legacyPlans: number,
    catalogueLive: boolean,
): "catalogue" | "none" | null {
    if (legacyPlans > 0) return null;
    return catalogueLive ? "catalogue" : "none";
}
