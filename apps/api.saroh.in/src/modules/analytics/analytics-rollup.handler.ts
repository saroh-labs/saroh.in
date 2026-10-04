import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { ANALYTICS_AGGREGATE_TYPE } from "./analytics-aggregate.handler";

/**
 * The self-rescheduling job that keeps Insights' daily rollups current
 * (DEC-075). `analytics.aggregate` rebuilds one business's day; until this
 * existed nothing queued it, so a real business's Insights read no rows
 * and said no views were recorded (`backend-jobs.md`, the known gap).
 */
export const ANALYTICS_ROLLUP_TYPE = "analytics.rollup";

/** Hourly: a view recorded now is on the page within the hour. */
export const ANALYTICS_ROLLUP_EVERY_MS = 60 * 60 * 1000;

/**
 * How far back a chain that starts afresh looks: the longest range the
 * Insights page reads (90 days). Re-running a day is safe, so a restart
 * rebuilds rather than guesses what an earlier chain finished.
 */
export const ANALYTICS_ROLLUP_BACKFILL_DAYS = 90;

/**
 * Each run looks this far before where the last one stopped: an event
 * stamped `receivedAt` just before a run whose insert committed just after
 * it would otherwise be missed for good.
 */
export const ANALYTICS_ROLLUP_OVERLAP_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Date as the `timestamp without time zone` Prisma stores, the UTC
 * wall-clock: bound as a Date it would be read through the session's zone
 * (DEV_LEARNINGS, "scheduled jobs run at once").
 */
function utc(at: Date): string {
    return at.toISOString().replace("Z", "");
}

/** The payload: events received from `since` on are still to roll up. */
export interface AnalyticsRollupPayload {
    since?: string;
}

/**
 * Every hour, find the businesses and days that received events since the
 * last run and queue one `analytics.aggregate` for each — two jobs, since
 * one finds the work and the other does it (`backend-jobs.md`), and an
 * aggregate that fails retries alone.
 *
 * It reschedules itself like the waitlist retention sweep (ADR-007): one
 * PENDING run at a time (`Job_one_pending_analytics_rollup`), a failing
 * day is logged and passed, and it throws only when the next run cannot be
 * enqueued, so the worker retries it. A run whose sweep failed hands its
 * own window to the next, so nothing received in it is skipped.
 */
@Injectable()
export class AnalyticsRollupHandler {
    private readonly logger = new Logger(AnalyticsRollupHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const now = new Date();
        const since = this.sinceOf(job.payload, now);
        let next = new Date(now.getTime() - ANALYTICS_ROLLUP_OVERLAP_MS);
        try {
            const queued = await this.sweep(since, now);
            if (queued > 0) {
                this.logger.log(
                    `analytics.rollup: queued ${queued} day rollups since ${since.toISOString()}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `analytics.rollup: sweep failed before it finished: ${String(error)}`,
            );
            next = since;
        }
        const runAt = new Date(now.getTime() + ANALYTICS_ROLLUP_EVERY_MS);
        if (!(await this.schedule(runAt, next))) {
            throw new Error(
                "Could not schedule the next analytics rollup; retrying this one",
            );
        }
    };

    /**
     * Queue an `analytics.aggregate` for each business and UTC day with an
     * event received in `[since, until)`. Returns how many were queued.
     */
    async sweep(since: Date, until: Date): Promise<number> {
        const days = await prisma.$queryRaw<
            { organizationId: string; day: string }[]
        >`
            SELECT DISTINCT "organizationId",
                to_char("occurredAt", 'YYYY-MM-DD') AS day
            FROM "AnalyticsEvent"
            WHERE "receivedAt" >= ${utc(since)}::timestamp
              AND "receivedAt" < ${utc(until)}::timestamp
            ORDER BY 1, 2`;
        let queued = 0;
        for (const { organizationId, day } of days) {
            try {
                await prisma.job.create({
                    data: {
                        type: ANALYTICS_AGGREGATE_TYPE,
                        organizationId,
                        payload: { organizationId, date: day },
                    },
                });
                queued += 1;
            } catch (error) {
                // A business deleted since, say: the rest still roll up.
                this.logger.error(
                    `analytics.rollup: could not queue ${organizationId} ${day}: ${String(error)}`,
                );
            }
        }
        return queued;
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date, since: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: {
                    type: ANALYTICS_ROLLUP_TYPE,
                    payload: { since: since.toISOString() },
                    runAt,
                },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next analytics rollup: ${String(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again, looking back the backfill, when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: ANALYTICS_ROLLUP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now, this.backfillFrom(now));
        } catch (error) {
            this.logger.error(
                `Could not check the analytics rollup chain: ${String(error)}`,
            );
        }
    }

    /** Where a fresh chain starts looking. */
    backfillFrom(now: Date): Date {
        return new Date(
            now.getTime() - ANALYTICS_ROLLUP_BACKFILL_DAYS * DAY_MS,
        );
    }

    /** The run's `since`, or the backfill when it carries none it can read. */
    private sinceOf(payload: unknown, now: Date): Date {
        const raw =
            payload && typeof payload === "object"
                ? (payload as AnalyticsRollupPayload).since
                : undefined;
        const since = typeof raw === "string" ? new Date(raw) : null;
        return since && !Number.isNaN(since.getTime()) && since <= now
            ? since
            : this.backfillFrom(now);
    }
}
