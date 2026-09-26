/**
 * Run the #529 catalogue-settings backfill and print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/catalogue-settings.cli.ts
 *
 * Safe to run more than once; see catalogue-settings.ts. The report is the
 * owner-facing list of what merged, what stayed apart and what was dropped.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillCatalogueSettings } = await import("./catalogue-settings");
    try {
        const report = await backfillCatalogueSettings(prisma);
        console.log(
            `[catalogue-settings] businesses: ${report.organizations}, merged: ${report.merged.length}, kept apart: ${report.keptApart.length}, values dropped: ${report.discarded.length}, SKU patterns that differed: ${report.skuPatterns.length}`,
        );
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[catalogue-settings] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
