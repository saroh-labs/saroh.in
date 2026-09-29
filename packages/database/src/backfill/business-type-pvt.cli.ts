/**
 * Run the F10b backfill — stored `company` business types become `pvt` —
 * and print what it did (counts only).
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/business-type-pvt.cli.ts
 *
 * Run it after the F10b API deploy settles (the F10 image stores `company`
 * until it stops serving), and again after any rollback and re-deploy. Safe
 * to run more than once; see business-type-pvt.ts. "Still company" must end
 * at 0 before Z4 ships.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillBusinessTypePvt } = await import("./business-type-pvt");
    try {
        const report = await backfillBusinessTypePvt(prisma);
        console.log(
            `[business-type-pvt] ${target.database}: stored as company: ${report.companyBefore}, rewritten to pvt: ${report.rewritten}, still company: ${report.companyAfter}`,
        );
        if (report.companyAfter > 0) {
            // A save by the previous image while this ran; the next run takes it.
            console.log(
                "[business-type-pvt] some rows changed while it ran — run it again",
            );
            process.exitCode = 1;
        }
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[business-type-pvt] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
