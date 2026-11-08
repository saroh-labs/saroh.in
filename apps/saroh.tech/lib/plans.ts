import type {
    PlanCardView,
    PricingPageModel,
    PricingView,
} from "@saroh/marketing/pricing-model";
import {
    placeholderPricingModel,
    pricingPageModel,
} from "@saroh/marketing/pricing-view";
import { sentenceList } from "@saroh/marketing/sentence-list";
import type { Catalog } from "@saroh/pricing-catalog";
import {
    catalogMoney,
    cellOf,
    countedWhat,
    formatMinor,
    indiaOnlyWord,
    LIMIT_WORDS,
    limitWordsFor,
    parseCatalog,
} from "@saroh/pricing-catalog";

import type { FaqId } from "@/content/faq";
import { faqItems } from "@/content/faq";
import { FREE_PLAN_LINE } from "@/content/home";
import { PRICING } from "@/content/pricing";

/** Words of India's catalogue that mean nothing on this edition (`indiaOnlyWord`). */
const indiaOnly = (text: string) => indiaOnlyWord(text) !== null;

/**
 * The catalogue as this edition's pricing page may show it (owner, 8 Nov
 * 2026: "filter and flag"): a row whose name says something India-only is
 * hidden, and a plan's words that do are left blank, so the page never
 * prints them. The admin console flags the same words on the draft.
 */
export function withoutIndiaWords(catalog: Catalog): Catalog {
    return {
        ...catalog,
        modules: catalog.modules.map((m) =>
            indiaOnly(`${m.name} ${m.what}`)
                ? { ...m, pricing: "hidden" }
                : {
                      ...m,
                      cells: Object.fromEntries(
                          Object.entries(m.cells).map(([plan, cell]) => [
                              plan,
                              cell.inc && indiaOnly(`${cell.text} ${cell.card}`)
                                  ? { ...cell, text: "", card: "" }
                                  : cell,
                          ]),
                      ),
                  },
        ),
    };
}

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
    return (await readPricing(api, fetcher))?.catalog ?? null;
}

/**
 * The catalogue and whether Saroh sells its paid plans now (stage 9,
 * DEC-211: the API's `offered`, its switch on and a paid plan published).
 * Null as {@link readCatalog} is.
 */
export async function readPricing(
    api = process.env.API_URL?.trim(),
    fetcher: typeof fetch = fetch,
): Promise<{ catalog: Catalog; offered: boolean } | null> {
    if (!api) return null;
    try {
        const res = await fetcher(`${api}/public/pricing`, {
            headers: { accept: "application/json" },
            cache: "force-cache",
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GET /public/pricing: ${res.status}`);
        const body = (await res.json()) as {
            catalog?: unknown;
            offered?: unknown;
        };
        return {
            catalog: parseCatalog(body.catalog),
            offered: body.offered === true,
        };
    } catch (err) {
        console.warn(
            "[pricing] the catalogue could not be read; Free keeps its general lines",
            err instanceof Error ? err.message : err,
        );
        return null;
    }
}

const freePlanOf = (catalog: Catalog) =>
    catalog.plans.find(
        (p) => p.id === "free" && p.pricePaise === 0 && !p.retired,
    );

/** "Your website" → "your website"; "1 website" stays. */
const lowerFirst = (s: string) =>
    /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;

/**
 * The line under a hero's buttons, as saroh.in builds it: "Free to start: 1
 * website, … and …. No card needed.", from Free's card lines for the modules
 * `FREE_PLAN_LINE` picks. With no catalogue, or none of them, the fallback.
 */
export function freePlanLine(catalog: Catalog | null): string {
    const { lead, modules, tail, fallback } = FREE_PLAN_LINE;
    const free = catalog && freePlanOf(catalog);
    if (!catalog || !free) return fallback;
    const parts = modules.flatMap((id) => {
        const m = catalog.modules.find((x) => x.id === id);
        if (m?.pricing !== "show") return [];
        const cell = cellOf(m, free.id);
        return cell.inc && cell.card && !indiaOnly(cell.card)
            ? [lowerFirst(cell.card)]
            : [];
    });
    return parts.length ? `${lead}: ${sentenceList(parts)}. ${tail}` : fallback;
}

/** A page's questions. "start-free" lists Free's limits when the catalogue was read. */
export function faqWithPlans(catalog: Catalog | null, ids: FaqId[]) {
    const limits = catalog && freeLimitLines(catalog);
    return faqItems(ids).map((item, i) =>
        ids[i] === "start-free" && limits
            ? {
                  ...item,
                  a: `Free includes ${sentenceList(limits.map(lowerFirst))}. No card needed.`,
              }
            : item,
    );
}

/**
 * Free's limits, in saroh.in's words: its card line, or for a capped row with
 * none, the words the limit's own notices use. It reads Free's cells and
 * nothing else, so a price or a paid plan's contents can't reach the page.
 * Null when the catalogue has no free plan or says nothing for it.
 */
export function freeLimitLines(catalog: Catalog): string[] | null {
    const free = freePlanOf(catalog);
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
        return line && !indiaOnly(line) ? [line] : [];
    });
    return lines.length ? lines : null;
}

/**
 * What Free's limits do, for /pricing: each capped row's line, and what its own
 * notices say happens at the limit (`LIMIT_WORDS`, the words the API refuses
 * in). The team's row stays out, since these pages speak to one person (DEC-203).
 * Null with no catalogue: the page keeps its footnote.
 */
export function freeUsage(
    catalog: Catalog | null,
): { label: string; at: string }[] | null {
    const free = catalog && freePlanOf(catalog);
    if (!catalog || !free) return null;
    const rows = catalog.modules.flatMap((m) => {
        if (m.pricing !== "show") return [];
        const cell = cellOf(m, free.id);
        const words = limitWordsFor(m.id);
        if (
            !cell.inc ||
            cell.limit === null ||
            !words ||
            words === LIMIT_WORDS.teamMembers
        ) {
            return [];
        }
        const label =
            cell.card ||
            `${cell.limit.toLocaleString("en-US")} ${countedWhat(words.what, cell.limit)}`;
        return indiaOnly(label) ? [] : [{ label, at: words.paused }];
    });
    return rows.length ? rows : null;
}

/**
 * The pricing page's plans. While Saroh doesn't sell its paid plans here
 * (DEC-211), only Free's limits come from a catalogue and paid plans say
 * they come later. Once it does (`offered`, stage 9), the whole catalogue
 * in its own money, dollars with no tax: never an India catalogue, which
 * is in rupees.
 */
export function pricingModel(
    catalog: Catalog | null = null,
    offered = false,
): PricingPageModel {
    const money = catalog ? catalogMoney(catalog) : null;
    if (
        catalog &&
        offered &&
        money?.tax === "none" &&
        catalog.plans.some((p) => p.pricePaise > 0)
    ) {
        return pricingPageModel(withoutIndiaWords(catalog), {
            money: (minor) => formatMinor(minor, money.currency),
            count: (n) => n.toLocaleString("en-US"),
            tax: null,
        });
    }
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

/** Home's and a solution page's card: Free's alone, the one plan with something to press. */
export function freeCardModel(catalog: Catalog | null): PricingPageModel {
    const model = pricingModel(catalog);
    const view = model.views["month-excl"];
    const free: PricingView = {
        ...view,
        plans: view.plans.filter((plan) => !plan.cta.paid),
    };
    return {
        ...model,
        views: {
            "month-excl": free,
            "month-incl": free,
            "year-excl": free,
            "year-incl": free,
        },
    };
}
