import type { ModuleView } from "./schema";

/**
 * The modules Saroh has rolled out to this business (DEC-057).
 *
 * A module whose rollout flag is off is never shown to the business: not in
 * Settings › Modules, the rail, onboarding, Home's first run, "Also sell",
 * the setup checklists, search or a switch-off confirmation. The business's
 * own setting and its data are kept; it comes back when Saroh rolls it out.
 *
 * Every surface that lists modules goes through `rolledOut`, so the rule is
 * one function rather than a filter each screen remembers.
 */

/** The API's gate code for a module Saroh hasn't rolled out. */
export const ROLLOUT_DISABLED = "ROLLOUT_DISABLED";

type Node = Pick<ModuleView, "key" | "blockers"> &
    Partial<Pick<ModuleView, "lifecycle" | "dependencies">>;

/**
 * Modules Saroh doesn't offer, hidden the same way: Automations until it has
 * a screen (DEC-068), and class packs on no plan for now (DEC-099). Their
 * data is kept.
 */
export const NOT_OFFERED: ReadonlySet<string> = new Set([
    "AUTOMATIONS",
    "CLASS_PACKS",
]);

/**
 * Saroh has switched this module off (its rollout flag is off), or it has
 * no screen to offer yet (DEC-068).
 */
export function isHiddenByRollout(
    module: Pick<ModuleView, "blockers"> & Partial<Pick<ModuleView, "key">>,
) {
    if (module.key && NOT_OFFERED.has(module.key)) return true;
    return module.blockers.some((b) => b.code === ROLLOUT_DISABLED);
}

/**
 * Everything `key` needs, directly or through another, that is not on.
 * Walked over every module, hidden ones too, so a need the business can't
 * see is still found.
 */
function unmetNeeds(byKey: Map<string, Node>, key: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>([key]);
    const visit = (of: string) => {
        for (const dep of byKey.get(of)?.dependencies ?? []) {
            if (seen.has(dep)) continue;
            seen.add(dep);
            visit(dep);
            if (byKey.get(dep)?.lifecycle !== "ENABLED") out.push(dep);
        }
    };
    visit(key);
    return out;
}

/**
 * The modules the business may see, in the order given: every module Saroh
 * has rolled out, less one that needs a hidden module which is not on. That
 * one could never be turned on — the switch would wait on a module nobody
 * can name — so it is hidden with what it needs. A hidden module the
 * business had already turned on keeps working (its setting is kept), so
 * what needs it stays shown.
 */
export function rolledOut<T extends Node>(modules: readonly T[]): T[] {
    const hidden = new Set(modules.filter(isHiddenByRollout).map((m) => m.key));
    if (hidden.size === 0) return [...modules];
    const byKey = new Map<string, Node>(modules.map((m) => [m.key, m]));
    return modules.filter(
        (m) =>
            !hidden.has(m.key) &&
            !unmetNeeds(byKey, m.key).some((k) => hidden.has(k)),
    );
}

/** The keys of `rolledOut(modules)`, for a quick "may this be named?". */
export function rolledOutKeys(modules: readonly Node[]): Set<string> {
    return new Set(rolledOut(modules).map((m) => m.key));
}
