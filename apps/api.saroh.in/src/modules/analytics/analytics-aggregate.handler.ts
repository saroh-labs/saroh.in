import { Injectable, Logger } from "@nestjs/common";
import type { AnalyticsEvent, Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { SITE_VIEW_TYPE } from "./event-contract";

/** The job `type` this handler is registered under. */
export const ANALYTICS_AGGREGATE_TYPE = "analytics.aggregate";

/**
 * Payload for the daily aggregate job: recompute one ORG's rollups for one UTC
 * day. Only these two fields are load-bearing — the handler re-reads the events
 * itself, so it never trusts stale counts.
 */
export interface AnalyticsAggregatePayload {
    organizationId: string;
    /** The UTC day to (re)aggregate — an ISO date/datetime; only the day is used. */
    date: string;
}

/** The sentinel meaning "all sites / org-wide total" (matches the schema). */
const ALL_SITES = "";
/** The sentinel meaning "no dimension — the grand total for the type". */
const TOTAL_DIM = "";

/** One accumulator bucket keyed by the aggregate's full unique tuple. */
interface Bucket {
    siteId: string;
    type: string;
    dimension: string;
    dimensionValue: string;
    count: number;
    /** Distinct non-null visitor hashes seen — its size is `uniqueCount`. */
    visitors: Set<string>;
}

/** The org-wide total of site views: the row visits a month are counted from. */
function isVisitsTotal(bucket: Bucket): boolean {
    return (
        bucket.type === SITE_VIEW_TYPE &&
        bucket.siteId === ALL_SITES &&
        bucket.dimension === TOTAL_DIM
    );
}

/**
 * Org-safe daily aggregate job (S7-002).
 *
 * Reads ONE org's `AnalyticsEvent`s for a UTC day, groups them by `(type,
 * siteId)` (plus a `path` dimension for `site.view`), and UPSERTS the matching
 * `AnalyticsDailyAggregate` rows.
 *
 * ORG ISOLATION: every read is filtered by `payload.organizationId` and every
 * upsert is keyed + stamped with that same id, so two orgs' events can never mix
 * into one aggregate row — an org only ever aggregates its own events into its
 * own rows.
 *
 * IDEMPOTENT: the upsert sets ABSOLUTE `count`/`uniqueCount` (never increments),
 * so re-running the same `(org, date)` yields byte-identical aggregates — safe
 * under the at-least-once job worker.
 */
@Injectable()
export class AnalyticsAggregateHandler {
    private readonly logger = new Logger(AnalyticsAggregateHandler.name);

    /** Bound {@link JobHandler} to register with the {@link JobHandlerRegistry}. */
    readonly handle = async (job: Job): Promise<void> => {
        const { organizationId, date } =
            job.payload as unknown as AnalyticsAggregatePayload;

        const dayStart = this.startOfUtcDay(new Date(date));
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        // ORG-ISOLATED read: only THIS org's events, only for THIS day.
        const events = await prisma.analyticsEvent.findMany({
            where: {
                organizationId,
                occurredAt: { gte: dayStart, lt: dayEnd },
            },
        });

        const buckets = this.accumulate(events);

        // Recompute is idempotent: set absolute values via upsert.
        for (const bucket of buckets.values()) {
            if (isVisitsTotal(bucket)) {
                await this.writeVisitsTotal(organizationId, dayStart, bucket);
                continue;
            }
            await this.upsert(prisma, organizationId, dayStart, bucket);
        }

        this.logger.log(
            `analytics.aggregate: org ${organizationId} ${dayStart.toISOString().slice(0, 10)} → ${events.length} events, ${buckets.size} aggregates.`,
        );
    };

    /**
     * The day's org-wide site views, the row the plan's visits a month
     * (`visitsPerMonth`) count. Soft: the business is told when the month
     * passes its visits, and nothing is ever refused — here, on the job,
     * never on the visitor's request. What the recount adds over the row as
     * it stood is what's metered; a failed meter never costs the rollup.
     */
    private async writeVisitsTotal(
        organizationId: string,
        dayStart: Date,
        bucket: Bucket,
    ): Promise<void> {
        const key = this.uniqueKey(organizationId, dayStart, bucket);
        try {
            const before = await prisma.analyticsDailyAggregate.findUnique({
                where: key,
                select: { count: true },
            });
            await planMeter.withRoom(
                organizationId,
                "visits",
                (db) => this.upsert(db, organizationId, dayStart, bucket),
                {
                    soft: true,
                    adding: Math.max(0, bucket.count - (before?.count ?? 0)),
                },
            );
        } catch (err) {
            this.logger.warn(
                `analytics.aggregate: visits meter failed org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            await this.upsert(prisma, organizationId, dayStart, bucket);
        }
    }

    /** The aggregate row's unique key for one bucket. */
    private uniqueKey(organizationId: string, dayStart: Date, bucket: Bucket) {
        return {
            organizationId_siteId_date_type_dimension_dimensionValue: {
                organizationId,
                siteId: bucket.siteId,
                date: dayStart,
                type: bucket.type,
                dimension: bucket.dimension,
                dimensionValue: bucket.dimensionValue,
            },
        };
    }

    /** Set one aggregate row's absolute counts. */
    private async upsert(
        db: Pick<Prisma.TransactionClient, "analyticsDailyAggregate">,
        organizationId: string,
        dayStart: Date,
        bucket: Bucket,
    ): Promise<void> {
        await db.analyticsDailyAggregate.upsert({
            where: this.uniqueKey(organizationId, dayStart, bucket),
            create: {
                organizationId,
                siteId: bucket.siteId,
                date: dayStart,
                type: bucket.type,
                dimension: bucket.dimension,
                dimensionValue: bucket.dimensionValue,
                count: bucket.count,
                uniqueCount: bucket.visitors.size,
            },
            update: {
                count: bucket.count,
                uniqueCount: bucket.visitors.size,
            },
        });
    }

    /**
     * Fold the day's events into aggregate buckets:
     *  - an org-wide (siteId="") total per `type`,
     *  - a per-site total per `(type, siteId)` for events that name a site,
     *  - and, for `site.view`, the same two rollups broken down by `path`.
     *
     * A null/empty `siteId` only ever contributes to the org-wide (siteId="")
     * bucket, so it can never be double-counted against a per-site row.
     */
    private accumulate(events: AnalyticsEvent[]): Map<string, Bucket> {
        const buckets = new Map<string, Bucket>();

        const bump = (
            siteId: string,
            type: string,
            dimension: string,
            dimensionValue: string,
            visitorHash: string | null,
        ): void => {
            const bucketKey = [siteId, type, dimension, dimensionValue].join(
                "\u0000",
            );
            let bucket = buckets.get(bucketKey);
            if (!bucket) {
                bucket = {
                    siteId,
                    type,
                    dimension,
                    dimensionValue,
                    count: 0,
                    visitors: new Set<string>(),
                };
                buckets.set(bucketKey, bucket);
            }
            bucket.count += 1;
            if (visitorHash !== null) {
                bucket.visitors.add(visitorHash);
            }
        };

        for (const event of events) {
            const type = event.type;
            const visitorHash = event.visitorHash;
            // A local so the `!== null && !== ""` checks narrow it to `string`.
            const site = event.siteId;

            // Org-wide total (siteId="") for every event of this type.
            bump(ALL_SITES, type, TOTAL_DIM, TOTAL_DIM, visitorHash);
            // Per-site total, only for events that name a real site.
            if (site !== null && site !== "") {
                bump(site, type, TOTAL_DIM, TOTAL_DIM, visitorHash);
            }

            // `site.view` also gets a `path` breakdown.
            if (type === SITE_VIEW_TYPE) {
                const path = this.readPath(event.properties);
                if (path !== null) {
                    bump(ALL_SITES, type, "path", path, visitorHash);
                    if (site !== null && site !== "") {
                        bump(site, type, "path", path, visitorHash);
                    }
                }
            }
        }

        return buckets;
    }

    /** Extract the `path` string from an event's validated properties, or null. */
    private readPath(properties: unknown): string | null {
        if (
            typeof properties === "object" &&
            properties !== null &&
            !Array.isArray(properties)
        ) {
            const value = (properties as Record<string, unknown>).path;
            if (typeof value === "string" && value !== "") {
                return value;
            }
        }
        return null;
    }

    /** Truncate a timestamp to the start of its UTC day. */
    private startOfUtcDay(when: Date): Date {
        return new Date(
            Date.UTC(
                when.getUTCFullYear(),
                when.getUTCMonth(),
                when.getUTCDate(),
            ),
        );
    }
}
