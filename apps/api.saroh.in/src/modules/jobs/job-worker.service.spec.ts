// Worker dispatch, driven deterministically with runOnce() against the
// in-memory FakeJobQueue + a real registry. No DB, no network, no live timers.
// env is mocked so the worker's env-configured batch/poll values are stable and
// importing it never validates real env.
jest.mock("../../env", () => ({
    env: {
        NODE_ENV: "test",
        JOB_WORKER_POLL_MS: 2000,
        JOB_WORKER_BATCH: 10,
        JOB_VISIBILITY_MS: 300_000,
    },
}));

import type { Job } from "@saroh/database";

import { JobHandlerRegistry } from "./job-handler.registry";
import { FakeJobQueue } from "./job-queue.port";
import { JobWorkerService } from "./job-worker.service";

function makeWorker(queue: FakeJobQueue, registry: JobHandlerRegistry) {
    return new JobWorkerService(queue, registry);
}

describe("JobWorkerService.runOnce", () => {
    it("claims a due job, runs its matching handler, and completes it", async () => {
        const queue = new FakeJobQueue();
        const registry = new JobHandlerRegistry();
        const handler = jest.fn().mockResolvedValue(undefined);
        registry.register("enquiry.notify", handler);
        const enqueued = await queue.enqueue({
            type: "enquiry.notify",
            payload: { leadId: "lead_1" },
        });

        const processed = await makeWorker(queue, registry).runOnce();

        expect(processed).toBe(1);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].id).toBe(enqueued.id);
        expect(queue.jobs[0].status).toBe("DONE");
        expect(queue.jobs[0].processedAt).toBeInstanceOf(Date);
    });

    it("fails (records error, reschedules) a job whose handler throws", async () => {
        const queue = new FakeJobQueue();
        const registry = new JobHandlerRegistry();
        registry.register("enquiry.notify", () =>
            Promise.reject(new Error("smtp down")),
        );
        await queue.enqueue({ type: "enquiry.notify", payload: {} });

        await makeWorker(queue, registry).runOnce();

        const j = queue.jobs[0];
        expect(j.status).toBe("PENDING"); // rescheduled, not dead-lettered (1/5)
        expect(j.attempts).toBe(1);
        expect(j.lastError).toBe("smtp down");
        expect(j.runAt.getTime()).toBeGreaterThan(Date.now()); // backoff applied
    });

    it("dead-letters a job that exhausts its attempts across ticks", async () => {
        const queue = new FakeJobQueue();
        const registry = new JobHandlerRegistry();
        registry.register("enquiry.notify", () =>
            Promise.reject(new Error("always")),
        );
        // maxAttempts=1 → first failure is terminal.
        await queue.enqueue({
            type: "enquiry.notify",
            payload: {},
            maxAttempts: 1,
        });

        await makeWorker(queue, registry).runOnce();

        expect(queue.jobs[0].status).toBe("FAILED");
        expect(queue.jobs[0].processedAt).toBeInstanceOf(Date);
    });

    it("routes an unknown type to the no-op fallback and completes it (queue not wedged)", async () => {
        const queue = new FakeJobQueue();
        const registry = new JobHandlerRegistry();
        await queue.enqueue({ type: "mystery.type", payload: {} });

        const processed = await makeWorker(queue, registry).runOnce();

        expect(processed).toBe(1);
        expect(queue.jobs[0].status).toBe("DONE");
    });

    it("does not hand the same claimed job to a second tick (visibility)", async () => {
        const queue = new FakeJobQueue();
        const registry = new JobHandlerRegistry();
        // A handler that never resolves would leave the job PROCESSING; simulate
        // an in-flight job by claiming without dispatching completion.
        const claimedFirst = await queue.claimDue("worker_a", 10);
        expect(claimedFirst).toHaveLength(0); // nothing enqueued yet

        await queue.enqueue({ type: "enquiry.notify", payload: {} });
        registry.register(
            "enquiry.notify",
            jest.fn().mockResolvedValue(undefined),
        );

        const worker = makeWorker(queue, registry);
        const first = await worker.runOnce(); // claims + completes the one job
        const second = await worker.runOnce(); // nothing left to claim

        expect(first).toBe(1);
        expect(second).toBe(0);
    });

    it("does not start a poll timer under NODE_ENV=test", () => {
        const queue = new FakeJobQueue();
        const registry = new JobHandlerRegistry();
        const worker = makeWorker(queue, registry);
        const spy = jest.spyOn(global, "setInterval");

        worker.onModuleInit();
        worker.onModuleDestroy();

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe("FakeJobQueue visibility", () => {
    it("does not re-claim a job already PROCESSING", async () => {
        const queue = new FakeJobQueue();
        await queue.enqueue({ type: "t", payload: {} });

        const first = await queue.claimDue("w1", 10);
        const second = await queue.claimDue("w2", 10);

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(0); // locked by w1, not handed out again
        expect((queue.jobs[0] as Job).lockedBy).toBe("w1");
    });
});
