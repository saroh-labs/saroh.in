import type { AddonKind, Catalog } from "@saroh/pricing-catalog";
import {
    cardLines,
    cellOf,
    formatInr,
    GST_PERCENT,
    monthlyEquivalentPaise,
    offeredPlans,
    withGstPaise,
    yearlyPaise,
} from "@saroh/pricing-catalog";

import { PLAN_TEASERS } from "@/content/home";
import {
    PLAN_DETAILS_PLACEHOLDER,
    PRICE_NOTE,
    PRICE_PLACEHOLDER,
} from "@/content/types";

import type {
    AddonView,
    CompareRow,
    PlanCardView,
    PricingPageModel,
    PricingView,
    ViewKey,
} from "./pricing-model";
import { viewKey } from "./pricing-model";

/**
 * The pricing page as words, worked out on the server from the catalogue
 * (plans catalogue U24, the Pricing design's `renderVals`). Every figure is
 * computed here with the catalogue package's paise helpers, for each of the
 * four ways a visitor can look (monthly or yearly, with or without GST), so
 * the page's client part only picks one and never carries the catalogue.
 */

export { viewKey } from "./pricing-model";
export type {
    AddonView,
    CompareRow,
    Cycle,
    PlanCardView,
    PricingPageModel,
    PricingView,
    ViewKey,
} from "./pricing-model";

/** "team member" / "team members": what one unit of an add-on adds. */
const UNIT: Record<Exclude<AddonKind, "module">, [string, string]> = {
    members: ["team member", "team members"],
    products: ["product", "products"],
    orders: ["order a month", "orders a month"],
    bookings: ["booking a month", "bookings a month"],
    integrations: ["connection", "connections"],
};

function addonViews(catalog: Catalog, withGst: boolean): AddonView[] {
    const money = (p: number) => formatInr(withGst ? withGstPaise(p) : p);
    return catalog.addons.map((a) => {
        const pr = money(a.pricePaise);
        let line: string;
        if (a.kind === "module") {
            const m = catalog.modules.find((x) => x.id === a.module);
            line = `${m ? m.name : a.name} on a plan that doesn't include it, ${pr} a month`;
        } else if (a.mode === "unit") {
            line = `${pr} a month per ${UNIT[a.kind][0]}`;
        } else {
            const [one, many] = UNIT[a.kind];
            line = `+${a.qty} ${a.qty > 1 ? many : one} for ${pr} a month`;
        }
        return { id: a.id, name: a.name, line };
    });
}

function planViews(
    catalog: Catalog,
    yearly: boolean,
    withGst: boolean,
): PlanCardView[] {
    const gst = (p: number) => (withGst ? withGstPaise(p) : p);
    return offeredPlans(catalog).map((p) => {
        const paid = p.pricePaise > 0;
        const year = yearly && paid;
        const charge = gst(
            year
                ? yearlyPaise(p.pricePaise, catalog.yearly.paid)
                : p.pricePaise,
        );
        let sub: string;
        if (!paid) sub = "Free for good";
        else if (year) {
            sub = `About ${formatInr(monthlyEquivalentPaise(charge))} a month${withGst ? " incl. GST" : " + GST"}`;
        } else sub = withGst ? "Incl. GST" : "+ GST";
        const trialOn = paid && p.trial?.on === true;
        const cl = cardLines(catalog, p.id);
        return {
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            featured: p.featured,
            price: formatInr(charge),
            per: year ? "a year" : "a month",
            sub,
            cta: {
                plan: p.id,
                planName: p.name,
                paid,
                trialDays: trialOn ? p.trial?.days : undefined,
            },
            lead: cl.lead,
            trial: trialOn ? `Try it free for ${p.trial?.days} days` : "",
            lines: cl.lines,
        };
    });
}

function compareRows(catalog: Catalog): CompareRow[] {
    const plans = offeredPlans(catalog);
    const rows: CompareRow[] = [];
    for (const g of catalog.groups) {
        const mods = catalog.modules.filter(
            (m) => m.group === g.id && m.pricing !== "hidden",
        );
        if (!mods.length) continue;
        rows.push({ kind: "group", label: g.name });
        for (const m of mods) {
            rows.push({
                kind: "line",
                label: m.name,
                soon: m.pricing === "soon",
                cells: plans.map((p) => {
                    const c = cellOf(m, p.id);
                    return c.inc
                        ? { yes: true, t: c.text || "Included" }
                        : { yes: false };
                }),
            });
        }
    }
    return rows;
}

function footnote(catalog: Catalog, yearly: boolean, withGst: boolean) {
    const billed = yearly
        ? `Billed yearly, pay for ${catalog.yearly.paid} months and get 12.`
        : "Billed monthly.";
    const gst = withGst
        ? ` Prices include ${GST_PERCENT}% GST.`
        : ` Prices before GST (${GST_PERCENT}%).`;
    return billed + gst;
}

/** The pricing page for a catalogue: the design's every state, worked out. */
export function pricingPageModel(catalog: Catalog): PricingPageModel {
    const yearlyOn = catalog.yearly.on;
    const views = {} as Record<ViewKey, PricingView>;
    for (const yearly of [false, true]) {
        for (const withGst of [false, true]) {
            const y = yearly && yearlyOn;
            views[viewKey(yearly, withGst)] = {
                plans: planViews(catalog, y, withGst),
                addons: addonViews(catalog, withGst),
                footnote: footnote(catalog, y, withGst),
            };
        }
    }
    return {
        placeholder: false,
        yearly: yearlyOn ? { freeMonths: 12 - catalog.yearly.paid } : null,
        gst: { toggle: true, initial: catalog.gst.show === "incl" },
        views,
        rows: compareRows(catalog),
    };
}

/**
 * The page with no catalogue to show (the API unreachable on a first build,
 * or no version published yet): the plan names, every price the
 * placeholder, every detail "Plan details announced at launch". No toggles:
 * there is nothing for them to change.
 */
export function placeholderPricingModel(): PricingPageModel {
    const view: PricingView = {
        plans: PLAN_TEASERS.map((t) => ({
            id: t.plan,
            name: t.name,
            tagline: "",
            featured: t.featured,
            price: PRICE_PLACEHOLDER,
            per: "",
            sub: PRICE_NOTE,
            cta: { plan: t.plan, planName: t.name, paid: t.plan !== "free" },
            lead: "",
            trial: "",
            lines: [{ t: PLAN_DETAILS_PLACEHOLDER, soon: false }],
        })),
        addons: [],
        footnote: "",
    };
    return {
        placeholder: true,
        yearly: null,
        gst: { toggle: false, initial: false },
        views: {
            "month-excl": view,
            "month-incl": view,
            "year-excl": view,
            "year-incl": view,
        },
        rows: [
            {
                kind: "line",
                label: PLAN_DETAILS_PLACEHOLDER,
                soon: false,
                cells: PLAN_TEASERS.map(() => ({ yes: false })),
            },
        ],
    };
}
