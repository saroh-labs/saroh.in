// DB-free unit tests of PrismaJobQueue's two terminal writes. The SKIP-LOCKED
// claim SQL can't run on a mocked Prisma, so it is covered by the
// FakeJobQueue-driven worker spec instead. Here prisma.job is mocked and the
// assertions are that complete() and fail() pick the right branch AND are
// fenced on the lease, so a worker that lost its job to a reclaim cannot write
// its outcome over the worker that has it. env is mocked so importing the queue
// never validates real env.
jest.mock("../../env", () => ({
    env: {
        NODE_ENV: "test",
        JOB_VISIBILITY_MS: 300_000,
        JOB_WORKER_POLL_MS: 2000,
        JOB_WORKER_BATCH: 10,
    },
}));

jest.mock("@saroh/database", () => ({
    prisma: {
        job: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
    },
    // Prisma namespace is unused by the code paths under test but imported.
    Prisma: { sql: jest.fn(), InputJsonValue: undefined },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { PrismaJobQueue } from "./prisma-job-queue";

const findUnique = prisma.job.findUnique as unknown as jest.Mock;
const updateMany = prisma.job.updateMany as unknown as jest.Mock;

function job(over: Partial<Job> = {}): Job {
    const now = new Date();
    return {
        id: "job_1",
        organizationId: "org_1",
        type: "enquiry.notify",
        payload: {},
        status: "PROCESSING",
        attempts: 0,
        maxAttempts: 5,
        runAt: now,
        lockedAt: now,
        lockedBy: "worker_1",
        lastError: null,
        createdAt: now,
        updatedAt: now,
        processedAt: null,
        ...over,
    } as Job;
}

/** The lease fence every terminal write must carry. */
const FENCE = { id: "job_1", status: "PROCESSING", lockedBy: "worker_1" };

describe("PrismaJobQueue.complete", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        updateMany.mockResolvedValue({ count: 1 });
    });

    it("marks DONE only while this worker still holds the lease", async () => {
        await expect(
            new PrismaJobQueue().complete("job_1", "worker_1"),
        ).resolves.toBe(true);

        const { where, data } = updateMany.mock.calls[0][0];
        expect(where).toEqual(FENCE);
        expect(data.status).toBe("DONE");
        expect(data.processedAt).toBeInstanceOf(Date);
        expect(data.lockedBy).toBeNull();
    });

    it("reports a lost lease rather than overwriting the reclaiming worker's outcome", async () => {
        updateMany.mockResolvedValue({ count: 0 });

        await expect(
            new PrismaJobQueue().complete("job_1", "worker_1"),
        ).resolves.toBe(false);
    });
});

describe("PrismaJobQueue.fail", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        updateMany.mockResolvedValue({ count: 1 });
    });

    it("reschedules PENDING with more attempts and a future runAt when below maxAttempts", async () => {
        findUnique.mockResolvedValue(job({ attempts: 1, maxAttempts: 5 }));
        const before = Date.now();

        await expect(
            new PrismaJobQueue().fail("job_1", "worker_1", "smtp timeout"),
        ).resolves.toBe(true);

        expect(updateMany).toHaveBeenCalledTimes(1);
        const { where, data } = updateMany.mock.calls[0][0];
        expect(where).toEqual(FENCE);
        expect(data.status).toBe("PENDING");
        expect(data.attempts).toBe(2); // incremented
        expect(data.lastError).toBe("smtp timeout");
        expect(data.processedAt).toBeUndefined(); // not terminal
        expect(data.lockedAt).toBeNull(); // lock released for retry
        // Backoff pushes runAt into the future.
        expect(data.runAt.getTime()).toBeGreaterThan(before);
    });

    it("dead-letters (FAILED + processedAt) when the incremented attempt hits maxAttempts", async () => {
        findUnique.mockResolvedValue(job({ attempts: 4, maxAttempts: 5 }));

        await new PrismaJobQueue().fail(
            "job_1",
            "worker_1",
            "permanent failure",
        );

        const { where, data } = updateMany.mock.calls[0][0];
        expect(where).toEqual(FENCE);
        expect(data.status).toBe("FAILED");
        expect(data.attempts).toBe(5);
        expect(data.lastError).toBe("permanent failure");
        expect(data.processedAt).toBeInstanceOf(Date); // terminal timestamp
        expect(data.runAt).toBeUndefined(); // no reschedule
        expect(data.lockedAt).toBeNull();
    });

    it("is a no-op when the job no longer exists", async () => {
        findUnique.mockResolvedValue(null);

        await expect(
            new PrismaJobQueue().fail("gone", "worker_1", "err"),
        ).resolves.toBe(false);
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("does not touch a job another worker has reclaimed", async () => {
        findUnique.mockResolvedValue(job({ lockedBy: "worker_2" }));

        await expect(
            new PrismaJobQueue().fail("job_1", "worker_1", "late"),
        ).resolves.toBe(false);
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("does not resurrect a job that already finished", async () => {
        // What the fence exists for: a stale worker's failure rescheduling a
        // DONE row to PENDING, which would run its side effect a second time.
        findUnique.mockResolvedValue(job({ status: "DONE", lockedBy: null }));

        await expect(
            new PrismaJobQueue().fail("job_1", "worker_1", "late"),
        ).resolves.toBe(false);
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("still fences the write when the lease is lost between read and write", async () => {
        findUnique.mockResolvedValue(job());
        updateMany.mockResolvedValue({ count: 0 });

        await expect(
            new PrismaJobQueue().fail("job_1", "worker_1", "err"),
        ).resolves.toBe(false);
        expect(updateMany.mock.calls[0][0].where).toEqual(FENCE);
    });
});

describe("PrismaJobQueue.deadLetter", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        updateMany.mockResolvedValue({ count: 1 });
    });

    it("marks FAILED at once, keeps attempts, and records why — fenced on the lease", async () => {
        await expect(
            new PrismaJobQueue().deadLetter(
                "job_1",
                "worker_1",
                "No handler registered",
            ),
        ).resolves.toBe(true);

        const { where, data } = updateMany.mock.calls[0][0];
        expect(where).toEqual(FENCE);
        expect(data.status).toBe("FAILED");
        expect(data.lastError).toBe("No handler registered");
        expect(data.processedAt).toBeInstanceOf(Date);
        expect(data.attempts).toBeUndefined(); // nothing was attempted
        expect(data.runAt).toBeUndefined(); // never rescheduled
    });

    it("reports a lost lease rather than writing", async () => {
        updateMany.mockResolvedValue({ count: 0 });

        await expect(
            new PrismaJobQueue().deadLetter("job_1", "worker_1", "x"),
        ).resolves.toBe(false);
    });
});
