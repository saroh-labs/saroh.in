/**
 * Run the plans catalogue U5 backfill — existing businesses keep a plan until
 * a date — and print what it did. Dry run first, always:
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/pricing-grandfather.cli.ts \
 *       --plan grow --until <YYYY-MM-DD> --joined-before <ISO date-time> --dry-run
 *
 * then the same without `--dry-run`. `--until` is the end date the owner
 * sets; `--joined-before` is the moment the release went out, so a business
 * that signs up after it is never grandfathered, however often this runs.
 * Neither has a default. Safe to run more than once: a business that already
 * has a live plan override is left alone. See pricing-grandfather.ts, and
 * docs/architecture/PRICING_ROLLOUT.md for where it sits in the release.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function dateArg(name: string): Date {
    const raw = arg(name);
    if (!raw) throw new Error(`${name} is required.`);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime()))
        throw new Error(`${name} "${raw}" is not a date.`);
    return d;
}

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    const planKey = arg("--plan");
    if (!planKey) throw new Error("--plan is required (e.g. --plan grow).");
    const until = dateArg("--until");
    const joinedBefore = dateArg("--joined-before");
    const dryRun = process.argv.includes("--dry-run");
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillPricingGrandfather } =
        await import("./pricing-grandfather");
    try {
        const r = await backfillPricingGrandfather(prisma, {
            planKey,
            until,
            joinedBefore,
            dryRun,
        });
        console.log(
            `[pricing-grandfather] ${target.database}${dryRun ? " (dry run, nothing written)" : ""}: businesses: ${r.organizations}, ${dryRun ? "would keep" : "kept"} on ${planKey} until ${until.toISOString()}: ${r.grandfathered}, already on a plan override: ${r.alreadyOverridden}, on a plan of their own: ${r.onAPlan}, joined after ${joinedBefore.toISOString()}: ${r.joinedAfter}, deleted: ${r.deleted}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[pricing-grandfather] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
