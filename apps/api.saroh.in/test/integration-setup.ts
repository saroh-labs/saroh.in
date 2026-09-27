import { assertTestDatabase } from "./db-guard";
import { isRlsTestMode, RLS_URL_ENV, wrapOrgScopedMethods } from "./rls-mode";

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
 *
 * RLS mode (`TEST_RLS=on`, see rls-mode.ts) connects as the NOBYPASSRLS role
 * globalSetup made, switches enforcement on, and runs every service call made
 * for an organization inside that organization's RLS context.
 */
const testDatabaseUrl = assertTestDatabase();
process.env.DATABASE_URL = testDatabaseUrl;

if (isRlsTestMode()) {
    const roleUrl = process.env[RLS_URL_ENV];
    if (!roleUrl) {
        throw new Error(
            `[rls-mode] ${RLS_URL_ENV} is not set; globalSetup did not create the test role.`,
        );
    }
    process.env.DATABASE_URL = roleUrl;
    process.env.RLS_ENFORCEMENT = "on";

    jest.doMock("@nestjs/common", () => {
        const actual =
            jest.requireActual<typeof import("@nestjs/common")>(
                "@nestjs/common",
            );
        const Injectable =
            (...options: Parameters<typeof actual.Injectable>) =>
            (target: { prototype: object }) => {
                // Resolved per call: @saroh/database must not load before
                // DATABASE_URL points at the role (set above).
                wrapOrgScopedMethods(target, (organizationId, fn) =>
                    jest
                        .requireActual<typeof import("@saroh/database")>(
                            "@saroh/database",
                        )
                        .runInOrgContext(organizationId, fn),
                );
                return (
                    actual.Injectable(...options) as (t: unknown) => unknown
                )(target);
            };
        return { ...actual, Injectable };
    });
}

afterAll(async () => {
    // Deferred import: `@saroh/database` must not load until DATABASE_URL is
    // set above (a static import would hoist above the assignment). Both
    // helpers resolve the REAL client internally, so this teardown still works
    // in the files that mock the database module.
    const { truncateAll, disconnectPrisma } = await import("./truncate");
    await truncateAll();
    await disconnectPrisma();
});
