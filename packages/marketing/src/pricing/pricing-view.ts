import type { Catalog } from "@saroh/pricing-catalog";
import {
    cardLines,
    cellOf,
    monthlyEquivalentPaise,
    offeredPlans,
    trialFirstPaise,
    yearlyPaise,
} from "@saroh/pricing-catalog";

import type {
    CompareRow,
    PlanCardView,
    PricingPageModel,
    PricingPlaceholder,
    PricingSite,
    PricingView,
    ViewKey,
} from "./pricing-model";
import { viewKey } from "./pricing-model";
import { usageView } from "./pricing-usage";

/**
 * The pricing page as words, worked out on the server from the catalogue
 * (plans catalogue U24, the Pricing design's `renderVals`). Every figure is
 * computed here with the catalogue package's helpers, for each of the four ways
 * a visitor can look (monthly or yearly, with or without tax), so the page's
 * client part only picks one and never carries the catalogue. Currency and tax
 * are the site's (`PricingSite`): the catalogue's sums are minor units, whatever
 * its field names say.
 */

function planViews(
    catalog: Catalog,
    yearly: boolean,
    withTax: boolean,
    site: PricingSite,
): PlanCardView[] {
    const { money, tax } = site;
    const taxed = (p: number) => (withTax && tax ? tax.add(p) : p);
    const after = withTax ? tax?.afterIncl : tax?.afterExcl;
    return offeredPlans(catalog).map((p) => {
        const paid = p.pricePaise > 0;
        const year = yearly && paid;
        const charge = taxed(
            year
                ? yearlyPaise(p.pricePaise, catalog.yearly.paid)
                : p.pricePaise,
        );
        let sub: string;
        if (!paid) sub = "Free for good";
        else if (year) {
            sub = `About ${money(monthlyEquivalentPaise(charge))} a month${after ?? ""}`;
        } else sub = (withTax ? tax?.subIncl : tax?.subExcl) ?? "";
        // DEC-093: the offer is monthly only (yearly is one payment), and
        // a first month that costs something is said with its amount.
        const trialOn = paid && !year && p.trial?.on === true;
        const first = trialOn ? trialFirstPaise(p) : 0;
        const cl = cardLines(catalog, p.id);
        return {
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            featured: p.featured,
            price: money(charge),
            per: year ? "a year" : "a month",
            sub,
            cta: {
                plan: p.id,
                planName: p.name,
                paid,
                trialDays: trialOn && first === 0 ? p.trial?.days : undefined,
                cycle: year ? "year" : "month",
            },
            lead: cl.lead,
            trial: !trialOn
                ? ""
                : first > 0
                  ? `First month ${money(taxed(first))}${after ?? ""}`
                  : `Try it free for ${p.trial?.days} days`,
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

function footnote(
    catalog: Catalog,
    yearly: boolean,
    withTax: boolean,
    site: PricingSite,
) {
    const billed = yearly
        ? `Billed yearly, pay for ${catalog.yearly.paid} months and get 12.`
        : "Billed monthly.";
    const tax = withTax ? site.tax?.footnoteIncl : site.tax?.footnoteExcl;
    return tax ? `${billed} ${tax}` : billed;
}

/** The pricing page for a catalogue: the design's every state, worked out. */
export function pricingPageModel(
    catalog: Catalog,
    site: PricingSite,
): PricingPageModel {
    const yearlyOn = catalog.yearly.on;
    const views = {} as Record<ViewKey, PricingView>;
    for (const yearly of [false, true]) {
        for (const withTax of [false, true]) {
            const y = yearly && yearlyOn;
            views[viewKey(yearly, withTax)] = {
                plans: planViews(catalog, y, withTax, site),
                usage: usageView(catalog, withTax, site),
                footnote: footnote(catalog, y, withTax, site),
            };
        }
    }
    return {
        placeholder: false,
        yearly: yearlyOn ? { freeMonths: 12 - catalog.yearly.paid } : null,
        tax: site.tax
            ? { toggle: true, initial: catalog.gst.show === "incl" }
            : { toggle: false, initial: false },
        views,
        rows: compareRows(catalog),
    };
}

/**
 * The page with no catalogue to show (the API unreachable on a first build,
 * or no version published yet): the plan names, every price the
 * placeholder, every detail the placeholder's line. No toggles:
 * there is nothing for them to change.
 */
export function placeholderPricingModel(
    words: PricingPlaceholder,
): PricingPageModel {
    const { plans, price, note, details } = words;
    const view: PricingView = {
        plans: plans.map((t) => ({
            id: t.plan,
            name: t.name,
            tagline: "",
            featured: t.featured,
            price,
            per: "",
            sub: note,
            cta: {
                plan: t.plan,
                planName: t.name,
                paid: t.plan !== "free",
                cycle: "month",
            },
            lead: "",
            trial: "",
            lines: [{ t: details, soon: false }],
        })),
        usage: null,
        footnote: "",
    };
    return {
        placeholder: true,
        yearly: null,
        tax: { toggle: false, initial: false },
        views: {
            "month-excl": view,
            "month-incl": view,
            "year-excl": view,
            "year-incl": view,
        },
        rows: [
            {
                kind: "line",
                label: details,
                soon: false,
                cells: plans.map(() => ({ yes: false })),
            },
        ],
    };
}
