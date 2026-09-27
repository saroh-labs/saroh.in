/**
 * Run the C1 backfill — note allergens become Needs attention Allergy
 * entries — and print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/contact-attention.cli.ts
 *
 * Run it after the migration that adds ContactAttention. Safe to run more
 * than once; see contact-attention.ts.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillContactAttention } = await import("./contact-attention");
    try {
        const report = await backfillContactAttention(prisma);
        console.log(
            `[contact-attention] businesses: ${report.organizations}, Allergy entries made: ${report.created}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[contact-attention] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
