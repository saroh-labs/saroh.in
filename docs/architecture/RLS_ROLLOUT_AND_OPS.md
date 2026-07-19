# RLS enforcement rollout + remaining ops follow-ups

Row-level security now covers **every** org-owned table (48 org-direct via
`B1`, 17 join-based children via `B2`), all as a **dark rollout**: the policies
exist and are `FORCE`d, but the application connects to Postgres as a role with
the `BYPASSRLS` attribute (`neondb_owner` on Neon), so **RLS does not yet gate
real traffic**. This document is the operator runbook to turn it on, plus the
other infra-side follow-ups that only a repo/DB admin can complete.

> **Why dark by default:** the policies are permissive when the transaction-local
> GUC `app.current_organization_id` is unset/empty (`NULLIF(...) IS NULL`), and
> the current owner role bypasses RLS entirely. So nothing changes for the
> running app until you (a) deploy a non-`BYPASSRLS` role **and** (b) ensure every
> org-scoped query runs inside `withOrgContext()`.

---

## 1. Deploy a non-`BYPASSRLS` application role (the enforcement switch)

The app must connect as a role **without** `BYPASSRLS` (and not a superuser) for
`FORCE ROW LEVEL SECURITY` to bite. Create a dedicated login role, grant it only
DML (no ownership), and point `DATABASE_URL` at it.

```sql
-- Run as the DB owner/admin, once per environment.
CREATE ROLE saroh_app LOGIN PASSWORD '<strong-secret>' NOBYPASSRLS;

-- DML on all current + future tables in the app schema (no DDL, no ownership).
GRANT USAGE ON SCHEMA public TO saroh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO saroh_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO saroh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saroh_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO saroh_app;
```

Keep **migrations** running as the owner/admin role (they need DDL); only the
**runtime** `DATABASE_URL` switches to `saroh_app`. So typically:

- `DATABASE_URL` (runtime app) → `saroh_app`
- `DIRECT_DATABASE_URL` / migration step → the owner role (unchanged)

### Verify enforcement (the same probe used to validate B1/B2)

Under a `NOBYPASSRLS` role, with the GUC set to a bogus org, a protected table
must return **0 rows**; unset must return **all** rows (dark-rollout safe). This
was confirmed for `Order`, `AnalyticsEvent`, `Subscription`, `Message`,
`Booking`, `OrderItem`, `ProductVariant`, `Post`, `Comment`, `Transaction`:

```sql
SET ROLE saroh_app;               -- or connect as it
BEGIN;
  SELECT set_config('app.current_organization_id', 'org_does_not_exist', true);
  SELECT count(*) FROM "Order";    -- expect 0  (isolated)
COMMIT;
BEGIN;
  -- no set_config here
  SELECT count(*) FROM "Order";    -- expect ALL  (permissive when unset)
COMMIT;
```

### App precondition before flipping

Every org-scoped read/write must execute inside `withOrgContext(orgId, …)` so the
GUC is set for that transaction. Requests carry the org via `OrganizationGuard`;
**background jobs run with no context on purpose** and rely on the permissive
"unset → all rows" branch (that is why the empty-string fix in B1 matters — a
pooled backend that once ran `withOrgContext` returns `''`, not `NULL`). Audit
that no org-scoped query path bypasses `withOrgContext` before switching the
runtime role, then roll out per-environment (dev → staging → prod).

---

## 2. Remaining infra follow-ups (repo/DB admin only)

These cannot be done from application code; they are listed here so they are not
lost.

| Item                                  | What                                                                                                                                                                                                                              | Where                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **CI required check** (S0-002)        | Mark `ci` a **required status check** in GitHub branch protection for `main` (and `development`), so a red gate blocks merge.                                                                                                     | GitHub → Settings → Branches              |
| **Wire `db:migrate:deploy`** (S0-004) | Add `pnpm --filter @saroh/database db:migrate:deploy` to the deploy pipeline (runs as the owner role, before the app starts on the new build). Confirm the set of environments (dev confirmed; staging/prod?).                    | CD config + `S0-004_MIGRATION_RUNBOOK.md` |
| **Non-`BYPASSRLS` role** (S1-011)     | Section 1 above — create `saroh_app`, point runtime `DATABASE_URL` at it.                                                                                                                                                         | DB admin                                  |
| **Flip `ORG_AUTHORIZATION`** (S1-006) | The org-authorization dual-read is behind a default-off flag. After validating in staging, turn it on so store routes authorize via org membership. `Store.organizationId` is now NOT NULL (B5), so the data precondition is met. | Feature-flag admin (`admin.saroh.in`)     |
| **Rotate shared credentials** (R-13)  | Rotate any credential ever shared in a non-secret channel; keep gitleaks in CI.                                                                                                                                                   | Ops                                       |

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
  missing-origin — mitigated app-side in B3, with a documented "require Origin
  from frontends" follow-up), and R-13 (credential rotation — table above).
- **Environment variables:** see `ENVIRONMENT.md` — the stack boots locally with
  only `DATABASE_URL`; production additionally requires `BETTER_AUTH_SECRET`.
