import {
    cardLines,
    formatInr,
    offeredPlans,
    parseCatalog,
    trialFirstPaise,
} from "@saroh/pricing-catalog";

/**
 * The plans, read when the site is built: the repo holds no prices. There is
 * no USD catalogue yet, so what comes back are placeholders, and this file is
 * the whole swap: set the note to null and format in the real currency. Only
 * then do Offers belong in /pricing's JSON-LD and `unreviewed` come off it.
 */
export const PLANS_NOTE: string | null =
    "Placeholder prices, shown until the global plans are set.";

export interface PlanCard {
    id: string;
    name: string;
    tagline: string;
    featured: boolean;
    free: boolean;
    /** Formatted, in the catalogue's own currency. */
    price: string;
    /** The plan's first-month offer, in the catalogue's own words and money. */
    offer: string | null;
    lead: string;
    lines: readonly string[];
}

/** Null when the plans can't be read: unset, a 404 or any failure. */
export async function readPlans(
    fetcher: typeof fetch = fetch,
): Promise<PlanCard[] | null> {
    const api = process.env.API_URL;
    if (!api) return null;
    try {
        const res = await fetcher(`${api}/public/pricing`, {
            headers: { accept: "application/json" },
            cache: "force-cache",
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const { catalog: raw } = (await res.json()) as { catalog: unknown };
        const catalog = parseCatalog(raw);
        return offeredPlans(catalog).map((p) => {
            const { lead, lines } = cardLines(catalog, p.id);
            const free = p.pricePaise === 0;
            const first = trialFirstPaise(p);
            return {
                id: p.id,
                name: p.name,
                tagline: p.tagline,
                featured: p.featured,
                free,
                price: formatInr(p.pricePaise),
                offer:
                    free || !p.trial?.on
                        ? null
                        : first > 0
                          ? `${formatInr(first)} first month`
                          : `Free for ${p.trial.days} days`,
                lead,
                lines: lines.map((l) => l.t),
            };
        });
    } catch (err) {
        console.warn(
            "[plans] could not read the plans",
            err instanceof Error ? err.message : err,
        );
        return null;
    }
}
