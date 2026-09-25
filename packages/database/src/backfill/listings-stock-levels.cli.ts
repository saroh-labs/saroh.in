/**
 * Run the #510 listings and stock backfill and print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/listings-stock-levels.cli.ts
 *
 * Run it before `20261002100000_catalogue_listings_stock_levels` when that
 * migration stops (a product with no business, or two sharing an address),
 * and once right after it. Safe to run more than once; see
 * listings-stock-levels.ts. The report lists every address it changed.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillListingsStockLevels } =
        await import("./listings-stock-levels");
    try {
        const report = await backfillListingsStockLevels(prisma);
        console.log(
            `[listings-stock-levels] businesses filled in: ${report.organizationsFilled}, addresses changed: ${report.slugsSuffixed.length}, ` +
                (report.tablesPresent
                    ? `listings: ${report.listings}, listed variants: ${report.listingVariants}, stock rows: ${report.stockLevels}, order lines linked: ${report.orderLines}`
                    : "listings and stock skipped (the migration has not run yet)"),
        );
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[listings-stock-levels] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
