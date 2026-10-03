import type {
    Addon,
    AddonKind,
    Catalog,
    Plan,
    Trial,
} from "@saroh/pricing-catalog";
import {
    cellOf,
    formatInr,
    GST_PERCENT,
    monthlyEquivalentPaise,
    TRIAL_DAYS_MAX,
    TRIAL_DAYS_MIN,
    withGstPaise,
    yearlyPaise,
} from "@saroh/pricing-catalog";

import type { AdminPricing, ModuleUsage } from "@/lib/pricing-types";

/**
 * The Offers tab's rules, pure (plans catalogue U9): what each card says and
 * what an edit does to the draft. Every amount is the catalogue's own integer
 * paise, formatted only for people; nothing here carries a price of its own.
 */

// ── Yearly ────────────────────────────────────────────────────────────────

/** The input's own range: "Pay for [6–12] months, get 12". */
export const YEARLY_INPUT_MIN = 6;
export const YEARLY_INPUT_MAX = 12;

/** Plans that cost something; trials, yearly lines and coupons are for these. */
export function paidPlans(catalog: Catalog): Plan[] {
    return catalog.plans.filter((p) => p.pricePaise > 0);
}

/** "Plan B: ₹X a year, about ₹Y a month", one per paid plan. */
export function yearlyLines(catalog: Catalog): string[] {
    return paidPlans(catalog).map((p) => {
        const year = yearlyPaise(p.pricePaise, catalog.yearly.paid);
        return `${p.name}: ${formatInr(year)} a year, about ${formatInr(monthlyEquivalentPaise(year))} a month`;
    });
}

// ── GST ───────────────────────────────────────────────────────────────────

/** The GST card's example, on the first paid plan; empty without one. */
export function gstExample(catalog: Catalog): string {
    const eg = paidPlans(catalog).at(0);
    if (!eg) return "";
    const ex = formatInr(eg.pricePaise);
    const inc = formatInr(withGstPaise(eg.pricePaise));
    return catalog.gst.show === "incl"
        ? `${eg.name} shows ${inc} incl. GST, or ${ex} + GST (${GST_PERCENT}%)`
        : `${eg.name} shows ${ex} + GST, or ${inc} incl. GST (${GST_PERCENT}%)`;
}

// ── Trials ────────────────────────────────────────────────────────────────

/** A trial nobody has set yet: off, at the design's two weeks. */
export const DEFAULT_TRIAL: Trial = { on: false, days: 14 };

export function trialOf(plan: Plan): Trial {
    return plan.trial ?? DEFAULT_TRIAL;
}

export function clampTrialDays(days: number): number {
    return Math.min(TRIAL_DAYS_MAX, Math.max(TRIAL_DAYS_MIN, days));
}

// ── Add-ons ───────────────────────────────────────────────────────────────

/** The kinds the design offers, in its order, with its words. */
export const ADDON_KIND_WORDS: Record<
    AddonKind,
    { label: string; unit: string; name: string }
> = {
    members: {
        label: "Team members",
        unit: "team member",
        name: "Extra team members",
    },
    products: { label: "Products", unit: "product", name: "Extra products" },
    orders: {
        label: "Orders a month",
        unit: "order a month",
        name: "Extra orders",
    },
    bookings: {
        label: "Bookings a month",
        unit: "booking a month",
        name: "Extra bookings",
    },
    integrations: {
        label: "Integrations",
        unit: "connection",
        name: "Extra integrations",
    },
    module: { label: "A module on its own", unit: "module", name: "" },
};

export const ADDON_KIND_ORDER: AddonKind[] = [
    "members",
    "products",
    "orders",
    "bookings",
    "integrations",
    "module",
];

/** Modules at least one plan leaves out: the only ones worth selling alone. */
export function modulesSomePlanLacks(catalog: Catalog) {
    return catalog.modules.filter((m) =>
        catalog.plans.some((p) => !cellOf(m, p.id).inc),
    );
}

/**
 * Whether "+ kind" can add anything: a limit add-on raises a module the
 * catalogue has (the schema's rule), and a module add-on needs a module
 * some plan lacks.
 */
export function canAddKind(catalog: Catalog, kind: AddonKind): boolean {
    if (kind === "module") return modulesSomePlanLacks(catalog).length > 0;
    return catalog.modules.some((m) => m.id === kind);
}

/**
 * A new add-on of a kind, or null when the kind can't be added. It starts
 * at no price and a pack of one: the operator sets both, and the card says
 * so until the price is set (no price is written into the console).
 */
export function newAddon(
    catalog: Catalog,
    kind: AddonKind,
    id: string,
): Addon | null {
    if (!canAddKind(catalog, kind)) return null;
    if (kind === "module") {
        const m = modulesSomePlanLacks(catalog).at(0);
        if (!m) return null;
        return {
            id,
            kind,
            module: m.id,
            name: m.name,
            pricePaise: 0,
            mode: "pack",
            qty: 1,
        };
    }
    return {
        id,
        kind,
        name: ADDON_KIND_WORDS[kind].name,
        pricePaise: 0,
        mode: "pack",
        qty: 1,
    };
}

/** An id the schema takes (`^[a-z][a-z0-9-]*`) that no add-on has yet. */
export function newAddonId(catalog: Catalog, now: number = Date.now()): string {
    let n = now;
    let id = `a${n.toString(36)}`;
    while (catalog.addons.some((a) => a.id === id)) {
        n += 1;
        id = `a${n.toString(36)}`;
    }
    return id;
}

/** The add-on's line, as the design words it. */
export function addonSummary(addon: Addon, catalog: Catalog): string {
    const price = formatInr(addon.pricePaise);
    if (addon.kind === "module") {
        const m = catalog.modules.find((x) => x.id === addon.module);
        return `${m ? m.name : "Pick a module"} for ${price} a month, on plans that don't include it`;
    }
    const unit = ADDON_KIND_WORDS[addon.kind].unit;
    if (addon.mode === "unit") return `${price} a month per ${unit}`;
    return `+${addon.qty} ${unit}${addon.qty > 1 ? "s" : ""} for ${price} a month`;
}

/**
 * Who could use it today, from the page's counts: businesses on a plan
 * without the module, or near or over the limit it raises. Empty when
 * nobody, or when the counts aren't measured.
 */
export function addonProspects(
    addon: Addon,
    catalog: Catalog,
    pricing: Pick<AdminPricing, "plans" | "usage">,
): string {
    const moduleId = addon.kind === "module" ? addon.module : addon.kind;
    const m = catalog.modules.find((x) => x.id === moduleId);
    if (!m) return "";
    let n = 0;
    for (const plan of pricing.plans) {
        const cell = cellOf(m, plan.planId);
        if (addon.kind === "module") {
            if (!cell.inc) n += plan.businesses;
            continue;
        }
        if (!cell.inc || cell.limit === null) continue;
        const list = pricing.usage[plan.planId] as ModuleUsage[] | undefined;
        const u = list?.find((x) => x.moduleId === moduleId);
        n += (u?.near ?? 0) + (u?.over ?? 0);
    }
    if (n === 0) return "";
    const who = n === 1 ? "1 business" : `${n} businesses`;
    return addon.kind === "module"
        ? `${who} could buy it today`
        : `${who} near their limit could use it`;
}
