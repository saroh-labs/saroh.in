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
        // S2-003 sites: SitesService specs with a jest-mocked Prisma (incl.
        // $transaction) that run the REAL @saroh/templates instantiate against
        // the real starter template — never touch a DB.
        "<rootDir>/src/modules/sites/**/*.spec.ts",
        "<rootDir>/src/modules/domains/**/*.spec.ts",
        // S3-003 jobs: nextBackoff (pure), PrismaJobQueue.fail branch selection
        // (mocked prisma.job), the worker dispatch loop (in-memory FakeJobQueue
        // + real registry), and the registry — all DB-free / timer-free.
        "<rootDir>/src/modules/jobs/**/*.spec.ts",
        // S3-002 forms: FormsService specs with a jest-mocked Prisma — org-scoped
        // form CRUD + field validation authz (never touch a DB).
        "<rootDir>/src/modules/forms/**/*.spec.ts",
        // S3-002 enquiry: EnquiryService specs with a jest-mocked Prisma (incl.
        // $transaction) — the public submit command's acceptance + security
        // cases (isolation, idempotency, validation, rate-limit); no DB, no net.
        "<rootDir>/src/modules/enquiry/**/*.spec.ts",
        // S3-005 CRM: ContactsService, PipelinesService, and LeadsService specs
        // with a jest-mocked Prisma (incl. $transaction) — org-scoped reads,
        // authz (MEMBER denied), tenant isolation (cross-tenant id → 404), and
        // the move-stage atomic STAGE_CHANGED activity. Never touch a DB.
        "<rootDir>/src/modules/contacts/**/*.spec.ts",
        "<rootDir>/src/modules/pipelines/**/*.spec.ts",
        "<rootDir>/src/modules/leads/**/*.spec.ts",
        "<rootDir>/test/**/*.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
};
