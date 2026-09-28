/**
 * Run the E12 backfill — the MODULE_CLASS_PACKS rollout flag, and a
 * CLASS_PACKS row for every business — and print what it did.
 *
 *   DATABASE_URL=... pnpm --filter @saroh/database exec tsx src/backfill/class-packs-module.cli.ts
 *
 * No migration goes with it. Run it BEFORE deploying the API that gates
 * packs on CLASS_PACKS. Safe to run more than once; see class-packs-module.ts.
 */
import { assertDatabaseTarget } from "../database-target";
import { loadEnvFallback } from "../load-env";

loadEnvFallback();

async function main() {
    assertDatabaseTarget(process.env.DATABASE_URL);
    // Imported after the target check: the client reads DATABASE_URL when it
    // loads.
    const { prisma, disconnectDatabase } = await import("../client");
    const { backfillClassPacksModule } = await import("./class-packs-module");
    try {
        const r = await backfillClassPacksModule(prisma);
        const flag = r.flag.registered
            ? `registered (${r.flag.enabledByDefault ? "on" : "off"} for everyone, ${r.flag.overridesCopied} business overrides copied from MODULE_APPOINTMENTS)`
            : "already registered, left alone";
        console.log(
            `[class-packs-module] flag: ${flag}; businesses: ${r.organizations}, turned on (has packs): ${r.enabled}, held off (has packs, Appointments off): ${r.heldOff}, off (no packs): ${r.disabled}, already had a row: ${r.kept}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[class-packs-module] backfill failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
