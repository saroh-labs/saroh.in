/**
 * Non-test-DB guard.
 *
 * Integration tests touch a REAL Postgres. This guard makes it impossible to
 * point them at the dev or prod database by accident. It is deliberately
 * dependency-free so both Jest `globalSetup` and any per-worker bootstrap can
 * import it before anything opens a connection.
 *
 * Rules (all must hold, else we throw and abort):
 *   1. `TEST_DATABASE_URL` must be set explicitly. We NEVER fall back to
 *      `DATABASE_URL` — that is exactly the mistake we are guarding against.
 *   2. The database name must carry a test marker (contains "test", which
 *      also covers the conventional `_test` suffix).
 *   3. It must not be the same connection as `DATABASE_URL` (when present):
 *      neither string-identical, nor resolving to the same host+port+db.
 */

function databaseName(parsed: URL): string {
    return parsed.pathname.replace(/^\//, "").split("?")[0];
}

/**
 * Validate the test database URL. Returns the validated `TEST_DATABASE_URL` on
 * success; throws a clear, actionable error otherwise.
 */
export function assertTestDatabase(
    env: NodeJS.ProcessEnv = process.env,
): string {
    const testUrl = env.TEST_DATABASE_URL?.trim();
    if (!testUrl) {
        throw new Error(
            "[db-guard] TEST_DATABASE_URL is not set. Integration tests require a " +
                "DEDICATED test database and will NOT fall back to DATABASE_URL. " +
                "Set e.g. TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saroh_test " +
                "(see apps/api.saroh.in/.env.test.example).",
        );
    }

    let parsed: URL;
    try {
        parsed = new URL(testUrl);
    } catch {
        throw new Error(
            "[db-guard] TEST_DATABASE_URL is not a valid connection URL.",
        );
    }

    const dbName = databaseName(parsed);
    if (!dbName) {
        throw new Error(
            "[db-guard] TEST_DATABASE_URL must include a database name.",
        );
    }
    if (!/test/i.test(dbName)) {
        throw new Error(
            `[db-guard] Refusing to run: TEST_DATABASE_URL database "${dbName}" is not a ` +
                'recognized test database. Its name must contain "test" (e.g. "saroh_test"). ' +
                "This prevents tests from ever running against a dev/prod database.",
        );
    }

    const prodUrl = env.DATABASE_URL?.trim();
    if (prodUrl) {
        if (prodUrl === testUrl) {
            throw new Error(
                "[db-guard] Refusing to run: TEST_DATABASE_URL is identical to DATABASE_URL.",
            );
        }
        try {
            const prodParsed = new URL(prodUrl);
            if (
                prodParsed.host === parsed.host &&
                databaseName(prodParsed) === dbName
            ) {
                throw new Error(
                    "[db-guard] Refusing to run: TEST_DATABASE_URL resolves to the same " +
                        `host+database (${parsed.host}/${dbName}) as DATABASE_URL.`,
                );
            }
        } catch (err) {
            // Re-throw our own guard failure; ignore an unparseable DATABASE_URL
            // (rule 1/2 already proved TEST_DATABASE_URL itself is a test DB).
            if (err instanceof Error && err.message.startsWith("[db-guard]")) {
                throw err;
            }
        }
    }

    return testUrl;
}
