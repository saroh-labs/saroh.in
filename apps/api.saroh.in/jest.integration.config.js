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
    // The organizations specs mock Prisma (pure unit tests), and the S1-006
    // store *.authorization specs mock Prisma + FeatureFlagService — both run in
    // the default/unit project, so keep them out of the DB-backed run.
    testPathIgnorePatterns: [
        "<rootDir>/src/modules/organizations/",
        "<rootDir>/src/modules/admin/",
        "\\.authorization\\.spec\\.ts$",
        // S5-001: the pure order-state machine and the mocked-Prisma
        // updateStatus guard spec run in the default/unit project (they mock
        // @saroh/database), so keep them out of the DB-backed run. The legacy
        // DB-backed orders.service.spec.ts still runs here.
        "<rootDir>/src/modules/orders/order-state.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.state.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
    globalSetup: "<rootDir>/test/global-setup.ts",
    globalTeardown: "<rootDir>/test/global-teardown.ts",
    setupFilesAfterEnv: ["<rootDir>/test/integration-setup.ts"],
    maxWorkers: 1,
    // A cold Postgres + schema push can be slow on CI; give suites headroom.
    testTimeout: 30000,
};
