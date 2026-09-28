/**
 * Run the D22 backfill — every Razorpay connection gets its public key id —
 * and print what it did.
 *
 *   DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> PAYMENTS_ENC_KEY=... \
 *     pnpm --filter @saroh/database exec tsx src/backfill/razorpay-public-keys.cli.ts
 *
 * `PAYMENTS_ENC_KEY` is the API's own, for the same environment: it opens
 * the sealed key ids. Safe to run more than once, and while the API serves;
 * see razorpay-public-keys.ts. No migration: `publicKey` already exists.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";
import { openerFor, paymentsKey } from "./sealed-credentials";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Before connecting: a missing or malformed key stops the run here. A
    // one-off command run by hand, never by a turbo task, so the key stays
    // out of turbo's env list (and out of its cache hash).
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    const open = openerFor(paymentsKey(process.env.PAYMENTS_ENC_KEY));
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillRazorpayPublicKeys } =
        await import("./razorpay-public-keys");
    try {
        const report = await backfillRazorpayPublicKeys(prisma, open);
        console.log(
            `[razorpay-public-keys] Razorpay connections: ${report.connections}, public keys filled: ${report.filled}, already set: ${report.unchanged}, unreadable: ${report.unreadable.length}`,
        );
        if (report.unreadable.length > 0) {
            // Ids only — never the blob or anything opened from it.
            console.log(
                `[razorpay-public-keys] could not read the key id of: ${report.unreadable.join(", ")}`,
            );
        }
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[razorpay-public-keys] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
