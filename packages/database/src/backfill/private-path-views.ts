/**
 * One-off: delete page views stored under a private page (U15 privacy
 * review, #1099).
 *
 * Before the review, only the site's beacon kept private pages out of the
 * analytics ledger; the API stored whatever path it was sent. Since it, the
 * `site.view` contract refuses a view under any of
 * `PRIVATE_PATH_PREFIXES` (`@saroh/block-contract`, one list with the
 * site) and the daily rollup reads such a path as no path. This removes
 * what was stored before:
 *
 * - `AnalyticsEvent` rows of type `site.view` whose `path` is a private
 *   page or under one (also with a query or fragment after it);
 * - `AnalyticsDailyAggregate` rows of the `site.view` `path` dimension for
 *   such a path. The day's totals stay: the view still happened, only which
 *   private page it was goes.
 *
 * A business on legal hold (DEC-122) keeps its rows; they are counted
 * apart. Dry run by default: it counts and writes nothing; `apply` deletes
 * in batches. Idempotent: a second run finds nothing.
 *
 * Run: see `private-path-views.cli.ts`.
 */
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { PRIVATE_PATH_PREFIXES } from "@saroh/block-contract";

/** Rows deleted per statement. */
export const PRIVATE_PATH_PURGE_BATCH = 5000;

export interface PrivatePathPurgeReport {
    /** Private-path views found (outside legal hold). */
    events: number;
    /** Private-path rollup rows found (outside legal hold). */
    aggregates: number;
    /** Views and rollup rows kept because their business is on legal hold. */
    heldEvents: number;
    heldAggregates: number;
    /** What this run deleted: 0 on a dry run. */
    deletedEvents: number;
    deletedAggregates: number;
}

/**
 * A SQL condition true when `column` is one of the private pages or under
 * one, with or without a query or fragment after it. The prefixes are
 * fixed strings with no LIKE wildcard in them (checked by the test).
 */
export function privatePathCondition(column: Prisma.Sql): Prisma.Sql {
    const each = PRIVATE_PATH_PREFIXES.map(
        (prefix) => Prisma.sql`(${column} = ${prefix}
            OR ${column} LIKE ${`${prefix}/%`}
            OR ${column} LIKE ${`${prefix}?%`}
            OR ${column} LIKE ${`${prefix}#%`})`,
    );
    return Prisma.sql`(${Prisma.join(each, " OR ")})`;
}

const EVENT_PATH = Prisma.sql`("properties"->>'path')`;
const AGGREGATE_PATH = Prisma.sql`"dimensionValue"`;

const HELD = Prisma.sql`(SELECT "id" FROM "Organization" WHERE "legalHoldAt" IS NOT NULL)`;

function eventsWhere(held: boolean): Prisma.Sql {
    return Prisma.sql`"type" = 'site.view'
        AND ${privatePathCondition(EVENT_PATH)}
        AND "organizationId" ${held ? Prisma.sql`IN` : Prisma.sql`NOT IN`} ${HELD}`;
}

function aggregatesWhere(held: boolean): Prisma.Sql {
    return Prisma.sql`"type" = 'site.view' AND "dimension" = 'path'
        AND ${privatePathCondition(AGGREGATE_PATH)}
        AND "organizationId" ${held ? Prisma.sql`IN` : Prisma.sql`NOT IN`} ${HELD}`;
}

async function count(
    prisma: PrismaClient,
    table: "AnalyticsEvent" | "AnalyticsDailyAggregate",
    where: Prisma.Sql,
): Promise<number> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM ${Prisma.raw(`"${table}"`)} WHERE ${where}`;
    return Number(rows[0]?.n ?? 0);
}

async function deleteInBatches(
    prisma: PrismaClient,
    table: "AnalyticsEvent" | "AnalyticsDailyAggregate",
    where: Prisma.Sql,
): Promise<number> {
    let deleted = 0;
    for (;;) {
        const n = await prisma.$executeRaw`
            DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "id" IN (
                SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE ${where}
                LIMIT ${PRIVATE_PATH_PURGE_BATCH})`;
        deleted += n;
        if (n < PRIVATE_PATH_PURGE_BATCH) return deleted;
    }
}

export async function purgePrivatePathViews(
    prisma: PrismaClient,
    { apply }: { apply: boolean },
): Promise<PrivatePathPurgeReport> {
    const report: PrivatePathPurgeReport = {
        events: await count(prisma, "AnalyticsEvent", eventsWhere(false)),
        aggregates: await count(
            prisma,
            "AnalyticsDailyAggregate",
            aggregatesWhere(false),
        ),
        heldEvents: await count(prisma, "AnalyticsEvent", eventsWhere(true)),
        heldAggregates: await count(
            prisma,
            "AnalyticsDailyAggregate",
            aggregatesWhere(true),
        ),
        deletedEvents: 0,
        deletedAggregates: 0,
    };
    if (!apply) return report;
    report.deletedEvents = await deleteInBatches(
        prisma,
        "AnalyticsEvent",
        eventsWhere(false),
    );
    report.deletedAggregates = await deleteInBatches(
        prisma,
        "AnalyticsDailyAggregate",
        aggregatesWhere(false),
    );
    return report;
}

/** The report as the lines the CLI prints: counts only. */
export function describePrivatePathPurge(
    report: PrivatePathPurgeReport,
    apply: boolean,
): string[] {
    return [
        `private-path page views: ${report.events}${apply ? `, deleted ${report.deletedEvents}` : " (dry run, nothing deleted)"}`,
        `private-path rollup rows: ${report.aggregates}${apply ? `, deleted ${report.deletedAggregates}` : " (dry run, nothing deleted)"}`,
        `kept for a business on legal hold: ${report.heldEvents} views, ${report.heldAggregates} rollup rows`,
    ];
}
