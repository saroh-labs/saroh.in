# RLS enforcement rollout + remaining ops follow-ups

**State on 2026-09-26 (#53):** row-level security covers **every**
business-owned table: each one is `ENABLE`d and `FORCE`d with the
`org_isolation` policy, either on its own `organizationId` or, for a child
table, through its parent (the B2 shape). The last 16 went in with
`20261008100000_rls_remaining_tables`. A structural test fails CI if a new
table arrives without a policy or an allow-list entry with a reason
(`packages/database/src/rls-coverage.test.ts`).

**On in development since 2026-10-09** (§4); still dark in production, where
`RLS_ENFORCEMENT` is off. With it off the proxy never sets the GUC, so every
query takes the policies' permissive branch. Because every table is `FORCE`d,
that flag, not the role, is what keeps it dark: the owner role is not
`BYPASSRLS`. The separate runtime role adds least privilege (no DDL) on top. Switching it
on is the operator runbook in §1 below. The whole API integration suite now
runs in CI the way production will run once it's switched on (§0.2), and it
passes.

> **Why dark by default:** the policies are permissive when the transaction-local
> GUC `app.current_organization_id` is unset/empty (`NULLIF(...) IS NULL`), and
> the current owner role bypasses RLS entirely. So nothing changes for the
> running app until you (a) connect as a non-`BYPASSRLS` role **and** (b) set
> `RLS_ENFORCEMENT=on`, which makes the `prisma` proxy set the GUC for every
> query an org-scoped request makes.

---

## 0. What is built, and what has been proven

### 0.1 Coverage

| Kind                                               | How it is isolated                                  | Where                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Tables with `organizationId`                       | `"organizationId" = GUC`                            | B1, later feature migrations, `…_rls_remaining_tables`                                                 |
| Child tables (no `organizationId`)                 | `EXISTS (parent WHERE parent.organizationId = GUC)` | B2, `…_product_field_category_rls`, `…_rls_remaining_tables` (`ApiKey`, `TeamMember`, `ProjectAccess`) |
| Not business-owned (allow-listed, with the reason) | none                                                | `NOT_TENANT_OWNED` in `rls-coverage.test.ts`                                                           |

The allow-list is: `Organization` (the tenant root), `User`, `Session`,
`Account`, `Verification` (identity, across organizations), `FeatureFlag`,
`Plan` (platform catalogues), `PlatformAdmin`, `PlatformAdminRoleAssignment`,
`AdminOperation`, `AdminOperationItem` (staff), `WaitlistSignup` (before any
organization exists).

The admin console's tables (`AdminAccessSession`, `AdminAuditEvent`,
`AdminOrganizationNote`) and `IdempotencyRecord` are isolated too. The console
reads them across organizations, but its routes never carry an organization
context (`AdminRoutes` has no `OrganizationGuard`), so they take the permissive
branch. A row with a NULL `organizationId` (a platform-wide audit event, an
admin idempotency record) can be seen or written **only** outside an org
context. That is the only place such rows are written today.

### 0.2 The enforcement layer, and the suite that exercises it

- `OrgRlsInterceptor` runs each request that `OrganizationGuard` resolved inside
  `runInOrgContext(orgId)`. The exported `prisma` is a proxy that, with
  `RLS_ENFORCEMENT` on and a context active, runs each operation in a short
  transaction whose first statement sets the GUC. A service's own
  `$transaction` becomes that one transaction. Jobs, public routes, webhooks
  and the admin console run with no context, and take the permissive branch.
- **RLS mode of the integration suite** (`TEST_RLS=on`,
  `apps/api.saroh.in/test/rls-mode.ts`) builds the schema from the
  **migrations**, connects as a fresh `NOSUPERUSER NOBYPASSRLS` role that has
  only DML rights, sets `RLS_ENFORCEMENT=on`, and runs every `@Injectable()`
  method called with an `OrganizationContext` (or a first parameter named
  `organizationId`) inside that organization's context, as the interceptor
  does for a real request. CI runs it after the normal integration step.
- `src/modules/rls/rls-isolation.db.spec.ts` runs the §1 probe for all 16
  newly covered tables: the org's own rows in context, 0 for a bogus org, all
  rows with no context. It also checks that a write for another organization
  is refused, and that the harness really wraps services.

