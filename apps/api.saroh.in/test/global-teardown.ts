/**
 * Jest globalTeardown for the integration project.
 *
 * The test DB is intentionally LEFT materialized so a failed run can be
 * inspected; the next run's globalSetup does `--force-reset` for a clean slate.
 * All we do here is best-effort disconnect the shared client in the main
 * process (workers disconnect themselves via integration-setup's afterAll).
 */
export default async function globalTeardown(): Promise<void> {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    try {
        const { prisma } = await import("@saroh/database");
        await prisma.$disconnect();
    } catch {
        // The client may never have been imported in this process — fine.
    }
}
