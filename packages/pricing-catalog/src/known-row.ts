import {
    catalogueModulesFor,
    MODULE_MAP,
    PAID_ONLY_REGISTRY,
} from "./module-map";
import type { Catalog, Cell } from "./schema";
import { cellOf } from "./schema";

const OPEN_CELL: Cell = {
    inc: true,
    text: "No limit",
    card: "",
    limit: null,
    per: "",
    soft: false,
};

const LOCKED_CELL: Cell = { inc: false, off: "locked" };

/**
 * The cells, plan by plan, that a `MODULE_MAP` row missing from `catalog`
 * goes in with, so that adding it changes no answer the API gives (its
 * `missingReads`): off where a missing row reads as off; on with no cap
 * where it reads as open, except under a registry module, where it is on
 * only on the plans that module is on for today, so it never turns the
 * module on (a paid-only one stays off on a free plan). Null for a row
 * the map doesn't know, a `neither` row, or one the catalogue already has.
 *
 * shortcut: reads plan cells only, so a business whose overrides remove
 * every sibling row could see the registry module come on; fine while no
 * such override exists, else read each business's access at publish.
 */
export function knownRowCells(
    catalog: Catalog,
    id: string,
): Record<string, Cell> | null {
    if (!Object.prototype.hasOwnProperty.call(MODULE_MAP, id)) return null;
    if (catalog.modules.some((m) => m.id === id)) return null;
    const { missingReads, registry } = MODULE_MAP[id];
    if (missingReads === "neither") return null;
    const siblings = registry
        ? catalog.modules.filter((m) =>
              catalogueModulesFor(registry).includes(m.id),
          )
        : [];
    const openOn = (planId: string, pricePaise: number): boolean => {
        if (missingReads === "locked") return false;
        if (!registry) return true;
        if (siblings.length === 0) {
            return !PAID_ONLY_REGISTRY.has(registry) || pricePaise > 0;
        }
        return siblings.some((m) => cellOf(m, planId).inc);
    };
    return Object.fromEntries(
        catalog.plans.map((p) => [
            p.id,
            { ...(openOn(p.id, p.pricePaise) ? OPEN_CELL : LOCKED_CELL) },
        ]),
    );
}
