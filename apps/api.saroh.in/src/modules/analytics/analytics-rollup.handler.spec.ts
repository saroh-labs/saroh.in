// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        $queryRaw: jest.fn(),
        job: { create: jest.fn(), count: jest.fn() },
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { ANALYTICS_AGGREGATE_TYPE } from "./analytics-aggregate.handler";
import {
    ANALYTICS_ROLLUP_BACKFILL_DAYS,
    ANALYTICS_ROLLUP_EVERY_MS,
    ANALYTICS_ROLLUP_OVERLAP_MS,
    ANALYTICS_ROLLUP_TYPE,
    AnalyticsRollupHandler,
} from "./analytics-rollup.handler";

/**
 * Insights' hourly rollup chain (DEC-075): it queues one
 * `analytics.aggregate` per business and day that received events, then
 * its own next run — and keeps going past a day it cannot queue, hands a
 * failed sweep's window on, and throws only when it cannot reschedule.
 */
const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;

const NOW = new Date("2026-10-04T10:00:00.000Z");
const SINCE = "2026-10-04T08:55:00.000Z";

function run(payload: unknown): Job {
    return { id: "job_1", payload } as unknown as Job;
}

function created(type: string) {
    return jobCreate.mock.calls
        .map(([arg]) => (arg as { data: Record<string, unknown> }).data)
        .filter((data) => data.type === type);
}

describe("AnalyticsRollupHandler", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        jest.useFakeTimers({ now: NOW });
        jobCreate.mockResolvedValue({});
    });

    afterEach(() => jest.useRealTimers());

    it("queues each business's day once, then its next run an hour on", async () => {
        queryRaw.mockResolvedValue([
            { organizationId: "org_1", day: "2026-10-03" },
            { organizationId: "org_1", day: "2026-10-04" },
            { organizationId: "org_2", day: "2026-10-04" },
        ]);

        await new AnalyticsRollupHandler().handle(run({ since: SINCE }));

        expect(created(ANALYTICS_AGGREGATE_TYPE)).toEqual([
            {
                type: ANALYTICS_AGGREGATE_TYPE,
                organizationId: "org_1",
                payload: { organizationId: "org_1", date: "2026-10-03" },
            },
            {
                type: ANALYTICS_AGGREGATE_TYPE,
                organizationId: "org_1",
                payload: { organizationId: "org_1", date: "2026-10-04" },
            },
            {
                type: ANALYTICS_AGGREGATE_TYPE,
                organizationId: "org_2",
                payload: { organizationId: "org_2", date: "2026-10-04" },
            },
        ]);
        const [next] = created(ANALYTICS_ROLLUP_TYPE);
        expect(next.runAt).toEqual(
            new Date(NOW.getTime() + ANALYTICS_ROLLUP_EVERY_MS),
        );
        // The next run looks back a little past where this one stopped.
        expect(next.payload).toEqual({
            since: new Date(
                NOW.getTime() - ANALYTICS_ROLLUP_OVERLAP_MS,
            ).toISOString(),
        });
    });

    it("asks for events received since the run's own `since`, up to now", async () => {
        queryRaw.mockResolvedValue([]);
        await new AnalyticsRollupHandler().handle(run({ since: SINCE }));
        const sql = queryRaw.mock.calls[0] as unknown[];
        expect(sql.slice(1).map(String)).toEqual([
            expect.stringContaining("2026-10-04T08:55:00.000"),
            expect.stringContaining("2026-10-04T10:00:00.000"),
        ]);
    });

    it("starts a run with no readable `since` from the backfill", async () => {
        queryRaw.mockResolvedValue([]);
        const handler = new AnalyticsRollupHandler();
        const sweep = jest.spyOn(handler, "sweep");
        await handler.handle(run({}));
        expect(sweep).toHaveBeenCalledWith(
            new Date(
                NOW.getTime() - ANALYTICS_ROLLUP_BACKFILL_DAYS * 86_400_000,
            ),
            NOW,
        );
    });

    it("queues the rest when one day cannot be queued", async () => {
        queryRaw.mockResolvedValue([
            { organizationId: "gone", day: "2026-10-04" },
            { organizationId: "org_2", day: "2026-10-04" },
        ]);
        jobCreate.mockRejectedValueOnce(new Error("foreign key"));
        await new AnalyticsRollupHandler().handle(run({ since: SINCE }));
        expect(
            created(ANALYTICS_AGGREGATE_TYPE).map((d) => d.organizationId),
        ).toEqual(["gone", "org_2"]);
        expect(created(ANALYTICS_ROLLUP_TYPE)).toHaveLength(1);
    });

    it("hands a failed sweep's window to the next run, so nothing is skipped", async () => {
        queryRaw.mockRejectedValue(new Error("connection reset"));
        await new AnalyticsRollupHandler().handle(run({ since: SINCE }));
        expect(created(ANALYTICS_ROLLUP_TYPE)[0].payload).toEqual({
            since: SINCE,
        });
    });

    it("treats a run already waiting as scheduled", async () => {
        queryRaw.mockResolvedValue([]);
        jobCreate.mockRejectedValue(
            Object.assign(new Error("dup"), { code: "P2002" }),
        );
        await expect(
            new AnalyticsRollupHandler().handle(run({ since: SINCE })),
        ).resolves.toBeUndefined();
    });

    it("throws when the next run cannot be enqueued, so the worker retries", async () => {
        queryRaw.mockResolvedValue([]);
        jobCreate.mockRejectedValue(new Error("database down"));
        await expect(
            new AnalyticsRollupHandler().handle(run({ since: SINCE })),
        ).rejects.toThrow("Could not schedule the next analytics rollup");
    });

    it("restarts a stopped chain from the backfill, and leaves a live one alone", async () => {
        const handler = new AnalyticsRollupHandler();
        jobCount.mockResolvedValueOnce(1);
        await handler.ensureScheduled(NOW);
        expect(jobCreate).not.toHaveBeenCalled();

        jobCount.mockResolvedValueOnce(0);
        await handler.ensureScheduled(NOW);
        expect(created(ANALYTICS_ROLLUP_TYPE)).toEqual([
            {
                type: ANALYTICS_ROLLUP_TYPE,
                payload: { since: handler.backfillFrom(NOW).toISOString() },
                runAt: NOW,
            },
        ]);
    });
});
