# Data, tenancy and money

> **Read when:** changing `schema.prisma`, adding a model, storing money, or
> writing a query that could cross organizations.
> Adapted from claude-patterns `backend/03-data-and-migrations.md`. For
> migrations, `.agents/skills/saroh-migrations/SKILL.md` is the authority.

## Tenancy

- **Organization is the tenant root** (ADR-001). Every tenant-owned model
  carries an indexed `organizationId`. Projects and Teams sit beneath an
  Organization and are never an ownership root.
- **Row-level security is defence in depth.** `OrgRlsInterceptor` sets
  `app.current_organization_id` for org-scoped requests through the RLS-aware
  `prisma` proxy; rollout state is in `docs/architecture/RLS_ROLLOUT_AND_OPS.md`.
  Application filters are still mandatory.
- **Publications are immutable,** and the public renderer reads only them
  (ADR-002). No draft table is ever on the public read path.

## Money

- `Decimal` with explicit precision (`@db.Decimal(10, 2)`, `@db.Decimal(12, 2)`);
  never `Float` or `Int` for currency.
- **Strings across the wire.** Frontend types say `price: string`, and
  `common/money.ts` `toMoneyString` formats with string operations only.
- **The API computes.** Order totals are summed in integer cents server-side
  (`orders.service.ts`), and a payment's amount derives from the Order, never
  from the client. Client arithmetic is for previews and sort keys only.

## Modelling

- IDs are `cuid()`.
- **Ask what the data is** before deciding where it lives. Don't put structured
  data into an existing JSON column because the column is there.
- **Derived values are recomputed, not mutated.** An order's total is a
  point-in-time fact recorded once. Analytics rollups
  (`AnalyticsDailyAggregate`) are rebuilt with absolute upserts, so a re-run is
  safe.
- Enum-like values in code are `as const` arrays with a derived type.
- Configuration an operator changes routinely belongs in a table with a UI, not
  an environment variable.

## Migrations — the short version

- A migration must replay onto an empty database and match `schema.prisma`
  exactly: `pnpm --filter @saroh/database db:verify:replay` (CI:
  `migration-replay`).
- The integration suite uses `prisma db push` and never runs a migration file,
  so it cannot tell you a migration works.
- `packages/database/src/database-target.ts` refuses targets that are not
  allow-listed; name a throwaway one with `DATABASE_TARGET_CONFIRM`.
- A destructive change ships in two deploys: code that tolerates both shapes,
  then the schema change.

## Seed

`pnpm --filter @saroh/database db:seed` lays down "Northwind Supply". Seeded
data can hide a missing producer: analytics rollups exist locally only because
the seed writes them.
