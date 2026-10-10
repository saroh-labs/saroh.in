import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";

/**
 * The self-rescheduling job that deletes detailed analytics rows past their
 * retention (#799, DEC-012). Intake stamps every `AnalyticsEvent` with
 * `expiresAt` = received + `ANALYTICS_RETENTION_DAYS` (400); this deletes
 * the rows whose stamp has passed. The daily rollups
 * (`AnalyticsDailyAggregate`) are never touched: Insights and the plan's
 * visits a month read those, and they outlive the events they came from.
 */
export const ANALYTICS_RETENTION_TYPE = "analytics.retention";

/** Once a day: the rule is counted in days. */
export const ANALYTICS_RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * When a run stops at its cap with rows still due, the next one comes this
 * soon rather than a day later, so a backlog drains in steady bites.
 */
export const ANALYTICS_RETENTION_BACKLOG_MS = 60 * 1000;

/** Rows deleted per statement. */
export const ANALYTICS_RETENTION_BATCH = 1000;

/**
 * Batches per run, so one run stays well inside the job lease
 * (`JOB_VISIBILITY_MS`, five minutes) however large the backlog.
 */
export const ANALYTICS_RETENTION_MAX_BATCHES = 50;

/** What one sweep did: rows deleted, and whether it stopped with more due. */
export interface RetentionSweep {
    deleted: number;
    more: boolean;
}

/**
 * Deletes `AnalyticsEvent` rows whose `expiresAt` has passed, in batches of
 * {@link ANALYTICS_RETENTION_BATCH} ids taken in `expiresAt` order (the
 * `AnalyticsEvent_expiresAt_idx` index). A row with no stamp has no expiry
 * configured and is kept. It logs counts only, never a business, event or
 * visitor.
 *
 * It reschedules itself like the waitlist retention sweep (ADR-007): one
 * PENDING run at a time (`Job_one_pending_analytics_retention`), a failed
 * sweep is logged and the chain goes on, and it throws only when the next
 * run cannot be enqueued, so the worker retries it.
 */
@Injectable()
export class AnalyticsRetentionHandler {
    private readonly logger = new Logger(AnalyticsRetentionHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        let more = false;
        try {
            const swept = await this.sweep(now);
            more = swept.more;
            if (swept.deleted > 0) {
                this.logger.log(
                    `analytics.retention: deleted ${swept.deleted} events past retention${more ? "; more due, next run soon" : ""}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `analytics.retention: sweep failed before it finished: ${error instanceof Error ? error.name : "unknown"}`,
            );
        }
        const wait = more
            ? ANALYTICS_RETENTION_BACKLOG_MS
            : ANALYTICS_RETENTION_EVERY_MS;
        if (!(await this.schedule(new Date(now.getTime() + wait)))) {
            throw new Error(
                "Could not schedule the next analytics retention sweep; retrying this one",
            );
        }
    };

    /** Delete events whose retention ended before `now`, up to the run's cap. */
    async sweep(now: Date): Promise<RetentionSweep> {
        let deleted = 0;
        for (let batch = 0; batch < ANALYTICS_RETENTION_MAX_BATCHES; batch++) {
            const due = await prisma.analyticsEvent.findMany({
                where: { expiresAt: { lt: now } },
                select: { id: true },
                orderBy: { expiresAt: "asc" },
                take: ANALYTICS_RETENTION_BATCH,
            });
            if (due.length === 0) return { deleted, more: false };
            const { count } = await prisma.analyticsEvent.deleteMany({
                where: {
                    id: { in: due.map((row) => row.id) },
                    expiresAt: { lt: now },
                },
            });
            deleted += count;
            // A short batch was the last of them; one that deleted nothing
            // (another run took them) would otherwise be fetched for ever.
            if (due.length < ANALYTICS_RETENTION_BATCH || count === 0) {
                return { deleted, more: false };
            }
        }
        return { deleted, more: true };
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: ANALYTICS_RETENTION_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next analytics retention sweep: ${error instanceof Error ? error.name : "unknown"}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: ANALYTICS_RETENTION_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the analytics retention chain: ${error instanceof Error ? error.name : "unknown"}`,
            );
        }
    }
}
