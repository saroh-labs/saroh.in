import type { Catalog } from "@saroh/pricing-catalog";
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
        addons: [],
    };
}
