import { prisma } from "@saroh/database";

/**
 * Wipe every table in the test database. Used for between-suite isolation.
 *
 * Schema-agnostic on purpose: it discovers the current `public` tables at
 * runtime and TRUNCATE ... CASCADE's them in one statement, so it keeps working
 * as the schema evolves without a hand-maintained table list. Relies on the
 * shared `@saroh/database` client, which must already point at the test DB
 * (integration-setup.ts sets DATABASE_URL = TEST_DATABASE_URL before any query).
 */
export async function truncateAll(): Promise<void> {
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
