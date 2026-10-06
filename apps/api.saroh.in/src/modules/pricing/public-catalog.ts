import { createHash } from "node:crypto";

import type { Catalog } from "@saroh/pricing-catalog";

/**
 * What `GET /public/pricing` serves: the catalogue a visitor may see.
 *
 * - `catalog` is a full snapshot (`@saroh/pricing-catalog` `Catalog`, amounts
 *   in paise) with everything a visitor must not see taken out: retired
 *   plans, modules hidden from the pricing page, the add-ons that hang on
 *   those modules, and the dashboard rail wiring (`menu`/`child`). It still
 *   passes `catalogSchema`, so saroh.in can `parseCatalog` it and run
 *   `cardLines`, `planPricePaise` and the rest on it unchanged.
 * - `version` and `goLiveAt` name the published version; both are null on a
 *   draft preview, where `preview` is true.
 *
 * A scheduled version is never served before its `goLiveAt`, and nothing
 * here says one exists.
 */
export interface PublicPricing {
    version: number | null;
    goLiveAt: string | null;
    preview: boolean;
    catalog: Catalog;
}

/** The visitor's view of a snapshot. */
export function publicCatalog(c: Catalog): Catalog {
    const plans = c.plans.filter((p) => !p.retired);
    const planIds = new Set(plans.map((p) => p.id));
    const modules = c.modules
        .filter((m) => m.pricing !== "hidden")
        .map((m) => {
            const cells: typeof m.cells = {};
            for (const [planId, cell] of Object.entries(m.cells)) {
                if (planIds.has(planId)) cells[planId] = cell;
            }
            // The rail entry a row locks is the dashboard's business.
            const { menu: _menu, child: _child, ...rest } = m;
            return { ...rest, cells };
        });
    const moduleIds = new Set(modules.map((m) => m.id));
    const addons = c.addons.filter((a) =>
        moduleIds.has(a.kind === "module" ? (a.module ?? "") : a.kind),
    );
    const groupIds = new Set(modules.map((m) => m.group));
    return {
        plans,
        groups: c.groups.filter((g) => groupIds.has(g.id)),
        modules,
        yearly: c.yearly,
        gst: c.gst,
        addons,
    };
}

/**
 * A weak validator for a response body: the same body always gets the same
 * tag, whichever instance answers.
 */
export function pricingEtag(body: PublicPricing): string {
    const hash = createHash("sha256")
        .update(JSON.stringify(body))
        .digest("base64url")
        .slice(0, 27);
    return `W/"${hash}"`;
}

/** Whether an `If-None-Match` header already names this tag. */
export function etagMatches(header: string | undefined, etag: string): boolean {
    if (!header) return false;
    if (header.trim() === "*") return true;
    const bare = (t: string) => t.trim().replace(/^W\//, "");
    const want = bare(etag);
    return header.split(",").some((t) => bare(t) === want);
}
