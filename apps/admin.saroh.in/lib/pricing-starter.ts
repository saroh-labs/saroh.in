import type { Catalog } from "@saroh/pricing-catalog";
import { AUTOPAY_CHARGES_DEFAULT, limitWithin } from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";

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
        autopay: { charges: AUTOPAY_CHARGES_DEFAULT },
        addons: [],
    };
}

/**
 * Rows the product enforces by their id that a catalogue made before them
 * doesn't have (DEC-158: `variants`, the cap on one product's variants).
 * "Add module" gives a row an id of its own, which governs nothing, so a
 * row the product knows has to be added under its id: these are offered on
 * the Modules tab. Only caps inside one thing are offered: without the row
 * they cap nothing, and there is no other way to set one.
 */
export function knownRowsMissing(
    catalog: Catalog,
): { id: string; name: string }[] {
    const has = new Set(catalog.modules.map((m) => m.id));
    return SEED_CATALOG.modules
        .filter((m) => limitWithin(m.id) && !has.has(m.id))
        .map((m) => ({ id: m.id, name: m.name }));
}

/**
 * Add one of {@link knownRowsMissing} to a draft, under its own id: on
 * every plan with no limit (so nothing changes for any business until a
 * number is set), and hidden from the pricing page until it has words. It
 * goes beside Products where the draft has that row, else in the first
 * group. Returns its id, or null when it can't be added.
 */
export function addKnownRow(catalog: Catalog, id: string): string | null {
    const known = knownRowsMissing(catalog).find((m) => m.id === id);
    const from = SEED_CATALOG.modules.find((m) => m.id === id);
    const beside = catalog.modules.findIndex((m) => m.id === "products");
    const group =
        beside >= 0 ? catalog.modules[beside].group : catalog.groups[0]?.id;
    if (!known || !from || !group) return null;
    const row = {
        id,
        name: from.name,
        group,
        pricing: "hidden" as const,
        what: from.what,
        cells: Object.fromEntries(
            catalog.plans.map((p) => [
                p.id,
                {
                    inc: true as const,
                    text: "No limit",
                    card: "",
                    limit: null,
                    per: "" as const,
                    soft: false,
                },
            ]),
        ),
    };
    if (beside >= 0) catalog.modules.splice(beside + 1, 0, row);
    else catalog.modules.push(row);
    return id;
}
