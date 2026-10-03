// INTERNAL — strip before this branch leaves local. Prices and limits are not public.
/**
 * Install the seed catalogue as version 1 on a local or test database that
 * has none (plans catalogue U3). Does nothing once any version exists.
 *
 *     DATABASE_URL=… pnpm exec tsx apps/api.saroh.in/src/cli/install-seed-catalogue.internal.cli.ts
 *
 * The database must pass the seed guard (`assertDatabaseTarget`); a test
 * database by another name needs DATABASE_TARGET_CONFIRM=<its name>.
 * Never on production.
 */
import { SEED_CATALOG, SEED_NOTE } from "@saroh/pricing-catalog/seed";

import { declaredNodeEnv, env } from "../env";

async function main(): Promise<void> {
    if (declaredNodeEnv === "production") {
        throw new Error(
            "Refusing to install the seed catalogue in production.",
        );
    }
    const { assertDatabaseTarget, prisma, disconnectDatabase } =
        await import("@saroh/database");
    const target = assertDatabaseTarget(env.DATABASE_URL);
    const { installFirstCatalogue } =
        await import("../modules/pricing/install-catalogue");
    try {
        const r = await installFirstCatalogue(prisma, {
            catalog: SEED_CATALOG,
            note: SEED_NOTE,
            now: new Date(),
        });
        console.info(
            r.installed
                ? `[seed-catalogue] installed version 1 on ${target.database}`
                : `[seed-catalogue] ${target.database} already has version ${r.version}; nothing written`,
        );
    } finally {
        await disconnectDatabase();
    }
}

main().catch((e: unknown) => {
    console.error(
        "[seed-catalogue] failed:",
        e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
});
