/**
 * Run the #530 same-product merge and print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/merge-same-products.cli.ts
 *
 * Run it after the listings backfill (listings-stock-levels.cli.ts); it
 * refuses to run before. Safe to run more than once; see
 * merge-same-products.ts. Each business with anything to say gets its
 * report in the audit stream and a notice in the Owner/Admin inbox.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { mergeSameProducts } = await import("./merge-same-products");
    try {
        const report = await mergeSameProducts(prisma);
        const keptApart = report.reports.reduce(
            (n, r) => n + r.keptApart.length,
            0,
        );
        const dropped = report.reports.reduce(
            (n, r) => n + r.discarded.length,
            0,
        );
        console.log(
            `[merge-same-products] businesses: ${report.organizations}, products joined into another: ${report.productsMerged}, kept apart: ${keptApart}, values dropped: ${dropped}`,
        );
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[merge-same-products] merge failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
