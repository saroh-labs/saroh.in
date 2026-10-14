import type { Catalog } from "@saroh/pricing-catalog";
import { offeredPlans } from "@saroh/pricing-catalog";

import type { BillingAccessView } from "@/lib/billing/access";

import type { SarohSubscription } from "./plan";
import type {
    CheckoutsView,
    Cycle,
    PickerRow,
    RowQuote,
    WaitingMove,
} from "./plan-view";
import {
    billedCycle,
    billedPlanId,
    pickerRows,
    waitingMove,
    yearlyOffer,
} from "./plan-view";
import {
    getBillingAccess,
    getCheckouts,
    getSarohSubscription,
    livePricing,
    quotePlan,
} from "./service";

/**
 * What both screens of Settings › Plan and billing read first: the page
 * itself (the plan the business is on) and Change plan (every plan). One
 * place, so the two never disagree about which plan is the current one.
 */
export interface PlanBasics {
    subscription: SarohSubscription | null;
    access: BillingAccessView | null;
    catalog: Catalog | null;
    liveVersion: number | null;
    /** Null when it couldn't be read: said on the page, never drawn as none. */
    checkouts: CheckoutsView | null;
    checkoutsRead: boolean;
}

/** The plan, its access and the price list; null when the API reads it to nobody here. */
export async function readPlanBasics(): Promise<PlanBasics | null> {
    const [read, accessRead, pricing, checkouts] = await Promise.all([
        getSarohSubscription(),
        getBillingAccess(),
        livePricing(),
        // A side read: named on the page as missing when it fails.
        getCheckouts().catch(() => null),
    ]);
    if (read.status === "denied" || accessRead.status === "denied") return null;
    return {
        subscription: read.subscription,
        access: accessRead.data,
        catalog: pricing?.catalog ?? null,
        liveVersion: pricing?.version ?? null,
        checkouts: checkouts?.status === "ok" ? checkouts.data : null,
        checkoutsRead: checkouts !== null,
    };
}

export interface PlanCards {
    /** Per cycle; null when Saroh's price list couldn't be read. */
    rows: Record<Cycle, PickerRow[]> | null;
    yearly: ReturnType<typeof yearlyOffer>;
    /** The cycle the business is billed on. */
    cycle: Cycle;
    /** The plan it's on now, by name. */
    currentPlan: string;
    /** A change already made that waits for its date. */
    waiting: WaitingMove | null;
}

/**
 * The plans as cards, for each cycle. With `quotes`, each other plan is
 * asked of the API (`GET …/billing/change-plan`): "Start N-day trial" only
 * where this business would get one, and when a change would start
 * (DEC-159). The plan it's on is asked only on the other cycle, and a quote
 * that can't be read says nothing on its card. Without them (the page that
 * draws only the current plan) nothing is asked.
 */
export async function readPlanCards(
    basics: PlanBasics,
    opts: { quotes: boolean },
): Promise<PlanCards> {
    const { subscription, access, catalog } = basics;
    const billed = billedPlanId(catalog, subscription);
    const onCycle = billedCycle(subscription);
    const yearly = yearlyOffer(catalog);
    const cycles: Cycle[] = yearly.on ? ["month", "year"] : ["month"];
    const asked =
        catalog && opts.quotes
            ? cycles.flatMap((cycle) =>
                  offeredPlans(catalog)
                      .filter(
                          (p) =>
                              p.id !== billed ||
                              (p.pricePaise > 0 && cycle !== onCycle),
                      )
                      .map((p) => ({ planId: p.id, cycle })),
              )
            : [];
    const quotes: Record<Cycle, Map<string, RowQuote>> = {
        month: new Map(),
        year: new Map(),
    };
    for (const { planId, cycle, quote } of await Promise.all(
        asked.map(async (a) => ({
            ...a,
            quote: await quotePlan(a.planId, a.cycle),
        })),
    )) {
        if (quote) quotes[cycle].set(planId, quote);
    }
    const trials = new Set(
        Array.from(quotes.month).flatMap(([id, q]) =>
            q.kind === "TRIAL" ? [id] : [],
        ),
    );
    const waiting =
        access?.source === "catalogue"
            ? waitingMove({ access, checkouts: basics.checkouts })
            : null;
    // A plan given for a while (a launch offer) is the one it's on (UX-044).
    const override =
        access?.source === "catalogue" ? access.planOverride : null;
    const given = override
        ? { planId: override.planKey, until: override.expiresAt ?? null }
        : null;
    const rows = catalog
        ? (Object.fromEntries(
              (["month", "year"] as const).map((cycle) => [
                  cycle,
                  pickerRows({
                      catalog,
                      subscription,
                      cycle,
                      trials,
                      given,
                      quotes: quotes[cycle],
                      waiting,
                  }),
              ]),
          ) as Record<Cycle, PickerRow[]>)
        : null;
    return {
        rows,
        yearly,
        cycle: onCycle,
        currentPlan:
            access?.source === "catalogue"
                ? (access.plan?.name ?? "Free")
                : (subscription?.plan.name ?? "Free"),
        waiting,
    };
}
