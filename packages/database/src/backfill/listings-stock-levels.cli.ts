/**
 * Run the #510 listings and stock backfill and print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/listings-stock-levels.cli.ts
 *
 * Run it before `20261002100000_catalogue_listings_stock_levels` when that
 * migration stops (a product with no business, or two sharing an address),
 * and once right after the migrations (the rollout's step 3,
 * docs/architecture/PRODUCTS_STOCK_ROLLOUT.md). Safe to run more than once; see
 * listings-stock-levels.ts. The report lists every address it changed, and
 * every row whose promised its open lines did not match (step 6).
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
    const { describeHeldStockReport } = await import("./held-stock");
    try {
        const report = await backfillListingsStockLevels(prisma);
        console.log(
            `[listings-stock-levels] businesses filled in: ${report.organizationsFilled}, addresses changed: ${report.slugsSuffixed.length}, ` +
                (report.tablesPresent
                    ? `listings: ${report.listings}, listed variants: ${report.listingVariants}, stock rows: ${report.stockLevels}, order lines linked: ${report.orderLines}`
                    : "listings and stock skipped (the migration has not run yet)"),
        );
        // Step 6, loudly: every row whose promise its open lines did not
        // match — what was capped and what was left for Stock checks.
        const held = report.heldStock
            ? describeHeldStockReport(report.heldStock)
            : [];
        if (held.length > 0) {
            console.warn(
                `[listings-stock-levels] ${held.length} held-stock correction(s): rows whose open lines held more than they promised were capped, oldest order first. Read each one:`,
            );
            for (const line of held) {
                console.warn(`[listings-stock-levels]   ${line}`);
            }
        }
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
