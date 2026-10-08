import { catalogPlanKey } from "./module-map";
import type { BillingCycle } from "./price";
import { BILLING_CYCLES, planPricePaise } from "./price";
import type { Catalog } from "./schema";
import { cellOf } from "./schema";

/**
 * A plan's `Plan.entitlements` for billing (KTD-2): each catalogue module id
 * maps to its cap, `true` when included without one, or `false` when not
 * included. Keyed by catalogue module id, not the legacy keys
 * (`sites`, `storefronts`, …) EntitlementService reads today; U12 moves
 * enforcement onto the catalogue before anything subscribes to these rows.
 */
export function entitlementsFor(
    catalog: Catalog,
    planId: string,
): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = {};
    for (const m of catalog.modules) {
        const c = cellOf(m, planId);
        out[m.id] = c.inc ? (c.limit ?? true) : false;
    }
    return out;
}

/** One billable `Plan` row: a catalogue plan, on a version, for one cycle. */
export interface CatalogPlanRow {
    key: string;
    version: number;
    interval: BillingCycle;
    name: string;
    /** Before GST; `Plan.priceCents` holds paise for INR. */
    priceCents: number;
    currency: "INR";
    entitlements: Record<string, number | boolean>;
    /** Offerable to new subscribers: the plan isn't retired. */
    active: boolean;
}

/**
 * The `Plan` rows a published version needs: every plan × every cycle, so a
 * subscription can always point at an immutable billable row. The yearly row
 * exists even while yearly billing is off; checkout offers it only when on.
 */
export function planRows(catalog: Catalog, version: number): CatalogPlanRow[] {
    return catalog.plans.flatMap((p) =>
        BILLING_CYCLES.map((interval) => ({
            key: catalogPlanKey(p.id),
            version,
            interval,
            name: p.name,
            priceCents: planPricePaise(catalog, p, interval),
            currency: "INR" as const,
            entitlements: entitlementsFor(catalog, p.id),
            active: !p.retired,
        })),
    );
}
