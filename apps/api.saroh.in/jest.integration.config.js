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
    // the default/unit project, so keep them out of the DB-backed run.
    testPathIgnorePatterns: [
        "<rootDir>/src/modules/organizations/",
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
        // DB-free specs that mock @saroh/database and run in the unit project:
        // the discount redemption core and the storefront settings spec.
        "<rootDir>/src/modules/discounts/discount-state.spec.ts",
        "<rootDir>/src/modules/discounts/redeem.spec.ts",
        "<rootDir>/src/modules/discounts/discounts.service.spec.ts",
        "<rootDir>/src/modules/orders/orders.service.discount.spec.ts",
        "<rootDir>/src/modules/stores/storefronts.spec.ts",
        "<rootDir>/src/modules/products/products.remove.spec.ts",
        "<rootDir>/src/modules/products/merge-report.service.spec.ts",
        "<rootDir>/src/modules/stock/stock-words.spec.ts",
        "<rootDir>/src/modules/stock/stock.gate.spec.ts",
        "<rootDir>/src/modules/products/product-rules.spec.ts",
        "<rootDir>/src/modules/products/product-overview.spec.ts",
        "<rootDir>/src/modules/catalogue/catalogue-defaults.spec.ts",
        "<rootDir>/src/modules/catalogue/sku-pattern.spec.ts",
        "<rootDir>/src/modules/catalogue/field-rules.spec.ts",
        "<rootDir>/src/modules/products/products.gate.spec.ts",
        "<rootDir>/src/modules/categories/categories.service.spec.ts",
        "<rootDir>/src/modules/product-reviews/",
        // ADR-007 invoices: DB-free specs run in the unit project; only
        // invoices.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/totals.spec.ts",
        "<rootDir>/src/modules/invoices/numbering.spec.ts",
        "<rootDir>/src/modules/invoices/invoice-state.spec.ts",
        "<rootDir>/src/modules/invoices/invoices.service.spec.ts",
        // U13 pay link: mocked-DB specs; invoice-pay-link.db.spec.ts runs here.
        "<rootDir>/src/modules/invoices/pay-link.spec.ts",
        // U5 GST: the tax maths, the states and GSTINs, and the order
        // invoice builder — pure.
        "<rootDir>/src/modules/invoices/gst.spec.ts",
        "<rootDir>/src/modules/invoices/gst-states.spec.ts",
        "<rootDir>/src/modules/invoices/order-invoice.spec.ts",
        "<rootDir>/src/modules/payments/public-invoices.service.spec.ts",
        "<rootDir>/src/modules/webhooks/webhooks.invoice.spec.ts",
        "<rootDir>/src/modules/subscriptions/periods.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscriptions.service.spec.ts",
        "<rootDir>/src/modules/subscriptions/subscription-renew.handler.spec.ts",
        "<rootDir>/src/modules/class-packs/class-packs.service.spec.ts",
        "<rootDir>/src/modules/courses/courses.service.spec.ts",
        // U3 staff: mocked-DB and pure specs; staff.db.spec.ts runs here.
        "<rootDir>/src/modules/staff/staff.service.spec.ts",
        "<rootDir>/src/modules/staff/hours.spec.ts",
    ],
    moduleFileExtensions: ["ts", "js", "json"],
    globalSetup: "<rootDir>/test/global-setup.ts",
    globalTeardown: "<rootDir>/test/global-teardown.ts",
    setupFilesAfterEnv: ["<rootDir>/test/integration-setup.ts"],
    maxWorkers: 1,
    // A cold Postgres + schema push can be slow on CI; give suites headroom.
    testTimeout: 30000,
};
