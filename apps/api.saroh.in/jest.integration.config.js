/**
 * INTEGRATION project. DB-backed specs that talk to a real Postgres.
 *
 * Requires TEST_DATABASE_URL pointing at a DEDICATED test database (see
 * .env.test.example). The non-test-DB guard runs in both globalSetup and the
 * per-worker setup, so this can never touch the dev/prod DB.
 *
 * - globalSetup:   validate guard + `prisma db push --force-reset` (fresh schema)
 * - setupFilesAfterEnv: point DATABASE_URL at the test DB; TRUNCATE after each file
 * - maxWorkers 1:  serial, so the between-suite TRUNCATE is race-free
 *
 * @type {import('jest').Config}
 */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    rootDir: ".",
    testMatch: ["<rootDir>/src/modules/**/*.spec.ts"],
    // The organizations module specs mock Prisma (pure unit tests) and run in
    // the default/unit project — keep them out of the DB-backed run.
    testPathIgnorePatterns: ["<rootDir>/src/modules/organizations/"],
    moduleFileExtensions: ["ts", "js", "json"],
    globalSetup: "<rootDir>/test/global-setup.ts",
    globalTeardown: "<rootDir>/test/global-teardown.ts",
    setupFilesAfterEnv: ["<rootDir>/test/integration-setup.ts"],
    maxWorkers: 1,
    // A cold Postgres + schema push can be slow on CI; give suites headroom.
    testTimeout: 30000,
};
