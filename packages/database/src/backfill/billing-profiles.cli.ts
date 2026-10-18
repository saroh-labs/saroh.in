/**
 * Run the DEC-167 backfill — every billing profile without its customer at
 * Saroh's billing provider gets a sync job that makes it — and print what
 * it did, with the businesses that haven't chosen a profile yet.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/billing-profiles.cli.ts
 *
 * Run it after the deploy that ships the billing profiles migration, once
 * the API has the Razorpay keys it should use (`PRICING_ROLLOUT.md`); the
 * API's worker makes or adopts the customers. Safe to run more than once
 * (see billing-profiles.ts): run it again once the jobs have run to see
 * `queued now: 0`, and to queue any whose sync failed.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillBillingProfiles } = await import("./billing-profiles");
    try {
        const r = await backfillBillingProfiles(prisma);
        console.log(
            `[billing-profiles] ${target.database}: profiles: ${r.profiles}, with a customer: ${r.made}, sync waiting: ${r.waiting}, queued now: ${r.queued}`,
        );
        console.log(
            `[billing-profiles] ${target.database}: businesses with no billing profile yet: ${r.businessesWithoutProfile} (an owner chooses one in Plan & billing before paying)`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[billing-profiles] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
