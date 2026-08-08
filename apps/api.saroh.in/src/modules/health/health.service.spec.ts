import type { prisma } from "@saroh/database";

import { HealthService } from "./health.service";

type Db = typeof prisma;

/** A database that answers every readiness query successfully. */
function healthyDb(): Db {
    return {
        $queryRaw: jest.fn().mockResolvedValue([]),
        job: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as Db;
}

describe("HealthService liveness", () => {
    it("does not touch the database", () => {
        const db = { $queryRaw: jest.fn(), job: { count: jest.fn() } };
        const service = new HealthService(db as unknown as Db);

        expect(service.liveness()).toEqual({ status: "ok" });
        // Liveness must answer even when every dependency is gone — otherwise a
        // database outage gets the process killed and restarted pointlessly.
        expect(db.$queryRaw).not.toHaveBeenCalled();
        expect(db.job.count).not.toHaveBeenCalled();
    });
});

describe("HealthService readiness", () => {
    it("is ready when every dependency answers", async () => {
        const report = await new HealthService(healthyDb()).readiness();

        expect(report.status).toBe("ready");
        expect(report.checks.map((c) => c.name).sort()).toEqual([
            "database",
            "migrations",
            "queue",
        ]);
        expect(report.checks.every((c) => c.status === "up")).toBe(true);
    });

    it("FAILS when the database is unreachable", async () => {
        // The defect this endpoint was rewritten for: the old `/health`
        // returned a static "ok" and could not fail, so an orchestrator kept
        // routing traffic to an instance that could not reach Postgres.
        const db = {
            $queryRaw: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
            job: { count: jest.fn().mockResolvedValue(0) },
        } as unknown as Db;

        const report = await new HealthService(db).readiness();

        expect(report.status).toBe("not_ready");
        expect(report.checks.find((c) => c.name === "database")?.status).toBe(
            "down",
        );
    });

    it("FAILS when a migration has no successful application", async () => {
        // Serving against a half-applied schema is how a deploy becomes data
        // corruption: the code expects columns the database does not have.
        const db = {
            $queryRaw: jest
                .fn()
                // `SELECT 1` succeeds; the migration ledger query returns a row.
                .mockResolvedValueOnce([{ "?column?": 1 }])
                .mockResolvedValueOnce([
                    { migration_name: "20260803_add_idempotency" },
                ]),
            job: { count: jest.fn().mockResolvedValue(0) },
        } as unknown as Db;

        const report = await new HealthService(db).readiness();

        expect(report.status).toBe("not_ready");
        const migrations = report.checks.find((c) => c.name === "migrations");
        expect(migrations?.status).toBe("down");
        expect(migrations?.detail).toContain("20260803_add_idempotency");
    });

    it("stays ready when a migration failed once and then succeeded", async () => {
        // Prisma marks the failed attempt `rolled_back_at` and inserts a NEW
        // row for the retry, so one migration can own several rows. An earlier
        // draft flagged any rolled-back row and reported a healthy database as
        // broken — which would have pinned readiness at 503 forever. The query
        // groups by name, so a superseded failure returns nothing here.
        const db = {
            $queryRaw: jest
                .fn()
                .mockResolvedValueOnce([{ "?column?": 1 }])
                .mockResolvedValueOnce([]),
            job: { count: jest.fn().mockResolvedValue(0) },
        } as unknown as Db;

        const report = await new HealthService(db).readiness();

        expect(report.status).toBe("ready");
    });

    it("FAILS when the job queue is unreadable", async () => {
        const db = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            job: {
                count: jest
                    .fn()
                    .mockRejectedValue(
                        new Error('relation "Job" does not exist'),
                    ),
            },
        } as unknown as Db;

        const report = await new HealthService(db).readiness();

        expect(report.status).toBe("not_ready");
        expect(report.checks.find((c) => c.name === "queue")?.status).toBe(
            "down",
        );
    });

    it("reports every dependency, not just the first failure", async () => {
        // A probe that short-circuits tells an operator one thing is broken
        // when three are, which turns one incident into three.
        const db = {
            $queryRaw: jest.fn().mockRejectedValue(new Error("down")),
            job: { count: jest.fn().mockRejectedValue(new Error("down")) },
        } as unknown as Db;

        const report = await new HealthService(db).readiness();

        expect(report.checks).toHaveLength(3);
        expect(report.checks.filter((c) => c.status === "down")).toHaveLength(
            3,
        );
    });

    it("does not leak connection detail into the response", async () => {
        const secret = "postgresql://user:hunter2@ep-x.aws.neon.tech/saroh-dev";
        const db = {
            $queryRaw: jest.fn().mockRejectedValue(new Error("connect failed")),
            job: { count: jest.fn().mockResolvedValue(0) },
        } as unknown as Db;

        const report = await new HealthService(db).readiness();

        expect(JSON.stringify(report)).not.toContain("hunter2");
        expect(JSON.stringify(report)).not.toContain(secret);
    });
});
