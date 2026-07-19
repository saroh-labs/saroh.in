// DB-free unit test of the fail()/dead-letter DECISION. The SKIP-LOCKED claim
// SQL can't run on a mocked Prisma, so it is covered by the FakeJobQueue-driven
// worker spec instead; here we mock prisma.job and assert fail() picks the
// right branch. env is mocked so importing the queue never validates real env.
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
            update: jest.fn(),
        },
    },
    // Prisma namespace is unused by the code paths under test but imported.
    Prisma: { sql: jest.fn(), InputJsonValue: undefined },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { PrismaJobQueue } from "./prisma-job-queue";

const findUnique = prisma.job.findUnique as unknown as jest.Mock;
const update = prisma.job.update as unknown as jest.Mock;

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

describe("PrismaJobQueue.fail", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reschedules PENDING with more attempts and a future runAt when below maxAttempts", async () => {
        findUnique.mockResolvedValue(job({ attempts: 1, maxAttempts: 5 }));
        const before = Date.now();

        await new PrismaJobQueue().fail("job_1", "smtp timeout");

        expect(update).toHaveBeenCalledTimes(1);
        const data = update.mock.calls[0][0].data;
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

        await new PrismaJobQueue().fail("job_1", "permanent failure");

        const data = update.mock.calls[0][0].data;
        expect(data.status).toBe("FAILED");
        expect(data.attempts).toBe(5);
        expect(data.lastError).toBe("permanent failure");
        expect(data.processedAt).toBeInstanceOf(Date); // terminal timestamp
        expect(data.runAt).toBeUndefined(); // no reschedule
        expect(data.lockedAt).toBeNull();
    });

    it("is a no-op when the job no longer exists", async () => {
        findUnique.mockResolvedValue(null);

        await new PrismaJobQueue().fail("gone", "err");

        expect(update).not.toHaveBeenCalled();
    });
});
