import type { InsightsPeriod } from "./period";
import type { VisitSource } from "./visit-source";
import type { VisitSourcesRead, VisitSteps } from "./visit-sources";
import { OTHER_LINKS_LABEL, OTHER_LINKS_REF } from "./visit-sources";

/**
 * Insights' "From visit to paid" and "Where do visitors come from?"
 * (DEC-171, plan U16, #1101; boards `IBFromD`, `IBFromP`, `IBOverviewD`),
 * `GET analytics/sources?period=&siteId=`. Pure: the shape the screens
 * draw, folded from U15's read (`visit-sources.ts`). The service reads.
 *
 * - **The path never goes up.** Each step is a visit that reached it, but
 *   a paid order whose visit began the day before the period, or a
 *   checkout started on a reloaded page, can make a later step a little
 *   larger than the one before. The path holds each step to at most the
 *   one before it, so it reads as people leaving, never arriving.
 * - **A source with too few visits to say anything about is folded into
 *   Other sites** ({@link SOURCE_MIN_VISITS}), and named in `folded` so the
 *   screen can say so. A source nobody came from is left out.
 * - **Counted from**: the first day a visit's source was recorded. The
 *   screen says it when that is after the period's first day, and says
 *   counting starts with the next visit when nothing has been counted.
 * - Paid is the business's (a paid order names no site), so a website
 *   chosen narrows visits, looked and started only.
 */

/** Fewer visits than this and a source's "how many paid" says nothing. */
export const SOURCE_MIN_VISITS = 5;

/** The merchant's own link labels shown under the sources, at most. */
export const REFS_SHOWN = 10;

/** One source's row: its visits and how many of them paid. */
export interface SourceRow {
    source: VisitSource;
    visits: number;
    paid: number;
}

/** One of the merchant's own links (`?ref=`): its visits and paid. */
export interface RefRow {
    ref: string;
    visits: number;
    paid: number;
}

export interface SourcesRead {
    period: InsightsPeriod;
    /** The period's first and last days, `2026-09-22` to `2026-10-19`. */
    window: { days: number; from: string; to: string };
    /** The website chosen, or null for every website together. */
    siteId: string | null;
    /** The first day a source was counted, `2026-10-21`; null: none yet. */
    countedFrom: string | null;
    /** True when counting began after the period's first day. */
    countedPart: boolean;
    /** Visited, looked, started and paid, each at most the one before. */
    path: VisitSteps;
    /** Most visits first, Other sites last; only sources someone came from. */
    sources: SourceRow[];
    /** Sources with too few visits, counted in Other sites. */
    folded: VisitSource[];
    /** The merchant's own links, most visits first. */
    refs: RefRow[];
    /** How many more of the merchant's links there were. */
    moreRefs: number;
}

/** The four steps, each held to at most the one before it. */
export function visitPath(rows: readonly VisitSteps[]): VisitSteps {
    const sum = (k: keyof VisitSteps) =>
        rows.reduce((n, r) => n + Math.max(0, r[k]), 0);
    const visits = sum("visits");
    const looked = Math.min(sum("looked"), visits);
    const started = Math.min(sum("started"), looked);
    const paid = Math.min(sum("paid"), started);
    return { visits, looked, started, paid };
}

/**
 * The sources as the table draws them: a source under the minimum folded
 * into Other sites, one nobody came from (and nobody paid from) left out,
 * the rest by visits, Other sites always last.
 */
export function sourceRows(rows: VisitSourcesRead["sources"]): {
    sources: SourceRow[];
    folded: VisitSource[];
} {
    const other: SourceRow = { source: "other", visits: 0, paid: 0 };
    const shown: SourceRow[] = [];
    const folded: VisitSource[] = [];
    for (const row of rows) {
        const { source, visits, paid } = row;
        if (source === "other") {
            other.visits += visits;
            other.paid += paid;
            continue;
        }
        if (visits <= 0 && paid <= 0) continue;
        if (visits < SOURCE_MIN_VISITS) {
            other.visits += visits;
            other.paid += paid;
            folded.push(source);
            continue;
        }
        shown.push({ source, visits, paid });
    }
    shown.sort((a, b) => b.visits - a.visits);
    if (other.visits > 0 || other.paid > 0) shown.push(other);
    return { sources: shown, folded };
}

/** The read the screens draw, from U15's read for the period. */
export function shapeSources(
    read: VisitSourcesRead,
    at: {
        period: InsightsPeriod;
        days: number;
        from: string;
        to: string;
        siteId: string | null;
    },
): SourcesRead {
    const countedFrom = read.countedFrom
        ? read.countedFrom.toISOString().slice(0, 10)
        : null;
    const { sources, folded } = sourceRows(read.sources);
    // Labels under the minimum come folded into one row (the privacy
    // review): named "Other links" here, and kept last.
    const all = read.refs.filter((r) => r.visits > 0 || r.paid > 0);
    const other = all.find((r) => r.ref === OTHER_LINKS_REF);
    const named = all
        .filter((r) => r.ref !== OTHER_LINKS_REF)
        .map(({ ref, visits, paid }) => ({ ref, visits, paid }));
    const refs = other
        ? [
              ...named.slice(0, REFS_SHOWN - 1),
              {
                  ref: OTHER_LINKS_LABEL,
                  visits:
                      other.visits +
                      named
                          .slice(REFS_SHOWN - 1)
                          .reduce((n, r) => n + r.visits, 0),
                  paid:
                      other.paid +
                      named
                          .slice(REFS_SHOWN - 1)
                          .reduce((n, r) => n + r.paid, 0),
              },
          ]
        : named;
    return {
        period: at.period,
        window: { days: at.days, from: at.from, to: at.to },
        siteId: at.siteId,
        countedFrom,
        countedPart: countedFrom !== null && countedFrom > at.from,
        path: visitPath(read.sources),
        sources,
        folded,
        refs: refs.slice(0, REFS_SHOWN),
        moreRefs: other ? 0 : Math.max(0, refs.length - REFS_SHOWN),
    };
}
