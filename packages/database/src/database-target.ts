/**
 * Refuse to seed or migrate a database nobody asked for.
 *
 * The repository configures two different Neon projects. `packages/database/
 * .env` and `apps/api.saroh.in/.env` both point at `saroh-dev`, the database the
 * running application reads. The root `.env` points at `neondb` — a different
 * project on a different host.
 *
 * `DATABASE_URL` is listed in turbo's `globalEnv`, and `dotenv` never overwrites
 * a variable that is already set, so whichever value is in the shell wins:
 *
 *   clean shell                  -> saroh-dev   (correct)
 *   after `set -a; . ./.env`     -> neondb      (a different project)
 *
 * Sourcing the root `.env` is part of the normal local-dev flow, so which
 * database `pnpm db:seed` writes to depends on what the developer happened to
 * type earlier in that terminal. A seed against the wrong database is not
 * recoverable without a restore.
 *
 * This makes the target explicit instead of ambient. It never reads or logs
 * credentials — only the host and database name, both of which are already
 * visible in any error message Postgres returns.
 */

/**
 * Database names each `NODE_ENV` may write to. Names, not URLs: nothing here is
 * a secret, and it can be reviewed in a diff.
 *
 * Production is deliberately absent. Its name is not guessed — writing to any
 * database not listed here requires naming it explicitly via
 * `DATABASE_TARGET_CONFIRM`, which is impossible to do by accident.
 */
// `| undefined` in the value type is load-bearing, not defensive: most keys
// (`production` among them) are genuinely absent, and without it TypeScript
// reports the lookup as always-defined — the project does not set
// `noUncheckedIndexedAccess`, so an index into a Record is typed as a hit.
const ALLOWED_BY_ENV: Readonly<Record<string, readonly string[] | undefined>> =
    {
        development: ["saroh-dev"],
        test: ["saroh-test", "saroh-dev"],
    };

/** Escape hatch: must exactly equal the database name being written to. */
const CONFIRM_VAR = "DATABASE_TARGET_CONFIRM";

export interface DatabaseTarget {
    /** Database name, e.g. `saroh-dev`. */
    database: string;
    /** Host without its domain suffix, e.g. `ep-autumn-mouse-a1dr0mtz-pooler`. */
    host: string;
}

/** Parse the connection string into its non-secret parts. */
export function resolveDatabaseTarget(
    url: string | undefined = process.env.DATABASE_URL,
): DatabaseTarget {
    if (!url) {
        throw new Error(
            "DATABASE_URL is not set. Refusing to run against an unknown database.",
        );
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        // Deliberately does not echo the value — it contains the password.
        throw new Error("DATABASE_URL is not a valid connection string.");
    }

    const database = parsed.pathname.replace(/^\//, "");
    if (!database) {
        throw new Error("DATABASE_URL names no database.");
    }

    return { database, host: parsed.hostname.split(".")[0] ?? parsed.hostname };
}

/**
 * Throw unless the resolved database is one this environment may write to.
 * Call before any destructive or schema-changing operation.
 */
export function assertDatabaseTarget(
    url: string | undefined = process.env.DATABASE_URL,
    nodeEnv: string = process.env.NODE_ENV ?? "development",
    confirm: string | undefined = process.env[CONFIRM_VAR],
): DatabaseTarget {
    const target = resolveDatabaseTarget(url);

    // Explicit confirmation wins, but only for the exact database named. This
    // is how production, or any new database, is written to on purpose.
    if (confirm !== undefined && confirm.length > 0) {
        if (confirm === target.database) return target;
        throw new Error(
            `${CONFIRM_VAR} is set to "${confirm}" but DATABASE_URL resolves to ` +
                `"${target.database}" on ${target.host}. Refusing to continue — ` +
                `the confirmation must name the database actually being written to.`,
        );
    }

    const allowed = ALLOWED_BY_ENV[nodeEnv];
    if (allowed?.includes(target.database)) return target;

    const expected = allowed
        ? `Allowed for NODE_ENV=${nodeEnv}: ${allowed.join(", ")}.`
        : `No databases are allow-listed for NODE_ENV=${nodeEnv}.`;

    throw new Error(
        `Refusing to write to "${target.database}" on ${target.host}.\n` +
            `${expected}\n` +
            `If this is deliberate, name it: ${CONFIRM_VAR}=${target.database} <command>`,
    );
}
