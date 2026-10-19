import type {
    Catalog,
    CatalogModule,
    Cell,
    LimitPeriod,
    Plan,
} from "@saroh/pricing-catalog";
import { cellOf, formatCount } from "@saroh/pricing-catalog";

import type { AdminPlanCount, ImpactItem } from "@/lib/pricing-types";

import { cellWords } from "../grid/grid-model";
import { cellChanged, patchIncluded } from "../plans/catalog-edits";

/**
 * The feature and plan sheets' rules, pure (admin redesign U12, R21, R22):
 * how a feature is counted and whether its caps are soft across every plan,
 * what a plan's cell was on the live version, which of the draft's effects
 * are about one feature, and who keeps a retired plan. Each mutating helper
 * changes the catalogue it is handed, so a sheet calls it inside
 * `edit(c => …)` and nowhere else.
 */

/** One answer for every plan, or "mixed" when the plans differ. */
export type Across<T> = T | "mixed";

/**
 * How the feature is counted on the plans that include it: "" (in total),
 * "month", or "mixed". Null when no plan includes it.
 */
export function countedAcross(
    module: CatalogModule,
    plans: readonly Plan[],
): Across<LimitPeriod> | null {
    const seen = new Set<LimitPeriod>();
    for (const p of plans) {
        const c = cellOf(module, p.id);
        if (c.inc) seen.add(c.per);
    }
    if (seen.size === 0) return null;
    if (seen.size > 1) return "mixed";
    return [...seen][0] ?? null;
}

/**
 * Whether the feature's caps are soft: true, false or "mixed" over the
 * plans that cap it. Null when no plan caps it (soft means nothing then).
 */
export function softAcross(
    module: CatalogModule,
    plans: readonly Plan[],
): Across<boolean> | null {
    const seen = new Set<boolean>();
    for (const p of plans) {
        const c = cellOf(module, p.id);
        if (c.inc && c.limit != null) seen.add(c.soft);
    }
    if (seen.size === 0) return null;
    if (seen.size > 1) return "mixed";
    return [...seen][0] ?? null;
}

/** "Soft on Plan B; hard on Plan A", for a mix. */
export function softMix(module: CatalogModule, plans: readonly Plan[]): string {
    const soft: string[] = [];
    const hard: string[] = [];
    for (const p of plans) {
        const c = cellOf(module, p.id);
        if (!c.inc || c.limit == null) continue;
        (c.soft ? soft : hard).push(p.name || "Unnamed plan");
    }
    return `Soft on ${soft.join(", ")}; hard on ${hard.join(", ")}`;
}

/** Count the feature the same way on every plan that includes it. */
export function setCountedAll(
    catalog: Catalog,
    moduleId: string,
    per: LimitPeriod,
): void {
    for (const p of catalog.plans) {
        patchIncluded(catalog, moduleId, p.id, { per });
    }
}

/** Make every cap on the feature soft, or every one hard. */
export function setSoftAll(
    catalog: Catalog,
    moduleId: string,
    soft: boolean,
): void {
    const m = catalog.modules.find((x) => x.id === moduleId);
    if (!m) return;
    for (const p of catalog.plans) {
        const c = cellOf(m, p.id);
        if (c.inc && c.limit != null) {
            patchIncluded(catalog, moduleId, p.id, { soft });
        }
    }
}

const quoted = (t: string) => (t ? `“${t}”` : "nothing");

/**
 * What a plan's cell was on the live version, in lines, when the draft
 * changed it: "Was 111", "Was not included", "The table said “11”".
 * Empty when it hasn't changed; one line for a plan or feature that isn't
 * live yet.
 */
export function wasLines(
    live: Catalog | null,
    module: CatalogModule,
    planId: string,
    limitRow: boolean,
): string[] {
    if (!cellChanged(live, module, planId)) return [];
    const liveModule = live?.modules.find((m) => m.id === module.id);
    if (!liveModule || !live?.plans.some((p) => p.id === planId)) {
        return ["New, not live yet"];
    }
    const was: Cell = cellOf(liveModule, planId);
    const now: Cell = cellOf(module, planId);
    const out: string[] = [];
    const wasWords = cellWords(was, limitRow);
    if (wasWords !== cellWords(now, limitRow)) {
        out.push(`Was ${wasWords.toLowerCase()}`);
    }
    if (was.inc && now.inc) {
        if (was.text !== now.text)
            out.push(`The table said ${quoted(was.text)}`);
        if (was.card !== now.card)
            out.push(`The card said ${quoted(was.card)}`);
        if (was.limit != null && now.limit != null && was.soft !== now.soft) {
            out.push(`Was a ${was.soft ? "soft" : "hard"} limit`);
        }
    }
    if (!was.inc && !now.inc && was.off !== now.off) {
        out.push(`Was ${was.off === "hidden" ? "hidden" : "locked"}`);
    }
    // Something else moved (how it's counted): say it changed, at least.
    if (out.length === 0) out.push("Changed from live");
    return out;
}

/**
 * The draft's effects that are about one feature: the API names the
 * feature first in each ("Things on Plan B: 11 → 22", "Things taken off
 * Plan A"), or after "New module:" / "Module removed:".
 */
export function featureImpact(
    items: readonly ImpactItem[],
    name: string,
): ImpactItem[] {
    if (!name) return [];
    return items.filter(
        (i) =>
            i.title.startsWith(`${name} `) ||
            i.title.startsWith(`${name}:`) ||
            i.title === `New module: ${name}` ||
            i.title === `Module removed: ${name}`,
    );
}

/** "3 businesses on Plan B" for the plan sheet's line. */
export function onPlanLine(count: AdminPlanCount | undefined, name: string) {
    const n = count?.businesses ?? 0;
    const older = count?.olderVersion ?? 0;
    return (
        `${formatCount(n)} ${n === 1 ? "business" : "businesses"} on ${name}` +
        (older ? ` · ${formatCount(older)} on an older version` : "")
    );
}

/** Who keeps a plan that is retired: everyone on it, until they change plan. */
export function keepersLine(businesses: number): string {
    if (businesses === 0) return "No business is on it today.";
    if (businesses === 1) {
        return "The 1 business on it keeps it until it changes plan.";
    }
    return `The ${formatCount(businesses)} businesses on it keep it until they change plan.`;
}
