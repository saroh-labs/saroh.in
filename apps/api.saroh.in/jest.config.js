/**
 * Default / UNIT project. Runs with ZERO database — safe everywhere, always.
 *
 * Covers the pure unit specs under src/common/** and the non-test-DB guard
 * spec under test/**. The DB-backed module specs live in the separate
 * integration project (jest.integration.config.js); they are excluded here so
 * `pnpm test` never needs a Postgres.
 *
 * The organizations module (S1-003) is authorization logic with a mocked
 * Prisma, so its specs are pure unit tests and run here (never touching a DB).
 *
 * @type {import('jest').Config}
 */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    rootDir: ".",
    testMatch: [
        "<rootDir>/src/common/**/*.spec.ts",
        "<rootDir>/src/modules/organizations/**/*.spec.ts",
        // S1-010 projects: project-role precedence + ProjectAccessService
        // acceptance specs, pure unit tests with a jest-mocked Prisma.
        "<rootDir>/src/modules/projects/**/*.spec.ts",
        // S1-009 audit: append-only AuditService + read-authorization specs,
        // pure unit tests with a jest-mocked Prisma (never touch a DB).
        "<rootDir>/src/modules/audit/**/*.spec.ts",
        "<rootDir>/src/modules/feature-flags/**/*.spec.ts",
        // S1-006 store authorization: pure unit specs with mocked Prisma +
        // mocked FeatureFlagService (never touch a DB). Only *.authorization
        // specs run here; the legacy DB-backed stores.service.spec.ts stays in
        // the integration project.
        "<rootDir>/src/modules/stores/**/*.authorization.spec.ts",
        // S2-008 media: MediaService specs with a jest-mocked Prisma AND a fake
        // ObjectStorage port (never touch a DB, R2, or the network).
        "<rootDir>/src/modules/media/**/*.spec.ts",
        "<rootDir>/test/**/*.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
};
