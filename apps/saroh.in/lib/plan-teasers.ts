import type { Catalog } from "@saroh/pricing-catalog";
import {
    cardLines,
    cellOf,
    formatInr,
    offeredPlans,
} from "@saroh/pricing-catalog";

import { faqItems } from "@/content/faq";
import { FREE_PLAN_LINE } from "@/content/home";
import type { FaqId, FaqItem } from "@/content/types";

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

/**
 * The line under a hero's buttons: "Free to start: one website, … and ….
 * Move up when you need more.", naming the free plan's card lines for the modules
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
 * paid plan's name and price. What that plan adds is the catalogue's to say
 * (its card), not this line's: the split is set in the admin (DEC-075, D3). Without a catalogue (or a free and a paid plan
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
        a: `The ${free.name} plan is ${formatInr(free.pricePaise)} a month: ${lowerFirst(summary)} Move to ${next.name} (${formatInr(next.pricePaise)} a month) when you need more.`,
    };
}

/** A page's questions, its "start-free" answer through `startFreeFaq`: home and every solution page. */
export function faqWithPlans(catalog: Catalog | null, ids: FaqId[]): FaqItem[] {
    return faqItems(ids).map((item, i) =>
        ids[i] === "start-free" ? startFreeFaq(catalog, item) : item,
    );
}
