import type { Catalog } from "@saroh/pricing-catalog";
import {
    cardLines,
    cellOf,
    formatInr,
    offeredPlans,
} from "@saroh/pricing-catalog";

import { FREE_PLAN_LINE, PLAN_TEASERS } from "@/content/home";
import type { FaqItem, PlanId } from "@/content/types";
import {
    PLAN_DETAILS_PLACEHOLDER,
    PRICE_NOTE,
    PRICE_PLACEHOLDER,
} from "@/content/types";

/**
 * One plan as a teaser card draws it: everything `<PlanTeaserCard>` shows,
 * already worded. The card never looks anything up, so where the words come
 * from can change without touching a page or the card.
 *
 * The words come from the published pricing catalogue (plans catalogue U24,
 * KTD-13): the name, the monthly price before GST, and what the plan
 * includes from the catalogue's card lines. With no catalogue (none
 * published, or the API unreachable on a first build) every card shows the
 * placeholder: no price or limit ever lives in this repo.
 */
export interface PlanTeaserView {
    /** The catalogue's plan id ("free", "grow", "pro"). */
    plan: string;
    name: string;
    /** The big figure, or `PRICE_PLACEHOLDER`. */
    price: string;
    /** The small words after the price ("a month", or the launch note). */
    priceNote: string;
    /** What the plan includes, one line. */
    what: string;
    /** The Ink card with the Saffron button. */
    featured: boolean;
    /** The page's own line under a featured plan ("For a shop, that means…"). */
    fit?: string;
    /** Whether the plan costs anything, for the CTA builder. */
    paid: boolean;
}

const NAMES = new Map(PLAN_TEASERS.map((t) => [t.plan, t.name]));

/** "a", "a and b", "a, b and c". */
export function sentenceList(items: string[]): string {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Your website" → "your website", but "UPI Autopay" stays as it is. */
function lowerFirst(s: string): string {
    return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

function upperFirst(s: string): string {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * A plan's card lines as one sentence: "One website, … and …." for the first
 * plan, "Everything in ‹previous›, plus … and …." for each later one.
 */
export function planSummary(catalog: Catalog, planId: string): string {
    const cl = cardLines(catalog, planId);
    const list = sentenceList(cl.lines.map((l) => lowerFirst(l.t)));
    if (!cl.lead) return list ? `${upperFirst(list)}.` : "";
    const lead = cl.lead.replace(/:$/, "");
    return list ? `${lead} ${list}.` : `${lead}.`;
}

function placeholderTeaser(
    plan: string,
    featured: boolean,
    fit: string | undefined,
): PlanTeaserView {
    return {
        plan,
        name: NAMES.get(plan as PlanId) ?? plan,
        price: PRICE_PLACEHOLDER,
        priceNote: PRICE_NOTE,
        what: PLAN_DETAILS_PLACEHOLDER,
        featured,
        fit,
        paid: plan !== "free",
    };
}

/**
 * One plan's teaser, from the catalogue. A plan the catalogue doesn't offer
 * (or no catalogue at all) gets the placeholder card under the site's name.
 */
export function planTeaser(
    catalog: Catalog | null,
    plan: string,
    { featured = false, fit }: { featured?: boolean; fit?: string } = {},
): PlanTeaserView {
    const p = catalog
        ? offeredPlans(catalog).find((x) => x.id === plan)
        : undefined;
    if (!catalog || !p) return placeholderTeaser(plan, featured, fit);
    return {
        plan,
        name: p.name,
        price: formatInr(p.pricePaise),
        priceNote: "a month",
        what: planSummary(catalog, plan) || PLAN_DETAILS_PLACEHOLDER,
        featured,
        fit,
        paid: p.pricePaise > 0,
    };
}

/**
 * The note before "Compare every plan" under a set of teasers: the design's
 * "Billed monthly. Prices before GST." once there are prices to qualify, and
 * nothing while every card shows the placeholder.
 */
export function planTeaserFootnote(catalog: Catalog | null): string | null {
    return catalog ? "Billed monthly. Prices before GST." : null;
}

/** A solution page's two cards: its featured plan with the fit line, then the second. */
export function solutionPlanTeasers(
    catalog: Catalog | null,
    pricing: { featured: PlanId; fit: string; second: PlanId },
): [PlanTeaserView, PlanTeaserView] {
    return [
        planTeaser(catalog, pricing.featured, {
            featured: true,
            fit: pricing.fit,
        }),
        planTeaser(catalog, pricing.second),
    ];
}

/**
 * Home's pricing teaser: every plan the catalogue offers, in its order, its
 * highlighted plan featured; the site's three names on the placeholder.
 */
export function homePlanTeasers(catalog: Catalog | null): PlanTeaserView[] {
    if (!catalog) {
        return PLAN_TEASERS.map((t) =>
            placeholderTeaser(t.plan, t.featured, undefined),
        );
    }
    return offeredPlans(catalog).map((p) =>
        planTeaser(catalog, p.id, { featured: p.featured }),
    );
}

/**
 * The line under a hero's buttons: "Free to start: one website, … and ….
 * Grow adds …", naming the free plan's card lines for the modules
 * `FREE_PLAN_LINE` picks. Without a catalogue (or a free plan in it), the
 * placeholder line.
 */
export function freePlanLine(catalog: Catalog | null): string {
    const { lead, modules, tail, fallback } = FREE_PLAN_LINE;
    const free = catalog
        ? offeredPlans(catalog).find((p) => p.pricePaise === 0)
        : undefined;
    if (!catalog || !free) return fallback;
    const parts = modules.flatMap((id) => {
        const m = catalog.modules.find((x) => x.id === id);
        if (!m || m.pricing === "hidden") return [];
        const c = cellOf(m, free.id);
        return c.inc && c.card ? [lowerFirst(c.card)] : [];
    });
    if (!parts.length) return fallback;
    return `${lead}: ${sentenceList(parts)}. ${tail}`;
}

/**
 * Home's "What does Start free include?", worded as the design words it once
 * there is a catalogue: the free plan's price and card lines, then the first
 * paid plan's name and price. Without a catalogue (or a free and a paid plan
 * in it), `fallback`, the content file's answer with no figures.
 */
export function startFreeFaq(
    catalog: Catalog | null,
    fallback: FaqItem,
): FaqItem {
    const plans = catalog ? offeredPlans(catalog) : [];
    const free = plans.find((p) => p.pricePaise === 0);
    const next = plans.find((p) => p.pricePaise > 0);
    if (!catalog || !free || !next) return fallback;
    const summary = planSummary(catalog, free.id);
    if (!summary) return fallback;
    return {
        q: fallback.q,
        a: `The ${free.name} plan is ${formatInr(free.pricePaise)} a month: ${lowerFirst(summary)} Move to ${next.name} (${formatInr(next.pricePaise)} a month) when you want to take orders, run subscriptions, send invoices or add your team.`,
    };
}
