import type {
    Addon,
    Catalog,
    CatalogModule,
    Cell,
    Plan,
} from "@saroh/pricing-catalog";

import { freshId } from "./catalog-edits";

/**
 * Adding and removing the catalogue's parts beyond a plan or a module (the
 * Plans console audit, 6 Oct 2026): row groups, and taking back a plan or a
 * module that was only ever in the draft. Pure, like `catalog-edits.ts`:
 * each helper changes the catalogue it is handed, inside `edit(c => …)`.
 */

// ── Not live yet ──────────────────────────────────────────────────────────

/**
 * Not live yet, so it can still be removed rather than retired or hidden.
 * With nothing live at all, everything in the draft is new.
 */
export function isUnpublishedPlan(
    live: Catalog | null,
    planId: string,
): boolean {
    return !live?.plans.some((p) => p.id === planId);
}

export function isUnpublishedModule(
    live: Catalog | null,
    moduleId: string,
): boolean {
    return !live?.modules.some((m) => m.id === moduleId);
}

/** What removing a plan took, so Undo can put it back where it was. */
export interface RemovedPlan {
    plan: Plan;
    index: number;
    cells: Record<string, Cell>;
    /** The add-ons as they were, where any named this plan. */
    addons?: Addon[];
}

/**
 * Remove a plan that isn't live yet, with its cells. A live plan is retired
 * instead (its businesses stay on it), so this refuses one; and the last
 * plan stays, since a catalogue needs one. Returns what it took, or null.
 *
 * An add-on that named the plan stops naming it; one that named only this
 * plan goes with it, since naming none would put it on every plan.
 */
export function removePlan(
    catalog: Catalog,
    live: Catalog | null,
    planId: string,
): RemovedPlan | null {
    const index = catalog.plans.findIndex((p) => p.id === planId);
    const plan = catalog.plans.at(index);
    if (
        index < 0 ||
        !plan ||
        !isUnpublishedPlan(live, planId) ||
        catalog.plans.length <= 1
    ) {
        return null;
    }
    const cells: Record<string, Cell> = {};
    for (const m of catalog.modules) {
        if (planId in m.cells) {
            cells[m.id] = m.cells[planId];
            delete m.cells[planId];
        }
    }
    catalog.plans.splice(index, 1);
    if (!catalog.addons.some((a) => a.plans?.includes(planId))) {
        return { plan, index, cells };
    }
    const addons = catalog.addons;
    catalog.addons = addons.flatMap((a) => {
        if (!a.plans?.includes(planId)) return [a];
        const plans = a.plans.filter((id) => id !== planId);
        return plans.length > 0 ? [{ ...a, plans }] : [];
    });
    return { plan, index, cells, addons };
}

/** Undo `removePlan`: the plan back at its place, with its cells. */
export function restorePlan(catalog: Catalog, removed: RemovedPlan): void {
    if (catalog.plans.some((p) => p.id === removed.plan.id)) return;
    catalog.plans.splice(
        Math.min(removed.index, catalog.plans.length),
        0,
        removed.plan,
    );
    for (const m of catalog.modules) {
        if (m.id in removed.cells)
            m.cells[removed.plan.id] = removed.cells[m.id];
    }
    // Each add-on that named the plan names it again; one that went with
    // it is back at its place. Anything edited since is kept as it is now.
    removed.addons?.forEach((was, i) => {
        if (!was.plans?.includes(removed.plan.id)) return;
        const now = catalog.addons.find((a) => a.id === was.id);
        if (now) now.plans = was.plans;
        else catalog.addons.splice(Math.min(i, catalog.addons.length), 0, was);
    });
}

/** What removing a module took, so Undo can put it back where it was. */
export interface RemovedModule {
    module: CatalogModule;
    index: number;
    addons: { addon: Addon; index: number }[];
}

/**
 * Remove a module that isn't live yet, with any add-on that switches it on.
 * A live module is hidden on the pricing page instead, so this refuses one.
 */
export function removeModule(
    catalog: Catalog,
    live: Catalog | null,
    moduleId: string,
): RemovedModule | null {
    const index = catalog.modules.findIndex((m) => m.id === moduleId);
    const taken = catalog.modules.at(index);
    if (index < 0 || !taken || !isUnpublishedModule(live, moduleId)) {
        return null;
    }
    const addons = catalog.addons
        .map((addon, i) => ({ addon, index: i }))
        .filter(({ addon }) => addon.module === moduleId);
    catalog.modules.splice(index, 1);
    catalog.addons = catalog.addons.filter((a) => a.module !== moduleId);
    return { module: taken, index, addons };
}

/** Undo `removeModule`: the module and its add-ons back at their places. */
export function restoreModule(catalog: Catalog, removed: RemovedModule): void {
    if (catalog.modules.some((m) => m.id === removed.module.id)) return;
    catalog.modules.splice(
        Math.min(removed.index, catalog.modules.length),
        0,
        removed.module,
    );
    for (const { addon, index } of removed.addons) {
        catalog.addons.splice(Math.min(index, catalog.addons.length), 0, addon);
    }
}

// ── Row groups ────────────────────────────────────────────────────────────

/** "Add group": a new, empty row group at the end. Returns its id. */
export function addGroup(
    catalog: Catalog,
    name = "New group",
    now?: number,
): string {
    const id = freshId(
        "g",
        catalog.groups.map((g) => g.id),
        now,
    );
    catalog.groups.push({ id, name });
    return id;
}

/** Rename a row group; its id, which modules point at, stays. */
export function renameGroup(
    catalog: Catalog,
    groupId: string,
    name: string,
): void {
    const g = catalog.groups.find((x) => x.id === groupId);
    if (g) g.name = name;
}

/** A group can go only once no module is in it. */
export function canRemoveGroup(catalog: Catalog, groupId: string): boolean {
    return !catalog.modules.some((m) => m.group === groupId);
}

export function removeGroup(catalog: Catalog, groupId: string): boolean {
    if (!canRemoveGroup(catalog, groupId)) return false;
    const before = catalog.groups.length;
    catalog.groups = catalog.groups.filter((g) => g.id !== groupId);
    return catalog.groups.length < before;
}
