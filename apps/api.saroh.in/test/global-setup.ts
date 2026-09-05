import { execFileSync } from "node:child_process";
import * as path from "node:path";

import { assertTestDatabase } from "./db-guard";

/**
 * Jest globalSetup for the integration project. Runs once, in the main Jest
 * process, before any worker starts.
 *
 * 1. Validates the non-test-DB guard (aborts the whole run if it fails).
 * 2. Materializes the current schema into the test DB.
 *
 * We use `prisma db push --force-reset` rather than `migrate deploy` on
 * purpose: it reflects schema.prisma exactly and resets to a pristine,
 * deterministic starting point every run, without replaying 51 migrations
 * before each suite.
 *
 * The original reason given here — that the one committed migration had
 * DRIFTED from schema.prisma — has not been true since the chain was repaired
 * (`eb6ce65`). It is now checked rather than assumed: the `migration-replay`
 * CI job (`pnpm --filter @saroh/database db:verify:replay`) builds a database
 * from the migrations alone and fails if the result differs from
 * schema.prisma. Keep that job green and the schema this pushes is the same
 * schema the migrations produce.
 *
 * That division matters: `db push` means NO spec here executes a migration
 * file, so this suite cannot tell you whether a migration works. Only the
 * replay job can.
 */
export default async function globalSetup(): Promise<void> {
    const testDatabaseUrl = assertTestDatabase();

    const databaseDir = path.resolve(__dirname, "../../../packages/database");

    // prisma.config.js loads dotenv, but dotenv does NOT override an env var
    // that is already present — so passing DATABASE_URL here wins over the
    // dev URL in packages/database/.env.
    execFileSync(
        "pnpm",
        [
            "exec",
            "prisma",
            "db",
            "push",
            "--force-reset",
            // Prisma 7 removed `--skip-generate` from `prisma db push` (it no
            // longer generates as a side effect, so there is nothing to skip).
            // Passing it aborts the push, which took the whole integration
            // project down with it.
            "--accept-data-loss",
        ],
        {
            cwd: databaseDir,
            stdio: "inherit",
            env: { ...process.env, DATABASE_URL: testDatabaseUrl },
        },
    );
}
