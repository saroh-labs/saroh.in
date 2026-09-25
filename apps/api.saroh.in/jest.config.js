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
    // sanitize-html 2.17.7 uses ESM-only HTML parser packages. Node 24 loads
    // them natively; Jest's CommonJS runtime needs them transformed too.
    transform: {
        "^.+\\.[tj]s$": ["ts-jest", { tsconfig: { allowJs: true } }],
    },
    transformIgnorePatterns: [
        "node_modules/(?!(?:\\.pnpm/)?(?:htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities)(?:@|/))",
    ],
    testEnvironment: "node",
    rootDir: ".",
    // `*.db.spec.ts` needs Postgres and runs only in the integration project.
    testPathIgnorePatterns: ["/node_modules/", "\\.db\\.spec\\.ts$"],
    testMatch: [
        "<rootDir>/src/common/**/*.spec.ts",
        "<rootDir>/src/modules/organizations/**/*.spec.ts",
        // S1-010 projects: project-role precedence + ProjectAccessService
        // acceptance specs, pure unit tests with a jest-mocked Prisma.
        "<rootDir>/src/modules/projects/**/*.spec.ts",
        // S1-009 audit: append-only AuditService + read-authorization specs,
        // pure unit tests with a jest-mocked Prisma (never touch a DB).
        "<rootDir>/src/modules/audit/**/*.spec.ts",
        // Internal control plane: fixed staff permissions, admin read models,
        // and services with mocked Prisma. Never touch a DB.
        "<rootDir>/src/modules/admin/**/*.spec.ts",
        "<rootDir>/src/modules/feature-flags/**/*.spec.ts",
        // #119 Home aggregator: pure ranking with mocked availability + counts.
        "<rootDir>/src/modules/home/**/*.spec.ts",
        // U4 Business Calendar: the pure month bucketing and schedules, and
        // the per-layer service with mocked availability + Prisma.
        // calendar.db.spec.ts needs Postgres and runs in integration.
        "<rootDir>/src/modules/calendar/**/*.spec.ts",
        // #123 provider health: state derivation + credential redaction, mocked
        // Prisma.
        "<rootDir>/src/modules/provider-health/**/*.spec.ts",
        // #140 health: liveness/readiness with a jest-mocked Prisma — proves
        // readiness FAILS on an unreachable database, an unfinished migration,
        // and an unreadable queue. Never touches a DB.
        "<rootDir>/src/modules/health/**/*.spec.ts",
        // #124 saved views + safe bulk contract (mocked Prisma / pure helper).
        "<rootDir>/src/modules/saved-views/**/*.spec.ts",
        // Command-palette cross-entity search: per-entity permission gating,
        // org scoping, result caps and href construction. Mocked Prisma.
        "<rootDir>/src/modules/search/**/*.spec.ts",
        // #112 (ADR-003) capabilities: the pure module-registry validator —
        // uniqueness, dependency validity, cycle detection, absolute routes,
        // known rollout/entitlement keys, and the AI exclusion (DEC-015). No
        // Prisma, no DB, no network. (module-backfill.spec.ts is DB-backed and
        // runs only in the integration project.)
        "<rootDir>/src/modules/capabilities/module-registry.spec.ts",
        // #114 capabilities services: availability composition, lifecycle
        // commands, and the readiness registry — all with mocked Prisma/flags/
        // entitlements (no DB, no network).
        "<rootDir>/src/modules/capabilities/module-availability.service.spec.ts",
        "<rootDir>/src/modules/capabilities/module-lifecycle.service.spec.ts",
        "<rootDir>/src/modules/capabilities/readiness/module-readiness.registry.spec.ts",
        // #115 module API controller (mocked services).
        "<rootDir>/src/modules/capabilities/capabilities.controller.spec.ts",
        // #117 dark module-enforcement guard (mocked reflector + availability).
        "<rootDir>/src/modules/capabilities/module-enforcement.guard.spec.ts",
        // #274 the same guard with the REAL availability service, per role:
        // which roles reach which module under MODULE_ENFORCEMENT (mocked I/O).
        "<rootDir>/src/modules/capabilities/module-enforcement.roles.spec.ts",
        // S1-006 store authorization: pure unit specs with mocked Prisma +
        // mocked FeatureFlagService (never touch a DB). Only *.authorization
        // specs run here; the legacy DB-backed stores.service.spec.ts stays in
        // the integration project.
        "<rootDir>/src/modules/stores/**/*.authorization.spec.ts",
        // ADR-006: one storefront per business, with a mocked Prisma.
        "<rootDir>/src/modules/stores/stores.service.create-cap.spec.ts",
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
        // #120 customer workspace: identity-link safety (never by name, org-
        // scoped) + module-gated timeline, with a jest-mocked Prisma.
        "<rootDir>/src/modules/customer-workspace/**/*.spec.ts",
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
        // U3 staff: the pure hours rules and StaffService with a jest-mocked
        // Prisma. staff.db.spec.ts needs Postgres and runs in integration.
        "<rootDir>/src/modules/staff/**/*.spec.ts",
        // S5-001 orders lifecycle: the PURE order-state state machine and the
        // OrdersService.updateStatus guard spec with a jest-mocked Prisma (never
        // touch a DB). The legacy DB-backed orders.service.spec.ts stays in the
        // integration project; these two named specs run here.
        // #175 CSV import: the PURE planning core (what an import will do)
        // and the CSV boundary. Neither touches a DB.
        "<rootDir>/src/modules/imports/**/*.spec.ts",
        // The customer list's aggregation — order count, what was paid, when
        // they last bought — is pure serialization over rows handed to it.
        "<rootDir>/src/modules/customers/serialize.spec.ts",
        "<rootDir>/src/modules/customers/customers.service.remove.spec.ts",
        "<rootDir>/src/modules/orders/order-state.spec.ts",
        // ADR-008 kitchen flow (U6): the pure stage machine, refund-by-line
        // arithmetic, the order read's money hiding, and the kitchen service
        // with a jest-mocked Prisma.
        "<rootDir>/src/modules/orders/order-stage.spec.ts",
        "<rootDir>/src/modules/orders/order-refunds.spec.ts",
        "<rootDir>/src/modules/orders/order-read.spec.ts",
        "<rootDir>/src/modules/orders/order-kitchen.service.spec.ts",
        // Products v2: MRP, saving, shop switches and detail coherence — pure.
        "<rootDir>/src/modules/products/product-rules.spec.ts",
        "<rootDir>/src/modules/products/product-overview.spec.ts",
        // #517 photos and videos: limits, kind/type match, posters from the
        // library, with a jest-mocked Prisma.
        "<rootDir>/src/modules/products/product-images.service.spec.ts",
        // #530 the merge report: Owner/Admin only, with a mocked Prisma.
        "<rootDir>/src/modules/products/merge-report.service.spec.ts",
        // #513 the stock log's words and arithmetic — pure.
        "<rootDir>/src/modules/stock/stock-words.spec.ts",
        // #514 the Stock API: sign-in, organization and COMMERCE gates.
        "<rootDir>/src/modules/stock/stock.gate.spec.ts",
        "<rootDir>/src/modules/catalogue/catalogue-defaults.spec.ts",
        "<rootDir>/src/modules/catalogue/sku-pattern.spec.ts",
        "<rootDir>/src/modules/catalogue/field-rules.spec.ts",
        "<rootDir>/src/modules/products/products.gate.spec.ts",
        // #516 collections: the gate and who may change them, and the
        // website-pages scanner — no database.
        "<rootDir>/src/modules/collections/collections.gate.spec.ts",
        "<rootDir>/src/modules/collections/website-pages.spec.ts",
        // #529 the business's categories, with a mocked Prisma.
        "<rootDir>/src/modules/categories/categories.service.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.state.spec.ts",
        // #173 — organization stamping on create; DB-free so CI catches a
        // regression without a provisioned Postgres.
        "<rootDir>/src/modules/orders/orders.service.org-scope.spec.ts",
        // Sell -> Orders: what a row's status column says when the goods and
        // the money disagree, and that the business-wide list cannot be
        // widened past its organization.
        // Custom roles: the permission list an owner picks from must stay the
        // same list the policy enforces.
        "<rootDir>/src/modules/organizations/capability-catalogue.spec.ts",
        "<rootDir>/src/modules/organizations/resolve-capabilities.spec.ts",
        "<rootDir>/src/modules/organizations/organization-roles.service.spec.ts",
        "<rootDir>/src/modules/orders/order-standing.spec.ts",
        // The order screen reads when an order last changed (#374).
        "<rootDir>/src/modules/orders/serialize.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.organization.spec.ts",
        "<rootDir>/src/modules/orders/organization-orders.controller.spec.ts",
        "<rootDir>/src/modules/stores/storefronts.spec.ts",
        "<rootDir>/src/modules/discounts/discount-state.spec.ts",
        "<rootDir>/src/modules/discounts/redeem.spec.ts",
        "<rootDir>/src/modules/discounts/discounts.service.spec.ts",
        "<rootDir>/src/modules/discounts/discounts.controller.spec.ts",
        // ADR-007 invoices: pure totals, numbering and standing, and the
        // service with a jest-mocked Prisma. Never touch a DB. (The numbering
        // races in invoices.db.spec.ts need Postgres and run in integration.)
        "<rootDir>/src/modules/invoices/totals.spec.ts",
        "<rootDir>/src/modules/invoices/numbering.spec.ts",
        "<rootDir>/src/modules/invoices/invoice-state.spec.ts",
        "<rootDir>/src/modules/invoices/invoices.service.spec.ts",
        // U13: the invoice pay link (make, replace, revoke, read).
        "<rootDir>/src/modules/invoices/pay-link.spec.ts",
        // U5 GST: the tax maths, the states and GSTINs, and the order
        // invoice builder — pure.
        "<rootDir>/src/modules/invoices/gst.spec.ts",
        "<rootDir>/src/modules/invoices/gst-states.spec.ts",
        "<rootDir>/src/modules/invoices/order-invoice.spec.ts",
        // Which refunds make no credit note — a jest-mocked transaction.
        "<rootDir>/src/modules/invoices/order-invoicing.spec.ts",
        // ADR-007 subscriptions: the period calendar, the service and the
        // renewal job with a jest-mocked Prisma. subscriptions.db.spec.ts needs
        // Postgres and runs in integration.
        "<rootDir>/src/modules/subscriptions/periods.spec.ts",
        // U7: collection dates and when a skip saves the charge.
        "<rootDir>/src/modules/subscriptions/collections.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscriptions.service.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscription-renew.handler.spec.ts",
        "<rootDir>/src/modules/class-packs/class-packs.service.spec.ts",
        "<rootDir>/src/modules/class-packs/class-packs.controller.spec.ts",
        "<rootDir>/src/modules/class-packs/dto.spec.ts",
        "<rootDir>/src/modules/courses/courses.service.spec.ts",
        "<rootDir>/src/modules/subscriptions/dto.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.discount.spec.ts",
        "<rootDir>/src/modules/products/products.remove.spec.ts",
        "<rootDir>/src/modules/product-reviews/**/*.spec.ts",
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
        // Public waitlist capture: normalization, idempotency (including the
        // concurrent-insert P2002 race), and that a full address never reaches
        // the logs. Jest-mocked Prisma; no DB.
        "<rootDir>/src/modules/waitlist/**/*.spec.ts",
        "<rootDir>/test/**/*.spec.ts",
        // #90 (S0-011) API bootstrap smoke test: compiles the full AppModule DI
        // graph so "the app doesn't even start" (the 0fc8f72 boot crash class)
        // is caught. compile() resolves every provider without a DB — see the
        // spec header for why it lives in the no-database unit project.
        "<rootDir>/src/app.bootstrap.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
};
