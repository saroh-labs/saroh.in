/**
 * Repair what open orders hold against each shelf row's promised (#510,
 * #511) on a database that already has it wrong. The rule is in
 * held-stock.ts: a row whose open lines hold more than it promised shares
 * what it promised out oldest order first, and a line left with nothing
 * stops holding (stockRow NONE); a row promising more than its lines hold is
 * only reported. Prints every row and line it finds and what it did.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/held-stock.cli.ts [--dry-run] [--org <id>]...
 *
 * `--dry-run` does the same work and rolls it back. Take a snapshot first.
 * Safe to run more than once: a second run finds nothing to do.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

function orgsFrom(argv: readonly string[]): string[] | undefined {
    const orgs: string[] = [];
    argv.forEach((arg, i) => {
        const next = argv[i + 1];
        if (arg === "--org" && next) orgs.push(next);
    });
    return orgs.length > 0 ? orgs : undefined;
}

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    const dryRun = process.argv.includes("--dry-run");
    const organizationIds = orgsFrom(process.argv);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const {
        describeHeldStockMismatches,
        describeHeldStockReport,
        heldStockMismatches,
        reconcileHeldStock,
    } = await import("./held-stock");
    try {
        const before = await heldStockMismatches(prisma, organizationIds);
        console.log(
            `[held-stock] ${target.database}: ${before.rows.length} row(s) whose promised is not what their open lines hold, ${before.lines.length} line(s) holding units they can't${dryRun ? " — dry run, nothing is written" : ""}`,
        );
        for (const line of describeHeldStockMismatches(before)) {
            console.log(`[held-stock]   ${line}`);
        }
        const report = await reconcileHeldStock(prisma, {
            organizationIds,
            dryRun,
        });
        for (const line of describeHeldStockReport(report)) {
            console.log(`[held-stock] ${line}`);
        }
        const unheld = report.capped.reduce(
            (n, r) => n + r.lines.filter((l) => l.unheld).length,
            0,
        );
        const after = await heldStockMismatches(prisma, organizationIds);
        console.log(
            `[held-stock] ${dryRun ? "would cap" : "capped"} ${report.capped.length} row(s) (${unheld} line(s) now hold nothing), ${dryRun ? "would clear" : "cleared"} ${report.strayLinesCleared.length} line(s), left ${report.promisedMore.length} row(s) for Stock checks. Mismatched rows now: ${after.rows.length}.`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[held-stock] repair failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
