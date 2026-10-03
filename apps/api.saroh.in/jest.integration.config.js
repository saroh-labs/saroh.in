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
/**
 * RLS mode (`TEST_RLS=on`, test/rls-mode.ts) runs as a DML-only NOBYPASSRLS
 * role. These specs rebuild an old schema with DDL (ALTER TABLE, CREATE INDEX)
 * to test one-off backfills; only the migration owner may do that, and the
 * backfills run as the owner too. They run in the normal suite.
 */
const rlsMode = ["1", "on", "true"].includes(
    (process.env.TEST_RLS ?? "").trim().toLowerCase(),
);
const OWNER_DDL_SPECS = rlsMode
    ? [
          "<rootDir>/src/modules/products/listings-stock-levels.backfill.db.spec.ts",
          "<rootDir>/src/modules/catalogue/catalogue-settings.backfill.db.spec.ts",
          "<rootDir>/src/modules/orders/order-fulfilment-contract.db.spec.ts",
      ]
    : [];

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
    testMatch: ["<rootDir>/src/modules/**/*.spec.ts"],
    // The organizations module specs mock Prisma (pure unit tests) and run in
    // the default/unit project — keep them out of the DB-backed run.
    // The organizations specs mock Prisma (pure unit tests), and the S1-006
    // store *.authorization specs mock Prisma + FeatureFlagService — both run in
    // the default/unit project, so keep them out of the DB-backed run. An
    // organizations `*.db.spec.ts` (F19's role reach) is the exception.
    testPathIgnorePatterns: [
        "<rootDir>/src/modules/organizations/(?!.*\\.db\\.spec\\.ts$)",
        "<rootDir>/src/modules/admin/",
        "\\.authorization\\.spec\\.ts$",
        // #384 customer delete: mocked Prisma, runs in the unit project.
        "<rootDir>/src/modules/customers/customers.service.remove.spec.ts",
        // ADR-006 store creation cap: mocked Prisma, runs in the unit project.
        "<rootDir>/src/modules/stores/stores.service.create-cap.spec.ts",
        // S5-001: the pure order-state machine and the mocked-Prisma
        // updateStatus guard spec run in the default/unit project (they mock
        // @saroh/database), so keep them out of the DB-backed run. The legacy
        // DB-backed orders.service.spec.ts still runs here.
        "<rootDir>/src/modules/orders/order-state.spec.ts",
        "<rootDir>/src/modules/orders/order-stage.spec.ts",
        "<rootDir>/src/modules/orders/order-refunds.spec.ts",
        "<rootDir>/src/modules/orders/order-read.spec.ts",
        "<rootDir>/src/modules/orders/order-kitchen.service.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.state.spec.ts",
        // The waitlist spec mocks Prisma (pure unit test) and runs in the
        // default/unit project — keep it out of the DB-backed run.
        "<rootDir>/src/modules/waitlist/",
        // Plans catalogue U3: pure specs run in the unit project; only the
        // pricing *.db.spec.ts run here.
        "<rootDir>/src/modules/pricing/(?!.*\\.db\\.spec\\.ts$)",
        // DB-free specs that mock @saroh/database and run in the unit project:
        // the discount redemption core and the storefront settings spec.
        "<rootDir>/src/modules/discounts/discount-state.spec.ts",
        "<rootDir>/src/modules/discounts/redeem.spec.ts",
        "<rootDir>/src/modules/discounts/discounts.service.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.discount.spec.ts",
        // G13: pure; public-checkout.db.spec.ts runs here.
        "<rootDir>/src/modules/orders/checkout-quote.spec.ts",
        // P4: the order confirmation's view, pure.
        "<rootDir>/src/modules/orders/checkout-confirmation.spec.ts",
        "<rootDir>/src/modules/stores/storefronts.spec.ts",
        "<rootDir>/src/modules/products/products.remove.spec.ts",
        "<rootDir>/src/modules/products/merge-report.service.spec.ts",
        "<rootDir>/src/modules/stock/stock-words.spec.ts",
        "<rootDir>/src/modules/stock/stock.gate.spec.ts",
        "<rootDir>/src/modules/products/product-rules.spec.ts",
        "<rootDir>/src/modules/products/catalogue-needs.spec.ts",
        "<rootDir>/src/modules/products/product-overview.spec.ts",
        "<rootDir>/src/modules/catalogue/catalogue-defaults.spec.ts",
        "<rootDir>/src/modules/catalogue/sku-pattern.spec.ts",
        "<rootDir>/src/modules/catalogue/field-rules.spec.ts",
        "<rootDir>/src/modules/catalogue/catalogue.controller.spec.ts",
        "<rootDir>/src/modules/products/products.gate.spec.ts",
        "<rootDir>/src/modules/collections/collections.gate.spec.ts",
        "<rootDir>/src/modules/collections/website-pages.spec.ts",
        // G12: pure; the real rows are in public-catalogue-grid.db.spec.ts.
        "<rootDir>/src/modules/products/product-grid.spec.ts",
        "<rootDir>/src/modules/categories/categories.service.spec.ts",
        // Mocked Prisma; C6's contact-reviews.db.spec.ts runs here.
        "<rootDir>/src/modules/product-reviews/(?!.*\\.db\\.spec\\.ts$)",
        // ADR-007 invoices: DB-free specs run in the unit project; only
        // invoices.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/totals.spec.ts",
        "<rootDir>/src/modules/invoices/numbering.spec.ts",
        "<rootDir>/src/modules/invoices/invoice-state.spec.ts",
        "<rootDir>/src/modules/invoices/invoices.service.spec.ts",
        // U13 pay link: mocked-DB specs; invoice-pay-link.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/pay-link.spec.ts",
        // D17: mocked-DB; invoice-send.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/invoice-send.service.spec.ts",
        // U5 GST: the tax maths, the states and GSTINs, and the order
        // invoice builder — pure.
        "<rootDir>/src/modules/invoices/gst.spec.ts",
        "<rootDir>/src/modules/invoices/gst-states.spec.ts",
        "<rootDir>/src/modules/invoices/order-invoice.spec.ts",
        // D18: pure; list-filter.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/list-filter.spec.ts",
        // D16: pure; invoice-pdf.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/invoice-pdf.spec.ts",
        // DEC-072: a line's GST note on the paper and the PDF — pure.
        "<rootDir>/src/modules/invoices/invoice-line-gst.spec.ts",
        "<rootDir>/src/modules/invoices/invoice-pdf-logo.spec.ts",
        // DEC-068: which business details are missing — pure (the refusals
        // and the flag after money are in business-details.db.spec.ts).
        "<rootDir>/src/modules/invoices/business-details.spec.ts",
        "<rootDir>/src/modules/payments/public-invoices.service.spec.ts",
        // D20: mocked Prisma; the real rows are in mandates.db.spec.ts.
        "<rootDir>/src/modules/payments/mandates.service.spec.ts",
        "<rootDir>/src/modules/payments/mandate-cancel.handler.spec.ts",
        "<rootDir>/src/modules/webhooks/webhooks.invoice.spec.ts",
        "<rootDir>/src/modules/subscriptions/periods.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscriptions.service.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscription-renew.handler.spec.ts",
        // D1: a plan's monthly figure and who pays what.
        "<rootDir>/src/modules/subscriptions/plan-figures.spec.ts",
        // D2: mocked Prisma; the real rows are in subscriptions.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/plan-events.spec.ts",
        // D9: mocked Prisma; the real rows are in subscription-events.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/subscription-events.spec.ts",
        // D8: pure, with a mocked transaction; the real rows are in subscriptions.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/pause-until.spec.ts",
        // D21: pure; the real rows are in plan-drafts-readers.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/plan-on-sale.spec.ts",
        // D10: pure; the real rows are in subscription-classes.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/classes-allowance.spec.ts",
        // G9: pure; the real rows are in public-plans.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/public-plans.spec.ts",
        // G20: pure; the real rows are in public-plan-join.db.spec.ts.
        "<rootDir>/src/modules/subscriptions/plan-join.spec.ts",
        "<rootDir>/src/modules/class-packs/class-packs.service.spec.ts",
        // E14: pure; the real rows are in class-packs.drafts.db.spec.ts.
        "<rootDir>/src/modules/class-packs/pack-on-sale.spec.ts",
        // A11: pure; the real rows are in public-pack-purchase.service.db.spec.ts.
        "<rootDir>/src/modules/class-packs/pack-checkout.spec.ts",
        // G20: pure; the real rows are in public-packs.db.spec.ts.
        "<rootDir>/src/modules/class-packs/public-packs.spec.ts",
        "<rootDir>/src/modules/courses/courses.service.spec.ts",
        // U3 staff: mocked-DB and pure specs; staff.db.spec.ts runs here.
        "<rootDir>/src/modules/staff/staff.service.spec.ts",
        "<rootDir>/src/modules/staff/hours.spec.ts",
        ...OWNER_DDL_SPECS,
    ],
    moduleFileExtensions: ["ts", "js", "json"],
    globalSetup: "<rootDir>/test/global-setup.ts",
    globalTeardown: "<rootDir>/test/global-teardown.ts",
    setupFilesAfterEnv: ["<rootDir>/test/integration-setup.ts"],
    maxWorkers: 1,
    // A cold Postgres + schema push can be slow on CI; give suites headroom.
    testTimeout: 30000,
};
