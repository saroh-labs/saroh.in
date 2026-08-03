/**
 * Dev database seed (#136).
 *
 * Builds one believable organization — Northwind Supply, a hybrid business that
 * both sells products and takes bookings — with a working login, capabilities in
 * mixed readiness states, and enough volume that every screen has something real
 * on it.
 *
 * The previous fixture left the product unreviewable: 0 contacts, 0 services,
 * 0 bookings, 3 products, and a demo user with no credential, so nobody could
 * even sign in as it. A UX audit run against that data reported "onboarding
 * enables all eight modules by default" — a conclusion drawn from a bootstrap
 * script's leftovers rather than from the product, which defaults every module
 * to DISABLED. Unrealistic fixtures do not merely look sparse; they generate
 * confident, wrong findings.
 *
 * IDEMPOTENT and REVERSIBLE. Every row is upserted on a `seed_`-prefixed id, so
 * re-running changes nothing and `--reset` removes exactly what was seeded and
 * nothing a developer added by hand.
 *
 *   pnpm --filter @saroh/database db:seed
 *   pnpm --filter @saroh/database db:seed:reset
 *
 * The target database is checked before any write — see `database-target.ts`.
 */
import { loadEnvFallback } from "./load-env";

loadEnvFallback();

if (!process.env.DATABASE_URL) {
    console.error(
        "[seed] DATABASE_URL is not set (and no packages/database/.env found). " +
            "Point DATABASE_URL at a local/dev database and re-run.",
    );
    process.exit(1);
}

async function main() {
    // Imported lazily so the database-target guard inside runs before the
    // Prisma client is constructed — the pg adapter reads DATABASE_URL at
    // module-eval time.
    const { seed, reset } = await import("./seed/run");
    if (process.argv.includes("--reset")) {
        await reset();
        return;
    }
    await seed();
}

main()
    .catch((error: unknown) => {
        console.error(
            `\n[seed] ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    })
    .finally(() => {
        void import("./client").then(({ prisma }) => prisma.$disconnect());
    });
