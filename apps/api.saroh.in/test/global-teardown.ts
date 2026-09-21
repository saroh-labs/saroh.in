/**
 * Jest globalTeardown for the integration project.
 *
 * The test DB is intentionally LEFT materialized so a failed run can be
 * inspected; the next run's globalSetup does `--force-reset` for a clean slate.
 * All we do here is best-effort close the shared client and pool in the main
 * process (workers disconnect themselves via integration-setup's afterAll).
 */
export default async function globalTeardown(): Promise<void> {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    try {
        const { disconnectDatabase } = await import("@saroh/database");
        // The pool too, not only the client — see disconnectDatabase.
        await disconnectDatabase();
    } catch {
        // The client may never have been imported in this process — fine.
    }
}
