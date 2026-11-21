import type { Catalog } from "@saroh/pricing-catalog";
import {
    AUTOPAY_CHARGES_DEFAULT,
    knownRowCells,
    limitWithin,
    MODULE_MAP,
} from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";

import { PROFILE } from "@/lib/edition";
import { planTaxed } from "@/lib/plan-money";

/**
 * The two ways to start pricing on an instance that has none (the Plans
 * console audit, 6 Oct 2026): the first draft has to come from somewhere,
 * and before these the only way was a script or the API.
 *
 * Both are pure and hand back a new catalogue each call, for the draft
 * store's `start`.
 */

/**
 * The public sample catalogue's shape (its plans, row groups, modules and
 * which plan includes what) with nothing of its numbers: every price ₹0,
 * every limit cleared, no trials and no add-ons. A cell that described its
 * limit says "Included" instead, so no row claims a number nobody chose.
 */
export function starterCatalog(): Catalog {
    const c = structuredClone(SEED_CATALOG);
    // This console's plan money (stage 9): dollars and no tax, no yearly, on
    // Global's.
    Object.assign(c, PROFILE.sarohPlanMoney);
    if (!planTaxed()) c.yearly.on = false;
    for (const p of c.plans) {
        p.pricePaise = 0;
        delete p.trial;
    }
    for (const m of c.modules) {
        for (const [planId, cell] of Object.entries(m.cells)) {
            if (!cell.inc || cell.limit == null) continue;
            m.cells[planId] = {
                inc: true,
                text: "Included",
                card: "",
                limit: null,
                per: "",
                soft: false,
            };
        }
    }
    c.addons = [];
    return c;
}

/** One free plan and one row group, for an operator building from nothing. */
export function blankCatalog(): Catalog {
    return {
        plans: [
            {
                id: "free",
                name: "Free",
                pricePaise: 0,
                tagline: "",
                cta: "Start free",
                featured: false,
                retired: false,
            },
        ],
        groups: [{ id: "features", name: "Features" }],
        modules: [],
        yearly: { on: false, paid: 10 },
        gst: { show: "excl" },
        ...PROFILE.sarohPlanMoney,
        autopay: { charges: AUTOPAY_CHARGES_DEFAULT },
        addons: [],
    };
}

/**
 * Rows the product enforces by their id (`MODULE_MAP`) that a catalogue
 * made before them doesn't have: `variants` (DEC-158), `google-accounts`
 * (DEC-233), `ask-ai`, `social` and the rest. "Add module" gives a row an
 * id of its own, which governs nothing, so a row the product knows has to
 * be added under its id: these are offered on the Modules tab. `off` says
 * the row goes in off on every plan, because the product reads it missing
 * as off; else it goes in on where the product gives it today, with no
 * limit (see {@link addKnownRow}). A row no cell reads the same as missing
 * (`sites`, `locations`, `payments`, `subscriptions`) is never offered.
 */
export function knownRowsMissing(
    catalog: Catalog,
): { id: string; name: string; what: string; off: boolean }[] {
    const has = new Set(catalog.modules.map((m) => m.id));
    return SEED_CATALOG.modules
        .filter(
            (m) =>
                Object.hasOwn(MODULE_MAP, m.id) &&
                MODULE_MAP[m.id].missingReads !== "neither" &&
                !has.has(m.id),
        )
        .map((m) => ({
            id: m.id,
            name: m.name,
            what: m.what,
            off: MODULE_MAP[m.id].missingReads === "locked",
        }));
}

/**
 * Add one of {@link knownRowsMissing} to a draft, under its own id, hidden
 * from the pricing page until it has words. Its cells keep every answer the
 * product gives without the row (`knownRowCells`), so publishing it takes
 * nothing away and grants nothing:
 * - a row the product reads missing as off (Social, Ask AI, Google accounts
 *   a person at one, the API keys) goes OFF on every plan;
 * - every other row goes on with no limit, on the plans its registry
 *   module is on for today (a paid-only one on priced plans only).
 * A cap inside one product (`variants`) goes beside Products where the
 * draft has that row; any other in the seed's group where the draft has
 * it; else in the first group. Returns its id, or null when it can't be
 * added.
 */
export function addKnownRow(catalog: Catalog, id: string): string | null {
    const known = knownRowsMissing(catalog).find((m) => m.id === id);
    const from = SEED_CATALOG.modules.find((m) => m.id === id);
    const cells = knownRowCells(catalog, id);
    if (!known || !from || !cells) return null;
    const beside =
        limitWithin(id) === "product"
            ? catalog.modules.findIndex((m) => m.id === "products")
            : -1;
    const group =
        beside >= 0
            ? catalog.modules[beside].group
            : catalog.groups.some((g) => g.id === from.group)
              ? from.group
              : catalog.groups[0]?.id;
    if (!group) return null;
    const row = {
        id,
        name: from.name,
        group,
        pricing: "hidden" as const,
        what: from.what,
        cells,
    };
    if (beside >= 0) catalog.modules.splice(beside + 1, 0, row);
    else catalog.modules.push(row);
    return id;
}
