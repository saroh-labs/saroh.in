import type { Catalog } from "@saroh/pricing-catalog";
import {
    cardLines,
    cellOf,
    chargedYearlyPaise,
    monthlyEquivalentPaise,
    NO_REFUNDS_LINE,
    offeredPlans,
    regularYearlyPaise,
    trialFirstPaise,
} from "@saroh/pricing-catalog";

import type {
    CompareRow,
    PlanCardView,
    PlanOffer,
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
    offers: readonly PlanOffer[],
): PlanCardView[] {
    const { money, tax } = site;
    const taxed = (p: number) => (withTax && tax ? tax.add(p) : p);
    const after = withTax ? tax?.afterIncl : tax?.afterExcl;
    return offeredPlans(catalog).map((p) => {
        const paid = p.pricePaise > 0;
        const year = yearly && paid;
        const charge = taxed(
            year ? chargedYearlyPaise(catalog, p) : p.pricePaise,
        );
        // A yearly offer leads, the regular year struck beside it (DEC-231).
        const yearOffer = year && p.yearlyOfferPaise !== undefined;
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
        // The launch coupon doesn't stack on a yearly offer (DEC-231).
        const offer =
            paid && !yearOffer
                ? offers.find((o) => o.planId === p.id && o.discountPaise > 0)
                : undefined;
        return {
            id: p.id,
            name: p.name,
            tagline: p.tagline,
            featured: p.featured,
            price: money(charge),
            was: yearOffer
                ? money(taxed(regularYearlyPaise(catalog, p)))
                : undefined,
            per: year ? "a year, paid once" : "a month",
            sub,
            cta: {
                plan: p.id,
                planName: p.name,
                paid,
                trialDays: trialOn && first === 0 ? p.trial?.days : undefined,
                cycle: year ? "year" : "month",
            },
            lead: cl.lead,
            trial: offer
                ? offerLine(offer, year ? charge : null, taxed, money, after)
                : !trialOn
                  ? ""
                  : first > 0
                    ? `First month ${money(taxed(first))}${after ?? ""}`
                    : `Try it free for ${p.trial?.days} days`,
            lines: cl.lines,
        };
    });
}

/**
 * A plan's automatic discount in words, as checkout takes it off: each
 * month's charge for its months, or that many months' worth off the first
 * yearly charge (`yearCharge`, taxed as shown), never more than it. A
 * percent says its percent on a month; on a year, the amount, since
 * checkout takes a percent of the monthly price, not of the year's.
 */
function offerLine(
    offer: PlanOffer,
    yearCharge: number | null,
    taxed: (p: number) => number,
    money: (minor: number) => string,
    after = "",
): string {
    if (yearCharge !== null) {
        const off = Math.min(
            taxed(offer.discountPaise * offer.months),
            yearCharge,
        );
        return `${money(off)}${after} off your first year`;
    }
    if (offer.percentOff) {
        const first = offer.months === 1 ? "month" : `${offer.months} months`;
        return `${offer.percentOff}% off your first ${first}`;
    }
    const each = `${money(taxed(offer.discountPaise))}${after}`;
    return offer.months === 1
        ? `${each} off your first month`
        : `${each} off a month for your first ${offer.months} months`;
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
    // With a yearly offer the struck price says the saving, so the rule
    // behind the regular price isn't spelled out (DEC-231).
    const offerOn = offeredPlans(catalog).some(
        (p) => p.pricePaise > 0 && p.yearlyOfferPaise !== undefined,
    );
    const billed = !yearly
        ? "Billed monthly."
        : offerOn
          ? "Billed yearly, one payment for the year."
          : `Billed yearly, pay for ${catalog.yearly.paid} months and get 12.`;
    const tax = withTax ? site.tax?.footnoteIncl : site.tax?.footnoteExcl;
    const parts = [billed, tax, yearly ? NO_REFUNDS_LINE : undefined];
    return parts.filter(Boolean).join(" ");
}

/**
 * The release switch a catalogue row waits on: while it is off the row is
 * in no card, no comparison and no usage table, so a plan never names a
 * feature the site hasn't launched (owner, 16 Nov 2026). The API's rows
 * wait on Developers, Ask AI's on Ask AI.
 */
export const ROW_SWITCH: Readonly<Partial<Record<string, string>>> = {
    "api-mcp": "ai-apps",
    "ask-ai": "ask-ai",
    "ask-ai-questions": "ask-ai",
    "api-keys": "developers",
    "api-secret": "developers",
    "api-storefront": "developers",
    webhooks: "developers",
    "api-requests": "developers",
};

/** The catalogue without the rows whose release switch is off. */
export function withoutSwitchedOff(
    catalog: Catalog,
    off: readonly string[],
): Catalog {
    const hide = (id: string) => {
        const s = ROW_SWITCH[id];
        return s !== undefined && off.includes(s);
    };
    return { ...catalog, modules: catalog.modules.filter((m) => !hide(m.id)) };
}

/** The pricing page for a catalogue: the design's every state, worked out. */
export function pricingPageModel(
    whole: Catalog,
    site: PricingSite,
    /** The release switches that are off: their rows aren't drawn. */
    off: readonly string[] = [],
    /** Each plan's automatic discount (`GET /public/pricing`). */
    offers: readonly PlanOffer[] = [],
): PricingPageModel {
    const catalog = withoutSwitchedOff(whole, off);
    const yearlyOn = catalog.yearly.on;
    const views = {} as Record<ViewKey, PricingView>;
    for (const yearly of [false, true]) {
        for (const withTax of [false, true]) {
            const y = yearly && yearlyOn;
            views[viewKey(yearly, withTax)] = {
                plans: planViews(catalog, y, withTax, site, offers),
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
