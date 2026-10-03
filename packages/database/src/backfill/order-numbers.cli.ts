/**
 * Run the P3 backfill (DEC-066): every business's order-number counter set
 * to its highest ORD-number, and every number two of its orders share given
 * back by the later ones, which take the business's next numbers. The rule
 * is in order-numbers.ts. Prints every order it renumbers.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/order-numbers.cli.ts [--dry-run] [--org <id>]...
 *
 * `--dry-run` does the same work and rolls it back. Take a snapshot first.
 * Safe to run more than once, and while the API serves. Run it after the
 * `20261019100000_order_number_sequence` migration, and again once the API
 * before P3 no longer serves.
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
    const { backfillOrderNumbers, describeOrderNumbersReport } =
        await import("./order-numbers");
    try {
        const report = await backfillOrderNumbers(prisma, {
            organizationIds,
            dryRun,
        });
        for (const line of describeOrderNumbersReport(report)) {
            console.log(`[order-numbers]   ${line}`);
        }
        console.log(
            `[order-numbers] ${target.database}: ${report.organizations} business(es), ${dryRun ? "would set" : "set"} ${report.countersSet} counter(s), ${dryRun ? "would renumber" : "renumbered"} ${report.renumbered.length} order(s)${dryRun ? " — dry run, nothing is written" : ""}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[order-numbers] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