**What the first enforced run found (#53, 2026-09-26):**

1. **Array-form `$transaction([...])` failed under enforcement.** The proxy ran
   each operation eagerly in its own transaction and handed Prisma plain
   promises, which it rejects. Four paths use it inside an org context: the
   category merge, deleting a post category, reordering variants, and saving
   product field values. With enforcement on, each would have returned a 500.
   Fixed in `rls-proxy.ts`: an org-scoped operation is now lazy, like a
   PrismaPromise, and the array form runs its operations in order inside one
   transaction that sets the GUC first. Unit tests are in `rls-proxy.test.ts`.
2. Two backfill specs rebuild an old schema with DDL. The DML-only role can't
   do that, and in production neither the backfills nor their DDL run as the
   runtime role. RLS mode skips them, and the normal run still covers them.

Nothing else failed. Result: **169 suites, 2159 tests, green under enforcement**.
The normal run has 170 suites and 2163 tests (the 20 RLS-mode tests skip there).

### 0.3 What the suite cannot see

- **Data.** A row whose `organizationId` is NULL is invisible inside an org
  context. `Customer`, `Cart`, `Order` and `Inventory` still allow NULL
  (SEC-005). Test data never has such rows, and real data might. The
  pre-flight in §1 counts them.
- **Paths no test calls with an organization context.** The harness wraps
  what the specs call. A handler with no spec, or a spec that calls a helper
  function directly, is covered only by the staging smoke test.
- **Load.** Each org-scoped query becomes a short transaction (BEGIN,
  set_config, the query, COMMIT). Watch p95 latency and pool use in the smoke
  test.

---

## 1. Runbook: switching enforcement on, per environment

Run it in development first, then production. Each step says who does it. None
of it is done yet.

**Prerequisites (once).**

- The deploy's **migrate** and **backup** steps must connect as the owner
  role, **not** through the API's runtime `DATABASE_URL`. The rollout script
  on the host runs migrations with the new image. If it reads the same env
  file as the API, give it a separate owner URL first (for example a
  `MIGRATION_DATABASE_URL` that the migrate step maps to `DATABASE_URL`).
  Otherwise the first deploy after step 3 fails at `prisma migrate deploy`,
  because the runtime role can't run DDL. The script lives on the host, not in
  this repo.
- Any one-off backfill (`packages/database/src/backfill/*`) runs as the owner
  too.

**Step 1: create the runtime role** (database admin, as the owner).

```sql
CREATE ROLE saroh_app LOGIN PASSWORD '<strong-secret>' NOSUPERUSER NOBYPASSRLS;

-- DML on all current + future tables in the app schema (no DDL, no ownership).
GRANT CONNECT ON DATABASE "<database>" TO saroh_app;
GRANT USAGE ON SCHEMA public TO saroh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO saroh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO saroh_app;
-- Tables the owner creates in later migrations. Run as the role that runs
-- migrations; default privileges belong to the role that creates the objects.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saroh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO saroh_app;
```

Keep the password in the environment's secret store only (see
`docs/patterns/devops-secrets.md`).

**Step 2: pre-flight** (database admin, read-only).

```sql
-- a) The role is subject to RLS.
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'saroh_app';
--    expect: f, f

-- b) Every table is ENABLEd and FORCEd, except the allow-list in §0.1.
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
ORDER BY 1;
--    expect: Account, AdminOperation, AdminOperationItem, FeatureFlag,
--    Organization, Plan, PlatformAdmin, PlatformAdminRoleAssignment, Session,
--    User, Verification, WaitlistSignup, _prisma_migrations

-- c) Rows an org context could never see again. Each must be 0, or be fixed
--    (backfilled to their organization) before step 3.
SELECT 'Customer' AS t, count(*) FROM "Customer" WHERE "organizationId" IS NULL
UNION ALL SELECT 'Cart', count(*) FROM "Cart" WHERE "organizationId" IS NULL
UNION ALL SELECT 'Order', count(*) FROM "Order" WHERE "organizationId" IS NULL
UNION ALL SELECT 'Inventory', count(*) FROM "Inventory" WHERE "organizationId" IS NULL;
```

**Step 3: probe as the role** (database admin). Pick a real organization id.

```sql
SET ROLE saroh_app;
BEGIN;
  SELECT set_config('app.current_organization_id', '<real org id>', true);
  SELECT count(*) FROM "Order";               -- that org's orders only
  SELECT count(*) FROM "OrganizationModule";  -- that org's modules only
COMMIT;
BEGIN;
  SELECT set_config('app.current_organization_id', 'org_does_not_exist', true);
  SELECT count(*) FROM "Order";               -- expect 0
  SELECT count(*) FROM "SavedView";           -- expect 0
  SELECT count(*) FROM "ApiKey";              -- expect 0 (join-based)
COMMIT;
BEGIN;
  SELECT count(*) FROM "Order";               -- expect ALL (no context)
COMMIT;
RESET ROLE;
```

**Step 4: switch the API** (operator, in the environment's settings; both
together).

- Runtime `DATABASE_URL` → the `saroh_app` connection string.
- `RLS_ENFORCEMENT=on`.
- Redeploy or restart the API. Readiness (`/health/ready`) must go green.

**Step 5: smoke test** (operator, 15 minutes). Use a business that isn't a
demo store.

