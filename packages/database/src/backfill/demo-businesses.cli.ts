/**
 * Make or refresh the demo salon and gym (DEC-188, #1191). What it writes is
 * in demo-businesses.ts; the runbook is
 * docs/architecture/runbooks/DEMO_BUSINESSES.md.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database db:demo-businesses [--dry-run]
 *
 * `--dry-run` does the same work and rolls it back. Safe to run more than
 * once: a second run adds no row.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    const dryRun = process.argv.includes("--dry-run");
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { makeDemoBusinesses } = await import("./demo-businesses");
    try {
        const report = await makeDemoBusinesses(prisma, { dryRun });
        for (const b of report.businesses) {
            console.log(
                `[demo-businesses]   ${b.name} at ${b.address} (${b.id})`,
            );
        }
        if (report.planOnLiveCatalogue !== true) {
            console.warn(
                `[demo-businesses] warning: ${report.planOnLiveCatalogue === null ? "no catalogue version is live" : "the live catalogue has no Pro plan"}, so the plan override reads as nothing until one is.`,
            );
        }
        console.log(
            `[demo-businesses] ${target.database}: ${dryRun ? "would add" : "added"} ${report.created} row(s)${dryRun ? " — dry run, nothing is written" : ""}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[demo-businesses] failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
