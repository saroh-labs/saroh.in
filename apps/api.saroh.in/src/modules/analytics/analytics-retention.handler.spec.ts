// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        analyticsEvent: { findMany: jest.fn(), deleteMany: jest.fn() },
        analyticsDailyAggregate: { deleteMany: jest.fn() },
        // Businesses on legal hold (DEC-122): none unless a test says so.
        organization: { findMany: jest.fn() },
        job: { create: jest.fn(), count: jest.fn() },
    },
}));

import { Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    ANALYTICS_RETENTION_BACKLOG_MS,
    ANALYTICS_RETENTION_BATCH,
    ANALYTICS_RETENTION_EVERY_MS,
    ANALYTICS_RETENTION_MAX_BATCHES,
    ANALYTICS_RETENTION_TYPE,
    AnalyticsRetentionHandler,
} from "./analytics-retention.handler";

/**
 * The daily analytics retention sweep (#799): it deletes events whose
 * `expiresAt` has passed, in batches, never an aggregate, logs counts only,
 * and reschedules itself — sooner when it stopped at its cap.
 */
const findMany = prisma.analyticsEvent.findMany as jest.Mock;
const deleteMany = prisma.analyticsEvent.deleteMany as jest.Mock;
const aggregateDelete = prisma.analyticsDailyAggregate.deleteMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;
const held = prisma.organization.findMany as jest.Mock;

const NOW = new Date("2026-10-09T03:00:00.000Z");

function run(): Job {
    return { id: "job_1", payload: {} } as unknown as Job;
}

function ids(n: number, from = 0) {
    return Array.from({ length: n }, (_, i) => ({ id: `ev_${from + i}` }));
}

function nextRun(): Date | undefined {
    const call = jobCreate.mock.calls.find(
        ([arg]) =>
            (arg as { data: { type: string } }).data.type ===
            ANALYTICS_RETENTION_TYPE,
    );
    return (call?.[0] as { data: { runAt: Date } } | undefined)?.data.runAt;
}

