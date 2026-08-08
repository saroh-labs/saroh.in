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
 * purpose: the single committed migration
 * (20260214131612_init_multi_tenant_schema) is known to be DRIFTED from
 * schema.prisma — later feature work used `db push`, not new migrations — so
 * deploying migrations would materialize a stale schema and the DB-backed
 * specs would fail against columns/tables that no longer match. `db push`
 * reflects schema.prisma exactly, and `--force-reset` drops and recreates the
 * public schema for a pristine, deterministic starting point every run.
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
            "--skip-generate",
            "--accept-data-loss",
        ],
        {
            cwd: databaseDir,
            stdio: "inherit",
            env: { ...process.env, DATABASE_URL: testDatabaseUrl },
        },
    );
}
