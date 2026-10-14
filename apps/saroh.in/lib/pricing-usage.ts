import type {
    Addon,
    AddonKind,
    Catalog,
    CatalogModule,
    Plan,
} from "@saroh/pricing-catalog";
import {
    addonOfferedOn,
    cellOf,
    formatCount,
    formatInr,
    GST_PERCENT,
    offeredPlans,
    withGstPaise,
} from "@saroh/pricing-catalog";

import type { UsageRow, UsageView } from "./pricing-model";
import { NOT_INCLUDED } from "./pricing-model";

/**
 * "Usage beyond your plan": one row per catalogue row a business can add to,
 * one column per plan, each cell in one phrasing (the owner's brief of
 * 14 Oct 2026, after Vercel's pricing page). Every number is the
 * catalogue's; the code holds only the words around them.
 */

type LimitKind = Exclude<AddonKind, "module">;

/** What one of a kind is called after a number: one, and many. */
const NOUN: Record<LimitKind, [string, string]> = {
    members: ["person", "people"],
    products: ["product", "products"],
    orders: ["order", "orders"],
    // Online ones only (DEC-095): the team's own bookings are never capped.
    bookings: ["online booking", "online bookings"],
    integrations: ["connection", "connections"],
};

/**
 * Add-ons are bought on a paid plan billed through the provider
 * (`PRICING_ROLLOUT.md` › Add-ons), so a free plan offers none whatever the
 * add-on names.
 */
function addonFor(
    catalog: Catalog,
    plan: Plan,
    match: (a: Addon) => boolean,
): Addon | undefined {
    if (plan.pricePaise === 0) return undefined;
    return catalog.addons.find((a) => match(a) && addonOfferedOn(a, plan.id));
}

/** One plan's cell for a row a pack or a unit adds to. */
export function limitCell(input: {
    module: CatalogModule;
    planId: string;
    addon?: Addon;
    money: (paise: number) => string;
}): string {
    const c = cellOf(input.module, input.planId);
    if (!c.inc) return NOT_INCLUDED;
    if (c.limit === null) return "No limit";
    const pm = c.per === "month" ? " a month" : "";
    const included = `${formatCount(c.limit)}${pm} included`;
    const a = input.addon;
    if (!a || a.kind === "module") return included;
    const [one, many] = NOUN[a.kind];
    const price = input.money(a.pricePaise);
    const then =
        a.mode === "unit"
            ? `then ${price} per ${one} a month`
            : `then ${price} per ${formatCount(a.qty)}`;
    const step = a.mode === "unit" ? 1 : a.qty;
    const upTo =
        a.max === undefined
            ? ""
            : `, up to ${formatCount(c.limit + a.max * step)} ${many}${pm}`;
    return `${included}, ${then}${upTo}`;
}

/** One plan's cell for a module a plan can add on its own. */
export function moduleCell(input: {
    module: CatalogModule;
    planId: string;
    addon?: Addon;
    money: (paise: number) => string;
}): string {
    if (cellOf(input.module, input.planId).inc) return "Included";
    if (!input.addon) return NOT_INCLUDED;
    return `Add it for ${input.money(input.addon.pricePaise)} a month`;
}

/**
 * The rows: every catalogue row the pricing page shows that some offered
 * paid plan can add to, by group and in catalogue order: a capped row with
 * a pack or unit of its kind, or a row a plan leaves out with an add-on
 * that switches it on. A row nobody can grow past is left out.
 */
export function usageRows(
    catalog: Catalog,
    withGst: boolean,
): { rows: UsageRow[]; modules: CatalogModule[] } {
    const money = (p: number) => formatInr(withGst ? withGstPaise(p) : p);
    const plans = offeredPlans(catalog);
    const rows: UsageRow[] = [];
    const modules: CatalogModule[] = [];
    for (const g of catalog.groups) {
        const lines: UsageRow[] = [];
        for (const m of catalog.modules) {
            if (m.group !== g.id || m.pricing === "hidden") continue;
            const match = (a: Addon) =>
                a.kind === "module" ? a.module === m.id : a.kind === m.id;
            const addons = plans.map((p) => addonFor(catalog, p, match));
            // A pack raises a cap, a module add-on fills a gap: a row
            // shows when some plan has one it can use.
            const usable = plans.some((p, i) => {
                const c = cellOf(m, p.id);
                return (
                    !!addons[i] &&
                    (addons[i]?.kind === "module"
                        ? !c.inc
                        : c.inc && c.limit !== null)
                );
            });
            if (!usable) continue;
            const isModule = addons.some((a) => a?.kind === "module");
            lines.push({
                kind: "line",
                label: m.name,
                what: m.what,
                cells: plans.map((p, i) =>
                    (isModule ? moduleCell : limitCell)({
                        module: m,
                        planId: p.id,
                        addon: addons[i],
                        money,
                    }),
                ),
            });
            modules.push(m);
        }
        if (lines.length) rows.push({ kind: "group", label: g.name }, ...lines);
    }
    return { rows, modules };
}

/** "Plan B and Plan C". */
function names(list: string[]): string {
    const rest = list.slice(0, -1);
    const last = list[list.length - 1] ?? "";
    return rest.length ? `${rest.join(", ")} and ${last}` : last;
}

/**
 * The notes under the table, each true of the product today (DEC-157,
 * `PRICING_ROLLOUT.md` › Add-ons, `billing/metering.service.ts`).
 */
export function usageNotes(
    catalog: Catalog,
    modules: CatalogModule[],
    withGst: boolean,
): string[] {
    const plans = offeredPlans(catalog);
    const paid = plans.filter((p) => p.pricePaise > 0);
    const notes = [
        // `addon-charges.ts`: charged after the period, prorated part-way.
        "What you add is billed with your plan after the month it covers, or after the year on a yearly plan. Added part-way through, it costs only the days left.",
        // `PUT …/billing/addons/:id`: limits move at once.
        "Add or remove it any time in Settings › Plan and billing, and your allowance changes at once.",
    ];
    // A soft cell counts and tells, and never refuses (`rowGate`): said
    // for the monthly rows customers fill (orders, bookings) whose every
    // cap on a paid plan is soft.
    const soft = modules.filter((m) => {
        const caps = paid
            .map((p) => cellOf(m, p.id))
            .filter((c) => c.inc && c.limit !== null);
        return (
            caps.length > 0 &&
            caps.every((c) => c.inc && c.soft && c.per === "month")
        );
    });
    if (soft.length) {
        const on = paid.filter((p) =>
            soft.some((m) => {
                const c = cellOf(m, p.id);
                return c.inc && c.limit !== null;
            }),
        );
        notes.push(
            `On ${names(on.map((p) => p.name))}, ${names(soft.map((m) => m.name.toLowerCase()))} past the allowance still come in, so no customer is turned away. We let you know when you pass it.`,
        );
    }
    const free = plans.filter((p) => p.pricePaise === 0);
    if (free.length && paid.length) {
        notes.push(
            `On ${names(free.map((p) => p.name))}, the allowance is what you get: adding more is for paid plans.`,
        );
    }
    notes.push(
        withGst
            ? `Prices include ${GST_PERCENT}% GST.`
            : `Prices are before GST. ${GST_PERCENT}% GST is added to your bill.`,
    );
    return notes;
}

/** The section, or null when no plan a visitor can choose can add anything. */
export function usageView(
    catalog: Catalog,
    withGst: boolean,
): UsageView | null {
    const { rows, modules } = usageRows(catalog, withGst);
    if (!rows.length) return null;
    return { rows, notes: usageNotes(catalog, modules, withGst) };
}
