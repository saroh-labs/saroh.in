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
- **Current** — **Disabling a capability never deletes data;** deactivation runs a
  policy (§25, ADR-003).

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
