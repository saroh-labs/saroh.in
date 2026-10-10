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
        // DEC-120: the export's cells and zip, DB-free; its rows are in
        // data-export.db.spec.ts.
        "<rootDir>/src/modules/data-export/**/*.spec.ts",
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
        // U12: the plan step, and PAYMENTS locking actions, never the module.
        "<rootDir>/src/modules/capabilities/module-availability.catalogue.spec.ts",
        "<rootDir>/src/modules/capabilities/module-lifecycle.service.spec.ts",
        "<rootDir>/src/modules/capabilities/readiness/module-readiness.registry.spec.ts",
        // #115 module API controller (mocked services).
        "<rootDir>/src/modules/capabilities/capabilities.controller.spec.ts",
        // DEC-068 Turn on: the setup payload's shapes (pure, no DB).
        "<rootDir>/src/modules/capabilities/setup/module-setup.parse.spec.ts",
        // #117 dark module-enforcement guard (mocked reflector + availability).
        "<rootDir>/src/modules/capabilities/module-enforcement.guard.spec.ts",
        // #117: the guard's shadow/refused log lines and their throttle, the
        // history reads that stay open with a module off, and the source
        // scan of what is gated — no database.
        "<rootDir>/src/modules/capabilities/module-enforcement.log.spec.ts",
        "<rootDir>/src/modules/capabilities/history-reads.gate.spec.ts",
        "<rootDir>/src/modules/capabilities/module-annotations.spec.ts",
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
        // The category refusal's words (UX-066); the rest of content's
        // specs read the dev database.
        "<rootDir>/src/modules/content/post-categories.slug.spec.ts",
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
        // Terms rev 46: customers' reports about a business — the address
        // rules, the DTO and the public write, with a jest-mocked Prisma.
        "<rootDir>/src/modules/business-reports/**/*.spec.ts",
        // S3-005 CRM: ContactsService, PipelinesService, and LeadsService specs
        // with a jest-mocked Prisma (incl. $transaction) — org-scoped reads,
        // authz (MEMBER denied), tenant isolation (cross-tenant id → 404), and
        // the move-stage atomic STAGE_CHANGED activity. Never touch a DB.
        "<rootDir>/src/modules/contacts/**/*.spec.ts",
        "<rootDir>/src/modules/site-accounts/**/*.spec.ts",
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
        // The six fulfilment types and their rules (DEC-045, B2a).
        "<rootDir>/src/modules/orders/fulfilment.spec.ts",
        "<rootDir>/src/modules/orders/order-refunds.spec.ts",
        "<rootDir>/src/modules/orders/order-read.spec.ts",
        // B14: a treatment's Visits card and its next action, pure.
        "<rootDir>/src/modules/orders/order-visits.spec.ts",
        "<rootDir>/src/modules/orders/order-kitchen.service.spec.ts",
        // Products v2: MRP, saving, shop switches and detail coherence — pure.
        "<rootDir>/src/modules/products/product-rules.spec.ts",
        // #519 the Products list's "Needs you": pure.
        "<rootDir>/src/modules/products/catalogue-needs.spec.ts",
        "<rootDir>/src/modules/products/product-overview.spec.ts",
        // #517 photos and videos: limits, kind/type match, posters from the
        // library, with a jest-mocked Prisma.
        "<rootDir>/src/modules/products/product-images.service.spec.ts",
        // #530 the merge report: Owner/Admin only, with a mocked Prisma.
        "<rootDir>/src/modules/products/merge-report.service.spec.ts",
        // G11: pure serialisers of the public catalogue.
        "<rootDir>/src/modules/products/public-catalogue.serialize.spec.ts",
        // G12: what a Product grid asks the catalogue — pure.
        "<rootDir>/src/modules/products/product-grid.spec.ts",
        // #513 the stock log's words and arithmetic — pure.
        "<rootDir>/src/modules/stock/stock-words.spec.ts",
        // #514 the Stock API: sign-in, organization and COMMERCE gates.
        "<rootDir>/src/modules/stock/stock.gate.spec.ts",
        "<rootDir>/src/modules/catalogue/catalogue-defaults.spec.ts",
        "<rootDir>/src/modules/catalogue/sku-pattern.spec.ts",
        "<rootDir>/src/modules/catalogue/field-rules.spec.ts",
        "<rootDir>/src/modules/catalogue/catalogue.controller.spec.ts",
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
        "<rootDir>/src/modules/orders/organization-orders.controller.spec.ts",
        // B2d: the legacy fulfilment words are refused.
        "<rootDir>/src/modules/orders/dto.spec.ts",
        // B6: the bulk move body; the rows are in order-stage-batch.db.spec.ts.
        "<rootDir>/src/modules/orders/order-stage-batch.dto.spec.ts",
        // Plan B, B1: the Orders list's filters and its row, DB-free. The SQL
        // runs against Postgres in order-list.db.spec.ts.
        "<rootDir>/src/modules/orders/order-list-filters.spec.ts",
        "<rootDir>/src/modules/orders/order-row.spec.ts",
        // #122: an order's online payment in words — failed, waiting, not
        // finished — with a mocked Prisma.
        "<rootDir>/src/modules/orders/online-payment.spec.ts",
        // B4: the filter bar's options, DB-free.
        "<rootDir>/src/modules/orders/order-list-options.spec.ts",
        // B13: New order's rules and how a walk-in reads, DB-free. The
        // writes are in new-order.db.spec.ts.
        "<rootDir>/src/modules/orders/new-order.spec.ts",
        "<rootDir>/src/modules/orders/walk-in.spec.ts",
        // B13b: the phone a walk-in is kept by, DB-free.
        "<rootDir>/src/modules/orders/walk-in-customer.spec.ts",
        // G13: the site bag's pricing, DB-free. The real rows are in
        // public-checkout.db.spec.ts.
        "<rootDir>/src/modules/orders/checkout-quote.spec.ts",
        // Whether the site can take an online order, with the plan's say
        // over online payments — DB-free.
        "<rootDir>/src/modules/orders/checkout-readiness.spec.ts",
        // Paying at the handover at the site's checkout (2026-10-06): the
        // order's write and the service's choice, with a mocked database.
        "<rootDir>/src/modules/orders/offline-checkout-order.spec.ts",
        "<rootDir>/src/modules/orders/offline-checkout-start.spec.ts",
        // R34: an order to pay on handover nobody came for, pure.
        "<rootDir>/src/modules/orders/uncollected.spec.ts",
        // Record as refunded's amount and words (UX-061).
        "<rootDir>/src/modules/orders/hand-payments.spec.ts",
        // Another amount recorded by hand (#865, DEC-116), pure.
        "<rootDir>/src/modules/orders/hand-refund.spec.ts",
        // What a cancel sends back once part went back by hand (#918).
        "<rootDir>/src/modules/orders/order-cancel.spec.ts",
        // P4: the site's order confirmation, DB-free. Its access rules are
        // in checkout-confirmation.db.spec.ts.
        "<rootDir>/src/modules/orders/checkout-confirmation.spec.ts",
        "<rootDir>/src/modules/stores/storefronts.spec.ts",
        "<rootDir>/src/modules/discounts/discount-state.spec.ts",
        "<rootDir>/src/modules/discounts/redeem.spec.ts",
        "<rootDir>/src/modules/discounts/discounts.service.spec.ts",
        "<rootDir>/src/modules/discounts/discounts.controller.spec.ts",
        // DEC-104: one discount evaluation for the counter and the site's
        // checkout, and the code in the site's bag.
        "<rootDir>/src/modules/discounts/check-for-order.spec.ts",
        "<rootDir>/src/modules/orders/site-discount-quote.spec.ts",
        // ADR-007 invoices: pure totals, numbering and standing, and the
        // service with a jest-mocked Prisma. Never touch a DB. (The numbering
        // races in invoices.db.spec.ts need Postgres and run in integration.)
        "<rootDir>/src/modules/invoices/totals.spec.ts",
        "<rootDir>/src/modules/invoices/numbering.spec.ts",
        "<rootDir>/src/modules/invoices/invoice-state.spec.ts",
        "<rootDir>/src/modules/invoices/invoices.service.spec.ts",
        // U13: the invoice pay link (make, replace, revoke, read).
        "<rootDir>/src/modules/invoices/pay-link.spec.ts",
        // D17: sending an invoice, with the database mocked
        // (invoice-send.db.spec.ts runs in integration).
        "<rootDir>/src/modules/invoices/invoice-send.service.spec.ts",
        // U5 GST: the tax maths, the states and GSTINs, and the order
        // invoice builder — pure.
        "<rootDir>/src/modules/invoices/gst.spec.ts",
        "<rootDir>/src/modules/invoices/gst-states.spec.ts",
        "<rootDir>/src/modules/invoices/order-invoice.spec.ts",
        // Which refunds make no credit note — a jest-mocked transaction.
        "<rootDir>/src/modules/invoices/order-invoicing.spec.ts",
        // D18: what narrows the list by source, pack, course or order, and
        // its query (list-filter.db.spec.ts runs in integration).
        "<rootDir>/src/modules/invoices/list-filter.spec.ts",
        // D16: the invoice's paper and its PDF, read back as text — pure
        // (invoice-pdf.db.spec.ts runs in integration).
        "<rootDir>/src/modules/invoices/invoice-pdf.spec.ts",
        // DEC-072: a line's GST note on the paper and the PDF — pure.
        "<rootDir>/src/modules/invoices/invoice-line-gst.spec.ts",
        "<rootDir>/src/modules/invoices/invoice-pdf-logo.spec.ts",
        // DEC-068: which business details are missing — pure (the refusals
        // and the flag after money are in business-details.db.spec.ts).
        "<rootDir>/src/modules/invoices/business-details.spec.ts",
        // ADR-007 subscriptions: the period calendar, the service and the
        // renewal job with a jest-mocked Prisma. subscriptions.db.spec.ts needs
        // Postgres and runs in integration.
        "<rootDir>/src/modules/subscriptions/periods.spec.ts",
        // U7: collection dates and when a skip saves the charge.
        "<rootDir>/src/modules/subscriptions/collections.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscriptions.service.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscription-renew.handler.spec.ts",
        // D1: a plan's monthly figure and who pays what.
        "<rootDir>/src/modules/subscriptions/plan-figures.spec.ts",
        // D2: what a plan change records, and reading its history.
        "<rootDir>/src/modules/subscriptions/plan-events.spec.ts",
        // D9: what a subscription action records, and reading its log.
        "<rootDir>/src/modules/subscriptions/subscription-events.spec.ts",
        // D8: a pause's end date, and the job's resume on it.
        "<rootDir>/src/modules/subscriptions/pause-until.spec.ts",
        // D21: which plans are on sale; a DRAFT is refused.
        "<rootDir>/src/modules/subscriptions/plan-on-sale.spec.ts",
        // D10: a subscription's own classes a month, and the fallback.
        "<rootDir>/src/modules/subscriptions/classes-allowance.spec.ts",
        // G9: the order a site lists plans in, and Most chosen.
        "<rootDir>/src/modules/subscriptions/public-plans.spec.ts",
        // G20: a plan joined online — its snapshot and waiting joins. Pure.
        "<rootDir>/src/modules/subscriptions/plan-join.spec.ts",
        // 6 Oct 2026: memberships need the plan's rows to be set up.
        "<rootDir>/src/modules/subscriptions/membership-plan-lock.spec.ts",
        "<rootDir>/src/modules/subscriptions/public-plans.lock.spec.ts",
        "<rootDir>/src/modules/class-packs/class-packs.service.spec.ts",
        "<rootDir>/src/modules/class-packs/class-packs.controller.spec.ts",
        "<rootDir>/src/modules/class-packs/dto.spec.ts",
        // E14: which packs are on sale; a DRAFT is refused.
        "<rootDir>/src/modules/class-packs/pack-on-sale.spec.ts",
        // A10: spending a pack as the team and as the customer, mocked tx.
        "<rootDir>/src/modules/class-packs/redeem-pack.spec.ts",
        // A11: a pack bought online — its snapshot, words and dates. Pure.
        "<rootDir>/src/modules/class-packs/pack-checkout.spec.ts",
        // G20: a pack as the site's Prices page shows it. Pure.
        "<rootDir>/src/modules/class-packs/public-packs.spec.ts",
        "<rootDir>/src/modules/courses/courses.service.spec.ts",
        "<rootDir>/src/modules/subscriptions/dto.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.discount.spec.ts",
        "<rootDir>/src/modules/products/products.remove.spec.ts",
        // A move to a lower plan pauses what is past its limits (#800).
        "<rootDir>/src/modules/products/product-paused.spec.ts",
        "<rootDir>/src/modules/content/post-paused.spec.ts",
        "<rootDir>/src/modules/orders/checkout-paused.spec.ts",
        // …and a paused website sells no packs or plans online.
        "<rootDir>/src/modules/class-packs/pack-paused.spec.ts",
        "<rootDir>/src/modules/subscriptions/plan-join-paused.spec.ts",
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
        // Plans catalogue U3: the draft-preview token, the public view of a
        // snapshot and the impact rules — pure. The *.db.spec.ts beside them
        // run in the integration project.
        "<rootDir>/src/modules/pricing/**/*.spec.ts",
        // Public waitlist capture: normalization, idempotency (including the
        // concurrent-insert P2002 race), and that a full address never reaches
        // the logs. Jest-mocked Prisma; no DB.
        "<rootDir>/src/modules/waitlist/**/*.spec.ts",
        // Link preview tool (resources plan U2): the SSRF guard, the head
        // parser, the report and the gate, with fake DNS and transports.
        "<rootDir>/src/modules/link-preview/**/*.spec.ts",
        // Which social sign-in buttons the accounts pages show: only
        // providers with both keys set. Pure; no DB.
        "<rootDir>/src/modules/sign-in-options/**/*.spec.ts",
        "<rootDir>/test/**/*.spec.ts",
        // #90 (S0-011) API bootstrap smoke test: compiles the full AppModule DI
        // graph so "the app doesn't even start" (the 0fc8f72 boot crash class)
        // is caught. compile() resolves every provider without a DB — see the
        // spec header for why it lives in the no-database unit project.
        "<rootDir>/src/app.bootstrap.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
};
