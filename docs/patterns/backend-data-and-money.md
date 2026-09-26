# Data, tenancy and money

> **Read when:** changing `schema.prisma`, adding a model, storing money, writing
> a query that could cross organizations, or shipping a migration.
> Adapted from claude-patterns `backend/03-data-and-migrations.md`. For
> migrations, `.agents/skills/saroh-migrations/SKILL.md` is the authority.

## Tenancy

- **Current** — **Organization is the tenant root** (ADR-001): tenant-owned
  models carry an indexed `organizationId`, and Projects and Teams sit beneath an
  Organization, never as an ownership root. **Adopted** — for every model. Gap:
  `Customer` is store-scoped and its `organizationId` is still nullable.
- **Current** — **Row-level security is defence in depth** (PRODUCT_STRATEGY
  §25). `OrgRlsInterceptor` sets `app.current_organization_id` for org-scoped
  requests through the RLS-aware `prisma` proxy; enforcement is switched by
  `RLS_ENFORCEMENT`, and rollout state is in
  `docs/architecture/RLS_ROLLOUT_AND_OPS.md`. Application filters stay mandatory.
- **Current** — **Publications are immutable,** and the public renderer reads only
  them (ADR-002). No draft table is ever on the public read path.
  **A public write that depends on what the site shows reads the publication
  too.** An enquiry submission is validated against the form fields in the
  current snapshot, not the `Form` row the editor rewrites on every autosave
  (#281). Validating against the draft let an unpublished edit refuse live
  visitors.
- **Current** — **Disabling a capability never deletes data;** deactivation runs a
  policy (§25, ADR-003).
- **Current** — **Catalogue settings belong to the business** (#529, ADR-010):
  categories, options, custom fields, defaults, allergens and the SKU pattern
  are keyed by `organizationId`, with category slugs, option names and
  defaults keys unique per business. Their `storeId` column is the storefront
  a row was first made at and is never read. Services take the organization;
  `CatalogueAccess` resolves it from an org route (`store:read` /
  `store:write`) or, for the old `stores/:storeId/...` aliases, from the
  storefront under its own access rules.
- **Current** — **A product belongs to the business; a storefront sells it
  through a listing and counts it in `StockLevel`** (#510, ADR-010).
  `Product.organizationId` is required and slugs are unique per business;
  `Product.storeId` is only where it was first made. `ProductListing` (and
  `ProductListingVariant` for the variants sold there) says where it sells;
  store-route reads go through it (`listedAt`). Stock is one `StockLevel` row
  per storefront × product × variant (variant null: counted as a whole),
  behind two partial uniques — find it under a row lock and create it, never
  upsert. An order line records its row (`stockLevelId`), what it holds
  (`heldQuantity`) and what it took off the shelf when fulfilled
  (`soldQuantity`); every hold, sale, release and return reads those under
  the row's lock (`stock/reserve.ts`, #511 — see
  `backend-billing-and-classes.md`). Lock order: Order → BusinessProfile
  (FOR SHARE, when Track stock is read under a lock) → Product (a change to
  how it counts; several at once in id order, in one statement) →
  StockLevel rows by id (`products/stock-levels.ts`). **A product is locked
  FOR NO KEY UPDATE, never FOR UPDATE:** every insert that names a product
  (a StockEntry, an OrderItem) takes FOR KEY SHARE on it for the foreign
  key, after the StockLevel locks it already holds. FOR UPDATE conflicts
  with that, so a count opening a new shelf deadlocked with a sale on the
  product's other shelf (PR #533 review). Only a delete (the merge's loser)
  takes FOR UPDATE, before any shelf.
  Whether a product counts stock is `Product.stockTracked` and the
  business's `BusinessProfile.stockTracking` (#515), not whether it has a
  row: an untracked product keeps its rows at 0 for the log, so every
  reader filters with `COUNTING_ROWS` (`stock/tracking.ts`). An untracked
  product has no count and sells unless a storefront marked it sold out by
  hand (`ProductListing.soldOutAt`, `stock/sold-out.ts`): `reserve.ts`
  refuses a fresh line for it there as it refuses a counted Sold out, and
  turning tracking on clears it. `Inventory` and
  `VariantInventory` are no longer written. Every new table pairs its ids
  with composite keys — (storeId, organizationId), (productId,
  organizationId), (variantId, productId) — so the database refuses a row
  mixing two businesses.
- **Current** — **A new shelf never changes how a product counts** (#513,
  PR #533 review). `stock.service` makes a missing row only under the
  product's lock, re-reads Track stock there, and refuses (409) a variant's
  row for a product counted as a whole, or a whole row for one counted per
  variant. A product with no shelf yet may start with either kind. Switching
  to per-variant stock is `setVariantsIn` alone: it moves open lines'
  `heldQuantity` (never their quantity) and needs `store:write`. **The log
  keeps its history:** a variant with real history — a line that sold or
  holds it, or an entry a person or an order wrote that moved stock and
  wasn't undone — can't be removed (archive the product instead). Saroh's
  own entries and counts that changed nothing aren't history, so such a
  variant goes; the last variant counting at a storefront hands what it
  held back to the product (`VARIANT_REMOVED`), and one with units where
  other variants still count is refused, since they'd be lost. A product
  with any stock entry, or stock on a
  shelf, can't be deleted either (archive it). A COUNTED
  entry Saroh wrote (`StockEntry.system`: Track stock off, the per-variant
  switch, a removed variant) is never undone. A return recorded by hand
  that names an order counts against that order's refund put-backs
  (`orderReturnableOnRow`).
- **Current** — **A collection is the business's, hand-picked or automatic,
  never both** (#516, DEC-031). `Collection` carries a required
  `organizationId`. A hand-picked one lists its products in
  `CollectionProduct` rows ordered by `position`, 500 at most
  (`COLLECTION_PRODUCTS_MAX`, checked on every add). An automatic one sets
  `categoryId`, and its products are read from that category and the ones
  below it when asked, never stored, so it can't be edited by hand. A
  category an automatic collection uses can't be deleted: the service
  names the collection, and the `NoAction` key refuses it too. Composite
  keys tie a membership's collection and product, and a collection's
  category, to one business. Archived products show in neither kind. A
  product merge (#530) moves its memberships.
- **Current** — **A backfill that merges rows is a TypeScript script** in
  `packages/database/src/backfill/`, exported so the integration suite can seed
  old-shape rows, run it twice and check the second run changes nothing
  (`catalogue-settings.ts`). The migration that depends on it refuses to run,
  before changing anything, while its precondition fails.
- **Current** — **A row's `promised` is the sum of its open lines'
  `heldQuantity`; a closed order's lines hold nothing** (#511). Anything that
  writes lines or rows outside `stock/reserve.ts` — a backfill, a seed —
  keeps it or is checked against it (`backfill/held-stock.ts`):
  `heldStockMismatches` lists breaks (the showcase check and the base seed
  stop on one), seeds make open orders hold with `holdOpenLines` (on hand
  rises by what is held, so what a row can sell stays the seeded number;
  like reserve, a line whose product counts no stock (#515) holds nothing),
  and `reconcileHeldStock` repairs: lines holding more than their row
  promised are capped oldest order first, the rest become `stockRow` NONE;
  a row promising more is only reported (Stock checks shows it). The #510
  backfill runs it last; `held-stock.cli.ts [--dry-run]` runs it alone.
- **Current** — **Joining two rows re-points everything first, then proves
  nothing is left** (#530, `merge-same-products.ts`): a product merge moves
  order lines, shelves, listings (with a hand-marked Sold out), hand-picked
  collections, reviews, photos, codes, field values and
  allergens onto the survivor, counts what still names the loser, and throws
  — rolling back the business — rather than let a cascade delete it. A merge
  that would widen a live discount's reach is skipped. What a backfill tells
  a business goes in the audit stream (the full report, read with
  `audit:read`) plus one notice in the Owner/Admin inbox, so it is seen
  without a banner to build and dismiss.

## Money — **Current**

- `Decimal` with explicit precision (`@db.Decimal(10, 2)`, `@db.Decimal(12, 2)`);
  never `Float` or `Int` for currency.
- **Strings across the wire.** Frontend types say `price: string`, and
  `common/money.ts` `toMoneyString` formats with string operations only.
- **The API computes.** Order totals are summed in integer cents server-side
  (`orders.service.ts`), and a payment's amount derives from the Order, never
  from the client. Client arithmetic is for previews and sort keys only.

## Modelling

- **Current** — IDs are `cuid()` (all 86 in `schema.prisma`).
- **Current** — **Configuration an operator changes lives in tables with a UI,**
  not environment variables: `FeatureFlag`, `FeatureFlagOverride` and
  `FeatureFlagAudit`, `Plan`, `Subscription`, `OrganizationModule`.
- **Current** — **Derived values are recomputed, not mutated.** An order's total
  is a point-in-time fact recorded once; analytics rollups are rebuilt with
  absolute upserts, so a re-run is safe.
- **Current** — **Cross-domain views are read models, not rewrites.** Home
  aggregates per source instead of reshaping the domains (PRODUCT_STRATEGY §25);
  do the same for Sales-style views.
- **Adopted** — **Ask what the data is** before deciding where it lives. Don't put
  structured data into an existing JSON column because the column is there.
- **Current** — Enum-like values in code are `as const` arrays with a derived
  type.

## Migrations

- **Current** — A migration must replay onto an empty database and match
  `schema.prisma` exactly: `pnpm --filter @saroh/database db:verify:replay` (CI:
  `migration-replay`; PRODUCT_STRATEGY §28).
- **Current** — The integration suite uses `prisma db push` and never runs a
  migration file, so it cannot tell you a migration works.
- **Current** — `packages/database/src/database-target.ts` refuses targets that
  are not allow-listed; name a throwaway one with `DATABASE_TARGET_CONFIRM`.
- **Adopted** — **A destructive change ships in two deploys:** code that tolerates
  both shapes, then the schema change. Not written down anywhere before this
  file.
- **Adopted** — **Migrations run before the new image serves traffic.** Gap: not
  wired. The API image's `CMD` only starts the app, and `RLS_ROLLOUT_AND_OPS.md`
  §2 lists wiring `db:migrate:deploy` into deployment as an open follow-up.

## Seed — **Current**

`pnpm --filter @saroh/database db:seed` lays down "Northwind Supply". Seeded data
can hide a missing producer: analytics rollups exist locally only because the
seed writes them.
