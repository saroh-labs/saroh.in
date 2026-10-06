/**
 * Run the plans catalogue U12 backfill — every business without a
 * subscription gets its Free row — and print what it did. After the U5
 * grandfather backfill, and dry run first, always:
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/pricing-free-subscriptions.cli.ts \
 *       --plan free --grandfathered-before <the grandfather run's --joined-before> --dry-run
 *
 * then the same without `--dry-run`. A business that joined before the
 * cutoff and has no plan override is left alone (reported as "not
 * grandfathered yet"), so running it early never puts an existing business
 * on Free. Safe to run more than once. See pricing-free-subscriptions.ts and
 * docs/architecture/PRICING_ROLLOUT.md.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    const planId = arg("--plan");
    if (!planId) throw new Error("--plan is required (e.g. --plan free).");
    const raw = arg("--grandfathered-before");
    if (!raw) throw new Error("--grandfathered-before is required.");
    const grandfatheredBefore = new Date(raw);
    if (Number.isNaN(grandfatheredBefore.getTime())) {
        throw new Error(`--grandfathered-before "${raw}" is not a date.`);
    }
    const dryRun = process.argv.includes("--dry-run");
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillFreeSubscriptions } =
        await import("./pricing-free-subscriptions");
    try {
        const r = await backfillFreeSubscriptions(prisma, {
            planId,
            grandfatheredBefore,
            dryRun,
        });
        console.log(
            `[pricing-free-subscriptions] ${target.database}${dryRun ? " (dry run, nothing written)" : ""}: businesses: ${r.organizations}, ${dryRun ? "would start" : "started"} on ${planId}: ${r.started}, with a subscription already: ${r.hasSubscription}, not grandfathered yet: ${r.notGrandfathered}, deleted: ${r.deleted}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[pricing-free-subscriptions] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
