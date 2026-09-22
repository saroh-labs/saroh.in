/**
 * The claim query against a real Postgres whose session time zone is not
 * UTC — the case a mock cannot show.
 *
 * Prisma writes `DateTime` columns as `timestamp without time zone` holding
 * UTC. Compared in SQL with `now()`, which carries a zone, Postgres reads the
 * column in the SESSION zone: on a database set to Asia/Kolkata every UTC
 * time looked 5½ hours older than it was, so a job scheduled an hour ahead —
 * a retry's backoff, a self-rescheduling job's next run — was claimed at once.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import type { PrismaJobQueue as Queue } from "./prisma-job-queue";

let queue: Queue;

beforeAll(async () => {
    // Every connection this file opens starts in a zone ahead of UTC, as a
    // developer's Postgres in India does. Set on the connection string before
    // `@saroh/database` is loaded, since it reads DATABASE_URL once.
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.searchParams.set("options", "-c timezone=Asia/Kolkata");
    process.env.DATABASE_URL = url.toString();

    const { prisma } = await import("@saroh/database");
    const { PrismaJobQueue } = await import("./prisma-job-queue");
    queue = new PrismaJobQueue(300_000);

    const [row] = await prisma.$queryRaw<
        { tz: string }[]
    >`SELECT current_setting('TimeZone') AS tz`;
    expect(row?.tz).toBe("Asia/Kolkata");
});

describe("claiming due jobs in a non-UTC session", () => {
    it("leaves a job scheduled an hour ahead where it is", async () => {
        const later = await queue.enqueue({
            type: "test.later",
            payload: {},
            runAt: new Date(Date.now() + 60 * 60 * 1000),
        });
        const claimed = await queue.claimDue("worker_1", 10);
        expect(claimed.map((j) => j.id)).not.toContain(later.id);
    });

    it("claims a job that is due", async () => {
        const due = await queue.enqueue({
            type: "test.due",
            payload: {},
            runAt: new Date(Date.now() - 1000),
        });
        const claimed = await queue.claimDue("worker_1", 10);
        expect(claimed.map((j) => j.id)).toContain(due.id);
    });

    it("does not reclaim a job claimed a moment ago", async () => {
        const job = await queue.enqueue({
            type: "test.leased",
            payload: {},
            runAt: new Date(Date.now() - 1000),
        });
        const first = await queue.claimDue("worker_1", 10);
        expect(first.map((j) => j.id)).toContain(job.id);
        // Well inside the five-minute lease: another worker must not take it.
        const second = await queue.claimDue("worker_2", 10);
        expect(second.map((j) => j.id)).not.toContain(job.id);
    });
});
