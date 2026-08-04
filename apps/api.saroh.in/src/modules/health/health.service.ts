import { Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

/**
 * Liveness and readiness, kept apart because they answer different questions
 * and have different consequences when they fail.
 *
 * Liveness: is this process running? A failure means restart me.
 * Readiness: can this process serve traffic? A failure means route around me —
 * the process is fine, its dependencies are not.
 *
 * The previous `/health` returned a static `{ status: "ok" }` and performed no
 * check at all, so it COULD NOT FAIL. An orchestrator reading it would keep
 * sending production traffic to an instance that could not reach Postgres, had
 * a half-applied migration, or had lost its queue — and the probe would report
 * healthy the entire time. A probe that cannot fail is not a probe.
 */
export type CheckStatus = "up" | "down";

export interface DependencyCheck {
    name: string;
    status: CheckStatus;
    /** Safe, human-readable reason when down. Never carries connection detail. */
    detail?: string;
    durationMs: number;
}

export interface ReadinessReport {
    status: "ready" | "not_ready";
    checks: DependencyCheck[];
}

/** A failed check must not hang the probe and keep a bad instance in rotation. */
const CHECK_TIMEOUT_MS = 3_000;

async function timed(
    name: string,
    run: () => Promise<unknown>,
): Promise<DependencyCheck> {
    const started = Date.now();
    try {
        await Promise.race([
            run(),
            new Promise((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`),
                        ),
                    CHECK_TIMEOUT_MS,
                ),
            ),
        ]);
        return { name, status: "up", durationMs: Date.now() - started };
    } catch (error) {
        return {
            name,
            status: "down",
            // The message only — never the cause chain, which for Prisma
            // errors can contain the connection string.
            detail: error instanceof Error ? error.message : "check failed",
            durationMs: Date.now() - started,
        };
    }
}

@Injectable()
export class HealthService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    /** The process is up. Deliberately touches nothing external. */
    liveness(): { status: "ok" } {
        return { status: "ok" };
    }

    async readiness(): Promise<ReadinessReport> {
        const checks = await Promise.all([
            timed("database", () => this.db.$queryRaw`SELECT 1`),
            timed("migrations", () => this.assertMigrationsApplied()),
            // The job queue is Postgres-backed, so this is not a duplicate of
            // the database check: it proves the queue's own table is present
            // and readable, which a partially-migrated schema would fail.
            timed("queue", () => this.db.job.count()),
        ]);

        return {
            status: checks.every((c) => c.status === "up")
                ? "ready"
                : "not_ready",
            checks,
        };
    }

    /**
     * Refuse readiness while a migration has never applied successfully.
     *
     * Serving traffic against a half-applied schema is how a deploy turns into
     * data corruption: the code expects columns the database does not have yet.
     * Reads Prisma's own ledger rather than the migrations directory, which is
     * not shipped with the running container.
     *
     * GROUPED BY NAME, deliberately. Prisma does not update a failed row when a
     * migration is retried — it marks the old attempt `rolled_back_at` and
     * inserts a NEW row for the successful run, so one migration can legitimately
     * own several rows. A first draft of this check flagged any row with
     * `rolled_back_at IS NOT NULL` and reported `20260719171244_rls_child_tables`
     * as broken on a database `prisma migrate status` calls up to date. That
     * would have held readiness at 503 forever and blocked every deploy.
     *
     * The question that actually matters is not "did any attempt fail?" but
     * "is there a successful attempt?".
     */
    private async assertMigrationsApplied(): Promise<void> {
        const rows = await this.db.$queryRaw<{ migration_name: string }[]>`
            SELECT migration_name FROM _prisma_migrations
            GROUP BY migration_name
            HAVING bool_or(finished_at IS NOT NULL AND rolled_back_at IS NULL) = false
            LIMIT 5
        `;
        if (rows.length > 0) {
            throw new Error(
                `migrations with no successful application: ${rows
                    .map((r) => r.migration_name)
                    .join(", ")}`,
            );
        }
    }
}
