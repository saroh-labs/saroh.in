import type {
    PlanCardView,
    PricingPageModel,
    PricingView,
} from "@saroh/marketing/pricing-model";
import { placeholderPricingModel } from "@saroh/marketing/pricing-view";
import type { Catalog } from "@saroh/pricing-catalog";
import {
    cellOf,
    countedWhat,
    limitWordsFor,
    parseCatalog,
} from "@saroh/pricing-catalog";

import { PRICING } from "@/content/pricing";

/** Words of India's catalogue that mean nothing on this edition. */
const INDIA_ONLY = /₹|rupee|\bINR\b|\bGST\b|\bUPI\b|razorpay|cashfree/i;

/**
 * The published catalogue, when the page is built, for Free's limits alone.
 * Anything short of a valid answer is null: no `API_URL`, no version published
 * (404), the API down, or a snapshot that doesn't validate. The page then keeps
 * its general lines, so a failed read never stops a deploy or shows a wrong limit.
 */
export async function readCatalog(
    api = process.env.API_URL?.trim(),
    fetcher: typeof fetch = fetch,
): Promise<Catalog | null> {
    if (!api) return null;
    try {
        const res = await fetcher(`${api}/public/pricing`, {
            headers: { accept: "application/json" },
            cache: "force-cache",
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GET /public/pricing: ${res.status}`);
        const body = (await res.json()) as { catalog?: unknown };
        return parseCatalog(body.catalog);
    } catch (err) {
        console.warn(
            "[pricing] the catalogue could not be read; Free keeps its general lines",
            err instanceof Error ? err.message : err,
        );
        return null;
    }
}

/**
 * Free's limits, in saroh.in's words: its card line, or for a capped row with
 * none, the words the limit's own notices use. It reads Free's cells and
 * nothing else, so a price or a paid plan's contents can't reach the page.
 * Null when the catalogue has no free plan or says nothing for it.
 */
export function freeLimitLines(catalog: Catalog): string[] | null {
    const free = catalog.plans.find(
        (p) => p.id === "free" && p.pricePaise === 0 && !p.retired,
    );
    if (!free) return null;
    const lines = catalog.modules.flatMap((m) => {
        if (m.pricing !== "show") return [];
        const cell = cellOf(m, free.id);
        if (!cell.inc) return [];
        const words = limitWordsFor(m.id);
        const line =
            cell.card ||
            (words && cell.limit !== null
                ? `${cell.limit.toLocaleString("en-US")} ${countedWhat(words.what, cell.limit)}`
                : "");
        return line && !INDIA_ONLY.test(line) ? [line] : [];
    });
    return lines.length ? lines : null;
}

/**
 * The pricing page's plans. Only Free's limits come from a catalogue. Stage 9:
 * with a USD catalogue, return `pricingPageModel(catalog, { money, count, tax: null })`.
 */
export function pricingModel(catalog: Catalog | null = null): PricingPageModel {
    const limits = catalog && freeLimitLines(catalog);
    const model = placeholderPricingModel({
        plans: PRICING.plans,
        price: PRICING.noPrice,
        note: "",
        details: "",
    });
    const words = (plan: PlanCardView): PlanCardView => {
        const { tagline, ...rest } = PRICING.words[plan.id];
        return {
            ...plan,
            tagline,
            ...(plan.cta.paid
                ? { lead: PRICING.paidLead, lines: [] }
                : {
                      ...rest,
                      per: "",
                      lines: (limits
                          ? [...limits, ...PRICING.freeAlways]
                          : PRICING.freeLines
                      ).map((t) => ({ t, soon: false })),
                  }),
        };
    };
    const view: PricingView = {
        plans: model.views["month-excl"].plans.map(words),
        usage: null,
        footnote: limits ? "" : PRICING.footnote,
    };
    return {
        ...model,
        views: {
            "month-excl": view,
            "month-incl": view,
            "year-excl": view,
            "year-incl": view,
        },
        rows: [],
    };
}
