import type { Job } from "@saroh/database";

/**
 * Durable background-job / outbox port (S3-003).
 *
 * The producer side is an OUTBOX: business code enqueues a job by inserting a
 * `Job` row inside its OWN transaction (e.g. the same tx that commits a lead),
 * so a committed lead ALWAYS has a queued notification — no lost work, no
 * dual-write race. The consumer side is a poll-based worker that claims due
 * jobs, runs their handler, and either completes them or reschedules with
 * backoff, dead-lettering after `maxAttempts`. Delivery is therefore
 * AT-LEAST-ONCE: handlers must be idempotent.
 *
 * The port is a narrow, swappable interface so (a) other modules depend only on
 * `enqueue` behind the {@link JOB_QUEUE} token, never on Prisma, and (b) the
 * worker + tests drive claim/complete/fail against an in-memory
 * {@link FakeJobQueue} without a database — the concurrency-safe SKIP LOCKED SQL
 * only exists in the Postgres-backed {@link PrismaJobQueue}.
 */
export interface JobQueue {
    /**
     * Insert a PENDING job. Called by producers (usually inside their own
     * transaction via the shared `prisma`); returns the created row.
     */
    enqueue(input: EnqueueJobInput): Promise<Job>;

    /**
     * Atomically claim up to `limit` runnable jobs for `workerId` and mark them
     * PROCESSING. "Runnable" = PENDING and due (`runAt <= now`), OR stuck
     * PROCESSING past the visibility timeout (a crashed worker). Concurrent
     * workers never receive the same row. Returns the claimed jobs.
     */
    claimDue(workerId: string, limit: number): Promise<Job[]>;

    /** Mark a job DONE (terminal, success). */
    complete(id: string): Promise<void>;

    /**
     * Record a failed attempt. If this was the last allowed attempt the job is
     * dead-lettered (FAILED, terminal); otherwise it is rescheduled PENDING
     * with an exponential backoff via {@link nextBackoff}.
     */
    fail(id: string, error: string): Promise<void>;
}

/** Input for {@link JobQueue.enqueue}. */
export interface EnqueueJobInput {
    /** Handler key, e.g. `"enquiry.notify"`. */
    type: string;
    /** Arbitrary JSON-serialisable handler input. */
    payload: unknown;
    /** Owning org for tenancy/observability (optional — some jobs are global). */
    organizationId?: string;
    /** Override the retry ceiling (defaults to the schema default of 5). */
    maxAttempts?: number;
    /** Earliest execution time (defaults to now — run ASAP). */
    runAt?: Date;
}

/** DI token for the {@link JobQueue} port. Inject with `@Inject(JOB_QUEUE)`. */
export const JOB_QUEUE = Symbol("JOB_QUEUE");

/**
 * A unit of work: given a claimed {@link Job}, do the side effect (send the
 * email, write the inbox row, …). Throwing triggers a retry/dead-letter;
 * resolving means the job is completed. Handlers MUST be idempotent because
 * delivery is at-least-once.
 */
export type JobHandler = (job: Job) => Promise<void>;

/**
 * Registry contract: producers/consumers register a handler per job `type`, the
 * worker looks one up per claimed job. The concrete implementation lives in
 * `job-handler.registry.ts`.
 */
export interface JobHandlerRegistryPort {
    register(type: string, handler: JobHandler): void;
    get(type: string): JobHandler;
}

/** Base retry delay (ms) — the first retry waits roughly this long. */
export const BACKOFF_BASE_MS = 1_000;

/** Backoff ceiling (ms) — no retry is delayed longer than this (5 min). */
export const BACKOFF_CAP_MS = 300_000;

/**
 * Exponential backoff for the Nth failed attempt: `min(cap, base * 2^attempts)`.
 *
 * Pure and deterministic (no jitter) so it is directly unit-tested: strictly
 * increasing while below the cap, then pinned at the cap. `attempts` is the
 * attempt count AFTER incrementing (attempts=1 → the delay before retry #1).
 */
export function nextBackoff(attempts: number): number {
    const n = Math.max(0, Math.floor(attempts));
    // Guard the shift from overflowing to Infinity/0 for large n before the min.
    if (n >= 31) return BACKOFF_CAP_MS;
    return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** n);
}

/**
 * In-memory {@link JobQueue} for unit tests and local drive-by use. No DB, no
 * network, no timers. `claimDue` mirrors the real visibility semantics (a
 * claimed job flips to PROCESSING and is not handed out again) so worker tests
 * can assert a job isn't dispatched twice; `fail` mirrors the real
 * backoff/dead-letter decision.
 */
export class FakeJobQueue implements JobQueue {
    /** Every job ever enqueued, in insertion order (inspect in assertions). */
    readonly jobs: Job[] = [];
    private seq = 0;

    enqueue(input: EnqueueJobInput): Promise<Job> {
        const now = new Date();
        const job: Job = {
            id: `job_${++this.seq}`,
            organizationId: input.organizationId ?? null,
            type: input.type,
            payload: input.payload as Job["payload"],
            status: "PENDING",
            attempts: 0,
            maxAttempts: input.maxAttempts ?? 5,
            runAt: input.runAt ?? now,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            createdAt: now,
            updatedAt: now,
            processedAt: null,
        };
        this.jobs.push(job);
        return Promise.resolve(job);
    }

    claimDue(workerId: string, limit: number): Promise<Job[]> {
        const now = Date.now();
        const due = this.jobs.filter(
            (j) => j.status === "PENDING" && j.runAt.getTime() <= now,
        );
        const claimed = due.slice(0, Math.max(0, limit));
        for (const j of claimed) {
            j.status = "PROCESSING";
            j.lockedAt = new Date();
            j.lockedBy = workerId;
        }
        return Promise.resolve(claimed);
    }

    complete(id: string): Promise<void> {
        const job = this.find(id);
        if (job) {
            job.status = "DONE";
            job.processedAt = new Date();
            job.lockedAt = null;
            job.lockedBy = null;
        }
        return Promise.resolve();
    }

    fail(id: string, error: string): Promise<void> {
        const job = this.find(id);
        if (job) {
            const attempts = job.attempts + 1;
            job.attempts = attempts;
            job.lastError = error;
            job.lockedAt = null;
            job.lockedBy = null;
            if (attempts >= job.maxAttempts) {
                job.status = "FAILED";
                job.processedAt = new Date();
            } else {
                job.status = "PENDING";
                job.runAt = new Date(Date.now() + nextBackoff(attempts));
            }
        }
        return Promise.resolve();
    }

    private find(id: string): Job | undefined {
        return this.jobs.find((j) => j.id === id);
    }
}
