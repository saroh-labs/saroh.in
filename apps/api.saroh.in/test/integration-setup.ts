import { assertTestDatabase } from "./db-guard";

/**
 * setupFilesAfterEnv for the integration project. Runs once per test file, in
 * the worker, BEFORE the spec module (and its `@saroh/database` import) loads.
 *
 * Injecting the test URL here is how we keep the app's Prisma client
 * unchanged: `@saroh/database` reads `DATABASE_URL` at import time, so we point
 * that at the (guard-verified) test DB before anything imports it. The guard
 * runs first, so a real DATABASE_URL can never leak into a test run.
 *
 * Isolation strategy: run serially (maxWorkers=1) and TRUNCATE every table
 * after each test file. globalSetup gives file #1 a pristine schema; each
 * file's afterAll truncate hands the next file a clean slate. Simple, robust,
 * and independent of whether a spec's own cleanup succeeded.
 */
const testDatabaseUrl = assertTestDatabase();
process.env.DATABASE_URL = testDatabaseUrl;

afterAll(async () => {
    // Deferred import: `@saroh/database` must not load until DATABASE_URL is
    // set above (a static import would hoist above the assignment). Both
    // helpers resolve the REAL client internally, so this teardown still works
    // in the files that mock the database module.
    const { truncateAll, disconnectPrisma } = await import("./truncate");
    await truncateAll();
    await disconnectPrisma();
});
