/**
 * Run the F16 backfill — every storefront member on the business's team, as
 * "Storefront team" — and print what it did, in counts only (no names).
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/store-members-to-memberships.cli.ts
 *
 * Run it after a verified snapshot, and after the release that ships F16's
 * API (so new storefront invites join the same way). Safe to run more than
 * once; see store-members-to-memberships.ts.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillStoreMembersToMemberships } =
        await import("./store-members-to-memberships");
    try {
        const report = await backfillStoreMembersToMemberships(prisma);
        console.log(
            `[store-members-to-memberships] businesses: ${report.organizations}, storefront people: ${report.people}, added to the team as Storefront team: ${report.joined}, already on the team (left as they are): ${report.alreadyOnTeam}, businesses skipped (their storefront-team role holds more than the narrow list): ${report.skippedOrganizations}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[store-members-to-memberships] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
