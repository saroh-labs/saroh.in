import type { Prisma } from "@saroh/database";

import {
    ORDER_PAID_TYPE,
    ORDER_REFUNDED_TYPE,
    SITE_LOOKED_TYPE,
    SITE_STARTED_TYPE,
    SITE_VISIT_TYPE,
} from "./event-contract";
import type { VisitSource } from "./visit-source";
import { isVisitSource, VISIT_SOURCES, visitRefOf } from "./visit-source";

/**
 * The read U16 builds "Where do visitors come from?" and "From visit to
 * paid" on (U15, #1099): for one business and a range of days, how many
 * visits each source brought, how many of them looked at something, started
 * a checkout and paid, by source group and by the merchant's own link label.
 *
 * Read from the daily rollups (`analytics.aggregate`'s `source` and `ref`
 * dimensions), never from the events, so it outlives the events' retention
 * as every other Insights figure does.
 *
 * - **Counted from** is the first day any visit's source was recorded for
 *   the business: tracking began the day U15 shipped, and nothing before it
 *   is made up (DEC-012). Null when no visit has been counted yet, so the
 *   screen can say "counted from …" or "not counted yet".
 * - **Paid** is `order.paid` less `order.refunded` for the same source,
 *   net as the orders figure is. A paid order names no site, so `paid` is
 *   the whole business's even when `siteId` narrows the visits.
 * - Each step is sent at most once per visit by the site, so the steps are
 *   visits that reached them. They can still disagree a little (a paid
 *   order from a visit started the day before; one checkout whose visit was
 *   on a reloaded page); the screen keeps them from going up.
 */

/** One step's counts. */
export interface VisitSteps {
    visits: number;
    looked: number;
    started: number;
    paid: number;
}

export interface VisitSourceRow extends VisitSteps {
    source: VisitSource;
}

export interface VisitRefRow extends VisitSteps {
    ref: string;
}

export interface VisitSourcesRead {
    /** The first day (UTC) a visit's source was counted; null when none yet. */
    countedFrom: Date | null;
    /** All five groups, in a fixed order, zeros included. */
    sources: VisitSourceRow[];
    /**
     * The merchant's own link labels seen in the range, most visits first.
     * Labels with fewer than {@link MIN_VISITS_PER_LABEL} visits in the
     * range are folded into one last row whose `ref` is
     * {@link OTHER_LINKS_REF} (the screen reads it as "Other links").
     */
    refs: VisitRefRow[];
}

/**
 * A label shown on its own needs this many visits in the range (U15
 * privacy review): a label one or two people came by could be a link sent
 * to one person (`?ref=asha-wedding`), so it is shown only inside
 * {@link OTHER_LINKS_REF}.
 */
export const MIN_VISITS_PER_LABEL = 3;

/**
 * The `ref` of the one row the small labels are folded into. Not a label's
 * shape (`visitRefOf` allows no `_`), so no merchant's label can be it.
 */
export const OTHER_LINKS_REF = "_other";

/** What the screen calls that row. */
export const OTHER_LINKS_LABEL = "Other links";

/** Which step an event type is. */
const STEP_OF: Partial<Record<string, keyof VisitSteps | "refunded">> = {
    [SITE_VISIT_TYPE]: "visits",
    [SITE_LOOKED_TYPE]: "looked",
    [SITE_STARTED_TYPE]: "started",
    [ORDER_PAID_TYPE]: "paid",
    [ORDER_REFUNDED_TYPE]: "refunded",
};

const STEP_TYPES = Object.keys(STEP_OF);

/** The org-wide sentinel the rollups use for "every site". */
const ALL_SITES = "";

/** The rows this read folds: one per day, type, dimension and value. */
export interface VisitSourceAggregate {
    siteId: string;
    type: string;
    dimension: string;
    dimensionValue: string;
    count: number;
}

const zero = (): VisitSteps & { refunded: number } => ({
    visits: 0,
    looked: 0,
    started: 0,
    paid: 0,
    refunded: 0,
});

