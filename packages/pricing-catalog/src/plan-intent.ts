import { offeredPlans } from "./card-lines";
import type { BillingCycle } from "./price";
import type { Catalog } from "./schema";

/**
 * The plan a visitor picked on saroh.in, carried through sign-up and
 * onboarding as `?plan=&cycle=` (plan U27, KTD-16).
 *
 * The query only says what was picked. Whether it can be bought is the live
 * catalogue's answer, here, and the checkout's on the server (U15, KTD-18):
 * a visitor can name any plan in a URL, so nothing is taken on trust.
 */
export interface PlanIntentQuery {
    plan?: string | null;
    cycle?: string | null;
}

/** What onboarding does with the plan the visitor picked. */
export type PlanIntent =
    /** No plan named, or Free: the business starts on Free, said nowhere. */
    | { kind: "none" }
    /** A plan the catalogue doesn't offer: Free, and onboarding says so. */
    | { kind: "unknown" }
    /**
     * A paid plan the catalogue offers: the checkout after onboarding.
     * `cycle` is the one asked for, or monthly when yearly isn't offered
     * (`yearlyDropped` says so).
     */
    | {
          kind: "paid";
          plan: string;
          name: string;
          cycle: BillingCycle;
          yearlyDropped: boolean;
      }
    /**
     * The catalogue couldn't be read: the plan goes to the checkout as asked,
     * and the server's refusal, if any, is what the business is told.
     */
    | { kind: "unchecked"; plan: string; cycle: BillingCycle };

/** The shape of a catalogue id; the schema's own rule. */
const PLAN_ID = /^[a-z][a-z0-9-]{0,39}$/;

function cycleOf(cycle: string | null | undefined): BillingCycle {
    return cycle === "year" ? "year" : "month";
}

/**
 * The visitor's pick, against the live catalogue (`null`: it couldn't be
 * read). A retired plan is not offered; a plan id that isn't one at all is
 * unknown, the same as one the catalogue never had.
 */
export function resolvePlanIntent(
    query: PlanIntentQuery,
    catalog: Catalog | null,
): PlanIntent {
    const asked = query.plan?.trim();
    if (!asked) return { kind: "none" };
    if (!PLAN_ID.test(asked)) return { kind: "unknown" };
    const cycle = cycleOf(query.cycle);
    if (!catalog) {
        return asked === "free"
            ? { kind: "none" }
            : { kind: "unchecked", plan: asked, cycle };
    }
    const plan = offeredPlans(catalog).find((p) => p.id === asked);
    if (!plan) return { kind: "unknown" };
    if (plan.pricePaise <= 0) return { kind: "none" };
    const yearlyDropped = cycle === "year" && !catalog.yearly.on;
    return {
        kind: "paid",
        plan: plan.id,
        name: plan.name,
        cycle: yearlyDropped ? "month" : cycle,
        yearlyDropped,
    };
}
