/**
 * Delete page views stored under a private page, and their `path` rollup
 * rows (U15 privacy review, #1099). The rule is in private-path-views.ts.
 * Prints counts only, never a business, a path or a visitor.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/private-path-views.cli.ts [--apply]
 *
 * Without `--apply` it is a DRY RUN: it counts what it would delete and
 * writes nothing. Run it after the API with the privacy review's contract
 * is deployed (so no new private view can land), in a one-off container
 * from the API image, never inside the serving API: dry run, then
 * `--apply`, then a dry run again that must find 0. Safe to run more than
 * once and while the API serves. A business on legal hold keeps its rows.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    const apply = process.argv.includes("--apply");
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { purgePrivatePathViews, describePrivatePathPurge } =
        await import("./private-path-views");
    try {
        const report = await purgePrivatePathViews(prisma, { apply });
        for (const line of describePrivatePathPurge(report, apply)) {
            console.log(`[private-path-views]   ${line}`);
        }
        console.log(
            `[private-path-views] ${target.database}: ${apply ? "applied" : "dry run — run again with --apply to delete"}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[private-path-views] failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