/**
 * Fold rollup rows into the read. Pure, so the rules are unit tested apart
 * from the database. `siteId` narrows the three visit steps; paid stays the
 * whole business's (it names no site).
 */
export function foldVisitSources(
    rows: readonly VisitSourceAggregate[],
    siteId?: string,
): Omit<VisitSourcesRead, "countedFrom"> {
    const visitSite = siteId ?? ALL_SITES;
    const bySource = new Map<VisitSource, ReturnType<typeof zero>>(
        VISIT_SOURCES.map((s) => [s, zero()]),
    );
    const byRef = new Map<string, ReturnType<typeof zero>>();

    for (const row of rows) {
        const step = STEP_OF[row.type];
        if (!step) continue;
        const isMoney = step === "paid" || step === "refunded";
        const wantSite = isMoney ? ALL_SITES : visitSite;
        if (row.siteId !== wantSite) continue;
        if (row.dimension === "source" && isVisitSource(row.dimensionValue)) {
            const counts = bySource.get(row.dimensionValue);
            if (counts) counts[step] += row.count;
        } else if (row.dimension === "ref") {
            const ref = visitRefOf(row.dimensionValue);
            if (ref === null) continue;
            const counts = byRef.get(ref) ?? zero();
            counts[step] += row.count;
            byRef.set(ref, counts);
        }
    }

    const net = ({ refunded, ...steps }: ReturnType<typeof zero>) => ({
        ...steps,
        paid: Math.max(0, steps.paid - refunded),
    });

    const seen = [...byRef.entries()]
        .map(([ref, counts]) => ({ ref, ...net(counts) }))
        .filter((r) => r.visits + r.looked + r.started + r.paid > 0);
    const shown = seen
        .filter((r) => r.visits >= MIN_VISITS_PER_LABEL)
        .sort((a, b) => b.visits - a.visits || a.ref.localeCompare(b.ref));
    const small = seen.filter((r) => r.visits < MIN_VISITS_PER_LABEL);
    const refs: VisitRefRow[] = [...shown];
    if (small.length > 0) {
        refs.push(
            small.reduce<VisitRefRow>(
                (sum, r) => ({
                    ref: OTHER_LINKS_REF,
                    visits: sum.visits + r.visits,
                    looked: sum.looked + r.looked,
                    started: sum.started + r.started,
                    paid: sum.paid + r.paid,
                }),
                {
                    ref: OTHER_LINKS_REF,
                    visits: 0,
                    looked: 0,
                    started: 0,
                    paid: 0,
                },
            ),
        );
    }

    return {
        sources: VISIT_SOURCES.map((source) => ({
            source,
            ...net(bySource.get(source) ?? zero()),
        })),
        refs,
    };
}

/**
 * The read itself, for one business. `from` and `to` are UTC days,
 * inclusive, as the other Insights reads take them. Run it in the
 * business's context (`runInOrgContext`) on a request; every query names
 * the business as well.
 */
export async function readVisitSources(
    db: Pick<Prisma.TransactionClient, "analyticsDailyAggregate">,
    organizationId: string,
    range: { from: Date; to: Date; siteId?: string },
): Promise<VisitSourcesRead> {
    const [rows, first] = await Promise.all([
        db.analyticsDailyAggregate.findMany({
            where: {
                organizationId,
                type: { in: STEP_TYPES },
                dimension: { in: ["source", "ref"] },
                date: { gte: range.from, lte: range.to },
            },
            select: {
                siteId: true,
                type: true,
                dimension: true,
                dimensionValue: true,
                count: true,
            },
        }),
        db.analyticsDailyAggregate.aggregate({
            where: {
                organizationId,
                siteId: ALL_SITES,
                type: SITE_VISIT_TYPE,
                dimension: "",
                dimensionValue: "",
            },
            _min: { date: true },
        }),
    ]);
    return {
        countedFrom: first._min.date ?? null,
        ...foldVisitSources(rows, range.siteId),
    };
}
