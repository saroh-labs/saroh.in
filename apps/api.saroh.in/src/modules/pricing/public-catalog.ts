import { createHash } from "node:crypto";

import type { Catalog } from "@saroh/pricing-catalog";

/**
 * What `GET /public/pricing` serves: the catalogue a visitor may see.
 *
 * - `catalog` is a full snapshot (`@saroh/pricing-catalog` `Catalog`, amounts
 *   in paise) with everything a visitor must not see taken out: retired
 *   plans, modules hidden from the pricing page, the add-ons that hang on
 *   those modules or are offered only on retired plans, and the dashboard
 *   rail wiring (`menu`/`child`). It still
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
    /**
     * Whether Saroh sells these plans now, on an edition it doesn't bill from
     * the start (Global, stage 9): `SAROH_BILLING_GLOBAL` on for everyone and
     * a paid plan in the catalogue. Absent on India's, which always sells.
     * saroh.tech shows prices only when true (DEC-211).
     */
    offered?: boolean;
    /**
     * Whether a business on this edition can take card payments online,
     * through its own Stripe: `STRIPE_PAYMENTS` on (DEC-208). Absent on
     * India's. saroh.tech says customers can pay by card online only when
     * true (owner, 16 Nov 2026, #7).
     */
    cardOnline?: boolean;
    /**
     * Each paid plan's automatic coupon (owner, 18 Nov 2026): off each
     * month's charge, before tax, for so many months. Never its code.
     */
    offers: PublicOffer[];
}

/** A plan's automatic coupon, as a visitor may see it. */
export interface PublicOffer {
    planId: string;
    /** Off each month before tax; a percent coupon's, worked out per plan. */
    discountPaise: number;
    months: number;
    /** A percent coupon's whole percent; absent: an amount coupon. */
    percentOff?: number;
    /** When the coupon stops being given (ISO); absent: no end set. */
    endsAt?: string;
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
    const addons = c.addons
        .filter((a) =>
            moduleIds.has(a.kind === "module" ? (a.module ?? "") : a.kind),
        )
        // An add-on names only plans a visitor can see; one whose plans are
        // all retired goes with them, never onto every plan (DEC-157).
        .flatMap((a) => {
            if (!a.plans?.length) return [a];
            const shown = a.plans.filter((id) => planIds.has(id));
            return shown.length ? [{ ...a, plans: shown }] : [];
        });
    const groupIds = new Set(modules.map((m) => m.group));
    return {
        plans,
        groups: c.groups.filter((g) => groupIds.has(g.id)),
        modules,
        yearly: c.yearly,
        gst: c.gst,
        currency: c.currency,
        tax: c.tax,
        autopay: c.autopay,
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
