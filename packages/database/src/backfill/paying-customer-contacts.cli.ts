/**
 * Run the C2 backfill — a contact for every paying store customer — and
 * print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/paying-customer-contacts.cli.ts
 *
 * Run it after the migration that adds `CustomerIdentityLink.reason`
 * (20261009160000_customer_link_reason). Safe to run more than once; see
 * paying-customer-contacts.ts.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillPayingCustomerContacts } =
        await import("./paying-customer-contacts");
    try {
        const report = await backfillPayingCustomerContacts(prisma);
        console.log(
            `[paying-customer-contacts] businesses: ${report.organizations}, paying customers without a contact: ${report.unlinked}, contacts made and linked: ${report.made}, left to suggest (a contact already has the email): ${report.suggested}, no usable email: ${report.skipped}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[paying-customer-contacts] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
