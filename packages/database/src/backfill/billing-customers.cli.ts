/**
 * Run the DEC-165 backfill — every business gets a sync job that makes its
 * one customer at Saroh's billing provider — and print what it did.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
 *     pnpm --filter @saroh/database exec tsx src/backfill/billing-customers.cli.ts
 *
 * Run it once after the deploy that ships migration
 * 20261124110000_billing_customer, against the environment whose API has
 * the Razorpay keys it should use; the API's worker makes the customers.
 * Safe to run more than once (see billing-customers.ts).
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    const target = assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillBillingCustomers } = await import("./billing-customers");
    try {
        const r = await backfillBillingCustomers(prisma);
        console.log(
            `[billing-customers] ${target.database}: businesses: ${r.businesses}, with a customer: ${r.made}, sync waiting: ${r.waiting}, queued now: ${r.queued}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[billing-customers] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
