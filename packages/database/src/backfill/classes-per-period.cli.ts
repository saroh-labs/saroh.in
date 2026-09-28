/**
 * Run the D10 backfill — every live subscription holds its own classes a
 * month — and print what it did.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/classes-per-period.cli.ts
 *
 * Run it after the deploy that ships migration
 * 20261013180000_subscription_classes_per_period, and again after any
 * rollback and re-deploy. Safe to run more than once, and while either API
 * image serves; see classes-per-period.ts. "Still unset" must end at 0.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillClassesPerPeriod } = await import("./classes-per-period");
    try {
        const report = await backfillClassesPerPeriod(prisma);
        console.log(
            `[classes-per-period] ${target.database}: live subscriptions unset: ${report.unsetBefore}, set now: ${report.filled}, still unset: ${report.unsetAfter}`,
        );
        if (report.unsetAfter > 0) {
            // A row a renewal changed while this ran; the next run takes it.
            console.log(
                "[classes-per-period] some rows changed while it ran — run it again",
            );
            process.exitCode = 1;
        }
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[classes-per-period] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
