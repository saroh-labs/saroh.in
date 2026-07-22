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
        // #112 (ADR-003) capabilities: the pure module-registry validator —
        // uniqueness, dependency validity, cycle detection, absolute routes,
        // known rollout/entitlement keys, and the AI exclusion (DEC-015). No
        // Prisma, no DB, no network.
        "<rootDir>/src/modules/capabilities/**/*.spec.ts",
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
        // S3-006 notifications: the enquiry.notify job handler (durable "notify
        // once" idempotency + email) and the NotificationsService read/mark-read
        // authorization + tenant-isolation specs, with a jest-mocked Prisma and a
        // mocked email fn — no DB, no SMTP, no network.
        "<rootDir>/src/modules/notifications/**/*.spec.ts",
        // S4-002 bookings: the PURE availability geometry (tz-aware slots, DST
        // boundaries, buffers, capacity) and BookingsService specs with a
        // jest-mocked Prisma (incl. serializable $transaction) — the public
        // booking command's capacity-one race, idempotency, org-from-Service,
        // rate-limit, cancel, and management authz. Never touch a DB, no network.
        "<rootDir>/src/modules/bookings/**/*.spec.ts",
        // S5-001 orders lifecycle: the PURE order-state state machine and the
        // OrdersService.updateStatus guard spec with a jest-mocked Prisma (never
        // touch a DB). The legacy DB-backed orders.service.spec.ts stays in the
        // integration project; these two named specs run here.
        "<rootDir>/src/modules/orders/order-state.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.state.spec.ts",
        // S5-002 payments: AES-256-GCM credential crypto (round-trip, tamper,
        // missing-key) and PaymentsService specs with a jest-mocked Prisma
        // (incl. $transaction) + a fake MerchantProvider — connect stores only
        // ciphertext, createIntent derives amountCents server-side from the
        // Order, idempotent replay, cross-tenant 404, and payment authz. Never
        // touch a DB or the network.
        "<rootDir>/src/modules/payments/**/*.spec.ts",
        // S5-003 webhooks: the signed webhook inbox + exactly-once reconciliation
        // — signature verify (valid HMAC passes, forged 401s with no row written),
        // idempotent inbox (duplicate P2002 → 200 no-op, state moved once), the
        // reconcile state machine (illegal transition rejected), and refund
        // settlement. Jest-mocked Prisma (incl. $transaction) + a fake webhook
        // provider; never touch a DB or the network.
        "<rootDir>/src/modules/webhooks/**/*.spec.ts",
        // S6-001 communications: AES-256-GCM-sealed provider connect (only
        // ciphertext stored, redacted reads), the consent gate (REVOKED →
        // SUPPRESSED, no job/delivery), atomic Message+Delivery+Job send, and
        // the message.send handler (fake provider, QUEUED→SENT, failure→FAILED,
        // idempotent re-run). Jest-mocked Prisma (incl. $transaction) + a fake
        // CommsProvider; never touch a DB or the network.
        "<rootDir>/src/modules/communications/**/*.spec.ts",
        // S6-004 self-test: the account-level template-preview send — recipient
        // hard-bound to the session user's own verified email (never the body),
        // unverified refused, per-user rate limit -> 429, and the `[Saroh test]`
        // label. Jest-mocked email helper; never touch SMTP or the network.
        "<rootDir>/src/modules/self-test/**/*.spec.ts",
        // S6-003 automations: the AutomationsService CRUD + config-validation
        // authz specs (MEMBER denied, cross-tenant 404, action/config pairing)
        // and the automation.run handler (the AutomationRun once-per-(rule,lead)
        // ledger, disabled rules skipped, send.message via the system send,
        // create.task activity, and FAILED-run capture). Jest-mocked Prisma
        // (incl. $transaction) + a mocked CommunicationsService; never touch a DB.
        "<rootDir>/src/modules/automations/**/*.spec.ts",
        // S7-002 analytics: the versioned event contract validators, the intake
        // command (public site.view + org events, consent + retention stamping,
        // at-least-once dedupe), and the org-safe daily aggregate job. Jest-mocked
        // Prisma; never touch a DB or the network.
        "<rootDir>/src/modules/analytics/**/*.spec.ts",
        // S7-005 billing: the EntitlementService (plan-limit enforcement), the
        // plans/subscriptions service (authz, one-sub-per-org), the billing
        // provider adapters (credential separation from merchant payments), and
        // the billing webhook inbox (signature-before-write, idempotent replay).
        // Jest-mocked Prisma + fake provider; never touch a DB or the network.
        "<rootDir>/src/modules/billing/**/*.spec.ts",
        "<rootDir>/test/**/*.spec.ts",
        // #90 (S0-011) API bootstrap smoke test: compiles the full AppModule DI
        // graph so "the app doesn't even start" (the 0fc8f72 boot crash class)
        // is caught. compile() resolves every provider without a DB — see the
        // spec header for why it lives in the no-database unit project.
        "<rootDir>/src/app.bootstrap.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
};