- Sign in, open Home, Orders, Products, Bookings, Contacts, Website, and
  Settings → Team.
- Write one of each: a product edit, a category merge (the array-form path
  above), an enquiry from the public site, a public booking, a checkout up to
  the payment page, and an invitation.
- Admin console: open a business, its notes and audit, and flags.
- Background jobs: the queue drains (`/health/ready` stays green, and the job
  list in the console shows no new failures).
- Logs: no `row-level security` errors, no `P2028` transaction timeouts, and no
  pool exhaustion. Compare p95 latency with the day before.

**Step 6: record it** here, in §4, with the date, environment and results of
steps 2c, 3 and 5.

**Rollback (instant):** unset `RLS_ENFORCEMENT` and restart. Every query goes
back to no context and the permissive branch, even on the `saroh_app` role.
To undo fully, point `DATABASE_URL` back at the owner. No code change or
migration is needed either way.

---

## 2. Remaining infra follow-ups (repo/DB admin only)

These cannot be done from application code; they are listed here so they are not
lost.

| Item                                   | What                                                                                                                                                                                                                              | Where                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **CI required check** (S0-002, #104)   | Make the CI jobs **required status checks** on `main` and `development`. The exact job names and `gh api` calls are on #104.                                                                                                      | GitHub → Settings → Branches              |
| **Wire `db:migrate:deploy`** (S0-004)  | Add `pnpm --filter @saroh/database db:migrate:deploy` to the deploy pipeline (runs as the owner role, before the app starts on the new build). Confirm the set of environments (dev confirmed; staging/prod?).                    | CD config + `S0-004_MIGRATION_RUNBOOK.md` |
| **Non-`BYPASSRLS` role** (S1-011, #53) | Section 1 above: create `saroh_app`, give migrations their own owner URL, point the runtime `DATABASE_URL` at `saroh_app`, and set `RLS_ENFORCEMENT=on`.                                                                          | DB admin + operator                       |
| **Flip `ORG_AUTHORIZATION`** (S1-006)  | The org-authorization dual-read is behind a default-off flag. After validating in staging, turn it on so store routes authorize via org membership. `Store.organizationId` is now NOT NULL (B5), so the data precondition is met. | Feature-flag admin (`admin.saroh.in`)     |
| **Rotate shared credentials** (R-13)   | Rotate any credential ever shared in a non-secret channel; keep gitleaks in CI.                                                                                                                                                   | Ops                                       |

---

## 3. Notes / clarifications

- **S7-004 gap:** the backlog jumps S7-003 → S7-005; there is no S7-004. This is
  a numbering gap in the original plan, not a dropped deliverable — Stage 7's
  scope (analytics S7-001/002/003 + billing S7-005) is complete.
- **Pre-implementation docs:** `RISKS_AND_TECH_DEBT.md` and `CURRENT_STATE.md`
  are dated 2026-07-17 (the pre-build audit) and were not refreshed as Stages
  0–7 landed. Read them as historical context, not current status; the live
  status is the per-stage progress tables in `IMPLEMENTATION_BACKLOG.md`. The
  still-open residual risks are R-05 (RLS enforcement — this doc), R-10 (CSRF
  missing-origin — closed by #50: the API now refuses a write with no Origin,
  and the frontends send theirs), and R-13 (credential rotation — table above).
- **Environment variables:** see `ENVIRONMENT.md` — the stack boots locally with
  only `DATABASE_URL`; production additionally requires `BETTER_AUTH_SECRET`.

---

## 4. Enablement log

Runtime role name: `saroh_runtime`. Production's existing owner role is
already called `saroh_app`, so §1's example name can't be reused there.
Pre-flight 2b on development also lists five platform-wide tables beyond the
allow-list above, each correctly not org-scoped: `PricingCatalogDraft`,
`PricingCatalogVersion`, `PricingCoupon`, `PricingProviderPlan`,
`SarohInvoiceSequence`.

| Date | Environment | Pre-flight 2c (NULL-org rows) | Probe (step 3) | Smoke (step 5) | By  |
| ---- | ----------- | ----------------------------- | -------------- | -------------- | --- |
| 2026-10-09 | development | 0 in all four tables | real org: own 500 of 667 orders, 10 modules; bogus org: 0 Order, SavedView, ApiKey; no context: 667 | read-only pass: Home, Sell (orders, customers, location), Bookings, Contacts, Website, Settings › Team, business switch, public site. Writes on Northwind: product edit and back, a Reviewer invitation sent and cancelled, a public enquiry, Website › Sells from saved, the shop and bag, booking times. Booking and checkout stop at customer sign-in (emailed code), not exercised. 0 RLS/P2028/pool errors in logs | Claude + owner |
| —    | production  | not run                       | not run        | not run        |     |
