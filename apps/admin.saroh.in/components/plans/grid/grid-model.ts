import type { Catalog, CatalogModule, Cell } from "@saroh/pricing-catalog";
import { formatCount, formatInr, limitWordsFor } from "@saroh/pricing-catalog";

import { cellChanged, liveCellOf } from "../plans/catalog-edits";

/**
 * The Plans grid's rules, pure (admin redesign U11): which rows are limits,
 * what a cell says (to the eye and to a screen reader), what it was, and
 * which rows a search and a filter keep.
 */

export type GridFilter = "all" | "changed" | "limits" | "modules";

export const GRID_FILTERS: readonly { id: GridFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "changed", label: "Changed" },
    { id: "limits", label: "Limits" },
    { id: "modules", label: "Modules" },
];

/**
 * A row counted against a number (a limit row) rather than a switch: the
 * catalogue knows a count for it, or any plan, now or live, caps it.
 */
export function isLimitRow(
    module: CatalogModule,
    live: Catalog | null,
): boolean {
    if (limitWordsFor(module.id)) return true;
    const capped = (m: CatalogModule | undefined) =>
        !!m && Object.values(m.cells).some((c) => c.inc && c.limit != null);
    return (
        capped(module) || capped(live?.modules.find((m) => m.id === module.id))
    );
}

/** A row any plan's cell of differs from live. */
export function rowChanged(
    live: Catalog | null,
    catalog: Catalog,
    module: CatalogModule,
): boolean {
    return catalog.plans.some((p) => cellChanged(live, module, p.id));
}

/** What a cell says, in words: "Included", "Not included", "111 a month". */
export function cellWords(cell: Cell, limitRow: boolean): string {
    if (!cell.inc) return "Not included";
    if (!limitRow) return "Included";
    if (cell.limit == null) return "No limit";
    return `${formatCount(cell.limit)}${cell.per === "month" ? " a month" : ""}`;
}

/** What a cell shows: ✓ and — for a switch, the number for a limit. */
export function cellMark(cell: Cell, limitRow: boolean): string {
    if (!cell.inc) return "—";
    if (!limitRow) return "✓";
    if (cell.limit == null) return "No limit";
    return `${formatCount(cell.limit)}${cell.per === "month" ? "/mo" : ""}`;
}

export interface CellWas {
    /** "was 11", or "new" for a row or plan that isn't live. */
    mark: string;
    /** The same for a screen reader: "was 11", "new, not live yet". */
    words: string;
}

/** What a changed cell was on the live version; null when unchanged. */
export function cellWas(
    live: Catalog | null,
    module: CatalogModule,
    planId: string,
    limitRow: boolean,
): CellWas | null {
    if (!cellChanged(live, module, planId)) return null;
    const was = live?.plans.some((p) => p.id === planId)
        ? liveCellOf(live, module.id, planId)
        : null;
    if (!was) return { mark: "new", words: "new, not live yet" };
    return {
        mark: `was ${cellMark(was, limitRow)}`,
        words: `was ${cellWords(was, limitRow).toLowerCase()}`,
    };
}

/** A plan's price as its header says it was, when it has changed. */
export function priceWas(
    live: Catalog | null,
    catalog: Catalog,
    planId: string,
): string | null {
    if (!live) return null;
    const was = live.plans.find((p) => p.id === planId);
    const now = catalog.plans.find((p) => p.id === planId);
    if (!now) return null;
    if (!was) return "new";
    return was.pricePaise === now.pricePaise
        ? null
        : `was ${formatInr(was.pricePaise)}`;
}

/** Rows a filter keeps (before the search). */
export function keepRow(
    filter: GridFilter,
    flags: { limit: boolean; changed: boolean },
): boolean {
    switch (filter) {
        case "changed":
            return flags.changed;
        case "limits":
            return flags.limit;
        case "modules":
            return !flags.limit;
        default:
            return true;
    }
}

/** A search term matches a row's name or its group's, ignoring case. */
export function matchesTerm(term: string, ...names: string[]): boolean {
    const t = term.trim().toLowerCase();
    if (!t) return true;
    return names.some((n) => n.toLowerCase().includes(t));
}

/** Who a limit change reaches: everyone on the plan, at their renewal. */
export function reachLine(businesses: number): string {
    if (businesses === 0) return "No business is on this plan yet";
    return `Reaches ${formatCount(businesses)} ${businesses === 1 ? "business" : "businesses"} at renewal`;
}
