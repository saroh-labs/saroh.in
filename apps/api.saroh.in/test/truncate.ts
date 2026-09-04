/**
 * Wipe every table in the test database. Used for between-suite isolation.
 *
 * Schema-agnostic on purpose: it discovers the current `public` tables at
 * runtime and TRUNCATE ... CASCADE's them in one statement, so it keeps working
 * as the schema evolves without a hand-maintained table list. Relies on the
 * shared `@saroh/database` client, which must already point at the test DB
 * (integration-setup.ts sets DATABASE_URL = TEST_DATABASE_URL before any query).
 */

type DatabaseModule = typeof import("@saroh/database");

/**
 * The REAL client, bypassing any `jest.mock("@saroh/database")` the spec that
 * is currently unloading happened to install.
 *
 * This teardown is shared by every file in the integration project, and a good
 * number of those files mock the database module for their own assertions. A
 * plain `import { prisma }` resolves through Jest's module registry, so in
 * those files it yielded the spec's mock — an object with a handful of model
 * delegates and no `$queryRawUnsafe` — and the afterAll blew up with
 * "not a function". Every test in the file had already passed; the suite was
 * reported as failed purely because its cleanup could not run.
 *
 * `requireActual` is resolved lazily, inside the call, for the same reason the
 * import used to be deferred: `@saroh/database` reads DATABASE_URL at import
 * time and must not load before integration-setup.ts has pointed it at the
 * guard-verified test database.
 */
function actualDatabase(): DatabaseModule {
    return jest.requireActual<DatabaseModule>("@saroh/database");
}

export async function truncateAll(): Promise<void> {
    const { prisma } = actualDatabase();
    const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const tables = rows
        .map((r) => r.tablename)
        .filter((name) => name !== "_prisma_migrations")
        .map((name) => `"public"."${name}"`);
    if (tables.length === 0) return;
    await prisma.$executeRawUnsafe(
        `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`,
    );
}

/** Disconnect the real client. Mirrors `truncateAll`'s mock-proof resolution. */
export async function disconnectPrisma(): Promise<void> {
    const { prisma } = actualDatabase();
    await prisma.$disconnect();
}
