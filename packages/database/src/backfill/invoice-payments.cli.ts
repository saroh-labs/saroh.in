/**
 * Run the invoice ledger backfill (DEC-173, #1113): every invoice already
 * paid, except an order's, gets one payment for its full total with its
 * method and date, and its `paidCents` from that row. The rule is in
 * invoice-payments.ts. Prints every paid invoice it has to leave without a
 * payment, and why.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/invoice-payments.cli.ts [--dry-run] [--org <id>]...
 *
 * `--dry-run` does the same work and rolls it back. Take a snapshot first.
 * Safe to run more than once, and while the API serves. Run it after the
 * `20261206110000_invoice_payments_ledger` migration, and again once every
 * path that pays an invoice writes the ledger (U3): an invoice the older API
 * marked paid in between gets its row then.
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
    const { backfillInvoicePayments, describeInvoicePaymentsReport } =
        await import("./invoice-payments");
    try {
        const report = await backfillInvoicePayments(prisma, {
            organizationIds,
            dryRun,
        });
        for (const line of describeInvoicePaymentsReport(report)) {
            console.log(`[invoice-payments]   ${line}`);
        }
        console.log(
            `[invoice-payments] ${target.database}: ${report.organizations} business(es), ${dryRun ? "would write" : "wrote"} ${report.written} payment(s), ${report.skipped.length} paid invoice(s) left without one${dryRun ? " — dry run, nothing is written" : ""}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[invoice-payments] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
