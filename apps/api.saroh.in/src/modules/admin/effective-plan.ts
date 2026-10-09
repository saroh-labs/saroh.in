import type { BusinessAccess } from "../billing/catalogue-access.service";

/**
 * The plan a business is on now, as the console shows it (UX-087): what
 * `CatalogueAccessService.resolve` puts it on, so a live plan override wins
 * over its subscription's plan, with that subscription's plan beside it.
 * The console only words it (`lib/plan-words.ts`); it decides nothing.
 */
export interface EffectivePlan {
    /** The plan it is on now, after a plan override. */
    id: string;
    name: string;
    /** The plan its subscription puts it on (Free with none). */
    basePlanId: string;
    basePlanName: string;
    /**
     * Set while a plan override is what puts it on `id`: when that ends
     * (null lasts until someone removes it).
     */
    override: { expiresAt: Date | null } | null;
}

/**
 * {@link EffectivePlan} from a resolved access. Null off the catalogue
 * (`source: "legacy"`): there the subscription's own row is the plan, and
 * the console shows that. A plan override the resolver ignored (its plan
 * isn't in the version) is not the plan, so it isn't shown as one.
 */
export function effectivePlan(access: BusinessAccess): EffectivePlan | null {
    if (access.source !== "catalogue") return null;
    const nameOf = (id: string) =>
        access.catalog.plans.find((p) => p.id === id)?.name ?? id;
    const o = access.planOverride;
    return {
        id: access.planId,
        name: access.planName,
        basePlanId: access.basePlanId,
        basePlanName: nameOf(access.basePlanId),
        override:
            o?.planKey === access.planId ? { expiresAt: o.expiresAt } : null,
    };
}
