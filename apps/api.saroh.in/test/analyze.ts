import { execFileSync } from "node:child_process";
import * as path from "node:path";

import { assertTestDatabase } from "./db-guard";

/**
 * `ANALYZE` the test database as its owner — what autovacuum does in a real
 * environment after a bulk load. A scale spec runs this after seeding so the
 * planner sees the rows it just wrote rather than guessing a handful.
 *
 * Not through the suite's `prisma`: in RLS mode (`TEST_RLS=on`) that client
 * is the DML-only runtime role, and Postgres lets only a table's owner
 * analyze it. The role's `ANALYZE` is a warning and a no-op, so the planner
 * kept guessing and nested loops over thousands of rows — the 5,000-customer
 * list went from ~100ms to over 5s, and past the per-operation transaction's
 * timeout. Production's autovacuum runs as a superuser; this is its stand-in.
 *
 * Runs through the Prisma CLI, as globalSetup does, since the API has no
 * direct Postgres driver of its own.
 */
export function analyzeAsOwner(): void {
    // Only TEST_DATABASE_URL: inside a worker DATABASE_URL already points at
    // the test database, which the guard would read as a collision.
    const ownerUrl = assertTestDatabase({
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    });
    execFileSync("pnpm", ["exec", "prisma", "db", "execute", "--stdin"], {
        cwd: path.resolve(__dirname, "../../../packages/database"),
        stdio: ["pipe", "ignore", "inherit"],
        input: "ANALYZE;",
        env: { ...process.env, DATABASE_URL: ownerUrl },
    });
}