describe("AnalyticsRetentionHandler", () => {
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        jest.resetAllMocks();
        jest.useFakeTimers({ now: NOW, advanceTimers: true });
        jobCreate.mockResolvedValue({});
        held.mockResolvedValue([]);
        log = jest.spyOn(Logger.prototype, "log").mockImplementation();
        error = jest.spyOn(Logger.prototype, "error").mockImplementation();
    });

    afterEach(() => {
        jest.useRealTimers();
        log.mockRestore();
        error.mockRestore();
    });

    it("deletes only events whose expiresAt has passed, in batches, and never an aggregate", async () => {
        findMany
            .mockResolvedValueOnce(ids(ANALYTICS_RETENTION_BATCH))
            .mockResolvedValueOnce(ids(3, ANALYTICS_RETENTION_BATCH));
        deleteMany
            .mockResolvedValueOnce({ count: ANALYTICS_RETENTION_BATCH })
            .mockResolvedValueOnce({ count: 3 });

        await new AnalyticsRetentionHandler().handle(run());

        expect(findMany).toHaveBeenCalledTimes(2);
        expect(findMany.mock.calls[0][0]).toEqual({
            where: { expiresAt: { lt: NOW } },
            select: { id: true },
            orderBy: { expiresAt: "asc" },
            take: ANALYTICS_RETENTION_BATCH,
        });
        // Each delete names the batch's ids and re-checks the stamp.
        const second = deleteMany.mock.calls[1][0] as {
            where: { id: { in: string[] }; expiresAt: unknown };
        };
        expect(second.where.id.in).toEqual([
            `ev_${ANALYTICS_RETENTION_BATCH}`,
            `ev_${ANALYTICS_RETENTION_BATCH + 1}`,
            `ev_${ANALYTICS_RETENTION_BATCH + 2}`,
        ]);
        expect(second.where.expiresAt).toEqual({ lt: NOW });
        expect(aggregateDelete).not.toHaveBeenCalled();

        // Counts only, nothing about a business or a visitor.
        expect(log).toHaveBeenCalledWith(
            `analytics.retention: deleted ${ANALYTICS_RETENTION_BATCH + 3} events past retention`,
        );
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + ANALYTICS_RETENTION_EVERY_MS),
        );
    });

    it("leaves the events of a business on legal hold, in the read and in the delete (DEC-122)", async () => {
        held.mockResolvedValue([{ id: "org_held" }, { id: "org_held_2" }]);
        findMany.mockResolvedValueOnce(ids(2));
        deleteMany.mockResolvedValueOnce({ count: 2 });

        await new AnalyticsRetentionHandler().handle(run());

        expect(held).toHaveBeenCalledWith({
            where: { legalHoldAt: { not: null } },
            select: { id: true },
        });
        const notHeld = { notIn: ["org_held", "org_held_2"] };
        expect(findMany.mock.calls[0][0]).toEqual({
            where: { expiresAt: { lt: NOW }, organizationId: notHeld },
            select: { id: true },
            orderBy: { expiresAt: "asc" },
            take: ANALYTICS_RETENTION_BATCH,
        });
        expect(deleteMany.mock.calls[0][0]).toEqual({
            where: {
                id: { in: ["ev_0", "ev_1"] },
                expiresAt: { lt: NOW },
                organizationId: notHeld,
            },
        });
        expect(error).not.toHaveBeenCalled();
    });

    it("says nothing when nothing is due, and comes back in a day", async () => {
        findMany.mockResolvedValueOnce([]);

        await new AnalyticsRetentionHandler().handle(run());

        expect(deleteMany).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + ANALYTICS_RETENTION_EVERY_MS),
        );
    });

    it("stops at its cap with more due and comes back in a minute", async () => {
        findMany.mockResolvedValue(ids(ANALYTICS_RETENTION_BATCH));
        deleteMany.mockResolvedValue({ count: ANALYTICS_RETENTION_BATCH });

        await new AnalyticsRetentionHandler().handle(run());

        expect(findMany).toHaveBeenCalledTimes(ANALYTICS_RETENTION_MAX_BATCHES);
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + ANALYTICS_RETENTION_BACKLOG_MS),
        );
    });

    it("stops when a batch deletes nothing, rather than fetching it for ever", async () => {
        findMany.mockResolvedValue(ids(ANALYTICS_RETENTION_BATCH));
        deleteMany.mockResolvedValue({ count: 0 });

        const swept = await new AnalyticsRetentionHandler().sweep(NOW);

        expect(swept).toEqual({ deleted: 0, more: false });
        expect(findMany).toHaveBeenCalledTimes(1);
    });

    it("keeps the chain going when the sweep fails", async () => {
        findMany.mockRejectedValue(new Error("connection reset"));

        await new AnalyticsRetentionHandler().handle(run());

        expect(error).toHaveBeenCalledWith(
            "analytics.retention: sweep failed before it finished: Error",
        );
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + ANALYTICS_RETENTION_EVERY_MS),
        );
    });

    it("treats a run already waiting as scheduled", async () => {
        findMany.mockResolvedValue([]);
        jobCreate.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );

        await expect(
            new AnalyticsRetentionHandler().handle(run()),
        ).resolves.toBeUndefined();
    });

    it("throws when the next run cannot be enqueued, so the worker retries", async () => {
        findMany.mockResolvedValue([]);
        jobCreate.mockRejectedValue(new Error("database down"));

        await expect(
            new AnalyticsRetentionHandler().handle(run()),
        ).rejects.toThrow("Could not schedule the next analytics retention");
    });

    it("ensureScheduled starts the chain only when nothing is waiting or running", async () => {
        const handler = new AnalyticsRetentionHandler();

        jobCount.mockResolvedValueOnce(1);
        await handler.ensureScheduled(NOW);
        expect(jobCreate).not.toHaveBeenCalled();

        jobCount.mockResolvedValueOnce(0);
        await handler.ensureScheduled(NOW);
        expect(jobCreate).toHaveBeenCalledWith({
            data: { type: ANALYTICS_RETENTION_TYPE, payload: {}, runAt: NOW },
        });
    });
});
