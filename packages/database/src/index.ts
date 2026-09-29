export * from "./client";
/*
 * The block contract lives in @saroh/block-contract now (#252) — it imports
 * only zod, and a NestJS server, three browsers and the template package all
 * need it, while only this package needs Prisma.
 *
 * Re-exported rather than moved outright so every existing
 * `import { ctaHref, parseSectionContent } from "@saroh/database"` keeps
 * resolving. Frontends must import @saroh/block-contract directly: this
 * package stays on their ESLint ban list, and for the same reason as always.
 */
export * from "@saroh/block-contract";
export * from "./org-context";
export * from "./rls-proxy";
// The #529 backfill, exported so the API's integration suite can run it
// against old-shape rows (twice) and check what it did.
export * from "./backfill/catalogue-settings";
// The #510 backfill, exported for the same reason.
export * from "./backfill/listings-stock-levels";
// What open orders hold against each row's promised: the check, the repair
// and the seeds' hold (#510, #511), exported for the same reason.
export * from "./backfill/held-stock";
// The #530 same-product merge, exported for the same reason.
export * from "./backfill/merge-same-products";
// The C1 Needs attention backfill, exported for the same reason.
export * from "./backfill/contact-attention";
// The C2 paying-customer contacts backfill, exported for the same reason, and
// for the API's payment path, which runs its per-customer rule.
export * from "./backfill/paying-customer-contacts";
// The D22 Razorpay public key backfill, exported so the API's integration
// suite runs it with the API's own decrypt. Its command-line opener
// (backfill/sealed-credentials.ts) is not exported.
export * from "./backfill/razorpay-public-keys";
// The E12 Class packs module backfill, exported so the API's integration
// suite can run it twice and check what it did.
export * from "./backfill/class-packs-module";
// The D10 classes-a-month backfill, exported so the API's integration suite
// can run it against the previous image's rows (twice) and check them.
export * from "./backfill/classes-per-period";
// The F16 storefront-people-on-the-team backfill, exported so the API's
// integration suite can run it twice, and for the API's storefront invite
// accept, which runs its per-person rule (`joinTeamFromStorefront`).
export * from "./backfill/store-members-to-memberships";
// The F10b business-type backfill (`company` → `pvt`), exported so the API's
// integration suite can run it twice and check what it did.
export * from "./backfill/business-type-pvt";
