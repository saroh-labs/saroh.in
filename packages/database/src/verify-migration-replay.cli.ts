import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { assertDatabaseTarget } from "./database-target";
import { loadEnvFallback } from "./load-env";

/**
 * Prove that the migration history still builds a correct database from empty.
 *
 * Two failures this catches, both of which have actually shipped here:
 *
 * **The chain does not replay.** Three RLS migrations were timestamped before
 * the migrations creating the tables they targeted, so they only ever succeeded
 * where the finished schema already existed (`eb6ce65`, issue #146). Every
 * environment built incrementally was fine; the first genuinely fresh database
 * was not — which is every new environment, every restore, and every shadow
 * database `prisma migrate dev` builds.
 *
 * **The datamodel and the migrations disagree.** `20260905000000_booking_outcome`
 * created `Booking_organizationId_outcome_endAt_idx` without declaring it in
 * `schema.prisma`. Prisma reads an index present in the database but absent
 * from the datamodel as drift, so the next `migrate dev` any developer ran
 * would generate a migration DROPPING the index the workflow depends on.
 *
 * Neither is visible to the rest of CI, because the integration suite builds
 * its database with `prisma db push` — which reads `schema.prisma` directly and
 * never executes a migration file at all.
 *
 * Requires an EMPTY database and refuses to run against one holding tables, so
 * it can never be pointed at a database with data in it by mistake.
 */
loadEnvFallback();

const packageRoot = resolve(__dirname, "..");
const schemaPath = resolve(packageRoot, "prisma", "schema.prisma");

function prisma(args: readonly string[]): string {
    return execFileSync("npx", ["prisma", ...args], {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function fail(message: string): never {
    console.error(`\n${message}\n`);
    process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
    fail(
        "DATABASE_URL is not set. This check needs an empty, throwaway database — " +
            "never the development or production one.",
    );
}

// The same guard the migrate/seed scripts use. A throwaway database is not in
// the allow-list by design, so the caller names it explicitly:
//
//   DATABASE_TARGET_CONFIRM=saroh_migrate_check pnpm db:verify:replay
const target = assertDatabaseTarget();

// Refuse anything that is not empty. `migrate deploy` onto a database that
// already has tables is not a replay — it is whatever the recorded migration
// state happens to allow, which is the incremental path that hid #146.
const introspected = (() => {
    try {
        return prisma([
            "migrate",
            "diff",
            "--from-config-datasource",
            "--to-empty",
            "--script",
        ]);
    } catch (error) {
        fail(
            `Could not read the target database.\n${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
})();

// A diff from the live database TO empty is the SQL that would tear it down.
// For a genuinely empty database that script has nothing to drop.
if (/\b(DROP|ALTER)\b/i.test(introspected)) {
    fail(
        `"${target.database}" on ${target.host} is not empty.\n` +
            "This check replays the whole migration history and must start from " +
            "nothing. Create a scratch database and point DATABASE_URL at it.",
    );
}

console.log(
    `Replaying the migration history into empty database "${target.database}" on ${target.host}...`,
);

try {
    console.log(prisma(["migrate", "deploy"]).trim());
} catch (error) {
    fail(
        "The migration history does NOT build a working database from empty.\n" +
            "This is what provisioning a new environment, restoring a backup, and " +
            "`prisma migrate dev`'s shadow database all do.\n\n" +
            (error instanceof Error ? error.message : String(error)),
    );
}

// The replayed database must now match the datamodel exactly. Exit code 2 means
// a difference was found; 0 means none.
try {
    prisma([
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        schemaPath,
        "--exit-code",
    ]);
} catch {
    const summary = prisma([
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        schemaPath,
    ]);
    fail(
        "The replayed database does not match schema.prisma.\n\n" +
            `${summary.trim()}\n\n` +
            "The migrations and the datamodel have drifted apart. Whatever the " +
            "migrations create must also be declared in schema.prisma, or the next " +
            "`prisma migrate dev` will generate a migration undoing it.",
    );
}

console.log(
    "\nMigration history replays from empty and matches schema.prisma exactly.",
);
