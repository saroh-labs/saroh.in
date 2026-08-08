# S0-004 — Prisma migration-history reconciliation runbook

**Status:** ready to execute — needs live DB access + a maintenance window (see §2).
**Owner action required:** items in **§2 Preconditions** and the two `⚠️ OPERATOR` gates.
**Risk:** low. The reconciliation is almost entirely metadata (`_prisma_migrations` rows); at most one small forward-only migration touches table structure, and only if a residual diff is found.

---

## 1. Problem & goal

The repo has **one** migration on disk — `20260214131612_init_multi_tenant_schema` (27 tables) — but `schema.prisma` now defines **32 models**. The extra objects were applied to the deployed database(s) with `prisma db push` during the Store feature work, so **migration history is drifted from the deployed schema**.

Consequence today: `prisma migrate deploy` against a fresh database would create only the 27 init tables, and `migrate status` against the deployed DB reports drift / an unmanaged database.

**Goal (ticket acceptance):** `prisma migrate deploy` reproduces the deployed schema exactly, on both a fresh DB and the existing deployed DB(s), with a clean `migrate status`.

### Expected drift (verify at execution time — §4)

Objects in `schema.prisma` but **not** in the init migration:

| Object            | Origin                             |
| ----------------- | ---------------------------------- |
| `Account`         | Better Auth (added via db push)    |
| `Session`         | Better Auth (added via db push)    |
| `Verification`    | Better Auth (added via db push)    |
| `StoreInvitation` | Store Members phase                |
| `StoreApiKey`     | replaces/renames the init `ApiKey` |

There may also be **column-level** drift on existing tables (fields added via db push). §4 detects all of it authoritatively — do not assume this table is complete.

### Strategy — forward-only, no data loss

1. **Baseline** the existing `init` migration as _already applied_ on every deployed DB (the tables exist; we must not recreate them).
2. **Generate one corrective migration** capturing the drift (the ~5 tables above + any column changes).
3. On the deployed DB(s) the drift objects **already exist** (db push made them), so the corrective migration is marked _applied_ there too — **no DDL runs against prod data**.
4. **Prove** the migrations now reproduce the deployed schema (empty diff). Any residual becomes a second tiny forward migration.
5. Commit the new migration(s) so fresh environments and CI get the full schema.

---

## 2. Preconditions (OWNER)

- [ ] **Connection URL for every deployed environment.** Confirm how many exist — at minimum the dev DB on AWS RDS; is there also staging / prod? Each is reconciled separately (§3–§6 per env).
    - RDS URLs need `?sslmode=no-verify` for the pg adapter (Prisma P1011 otherwise). Prisma CLI itself uses `sslmode=require`/`prefer` — keep a CLI-friendly variant handy.
- [ ] **A throwaway shadow database URL** (empty DB Prisma may freely reset) for `migrate diff --from-migrations` and for `migrate dev`. A local Docker Postgres works: `docker run -d --rm -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16` → `postgresql://postgres:postgres@localhost:5433/shadow`.
- [ ] **A fresh backup / snapshot of each deployed DB** taken immediately before §5 (RDS: create a manual snapshot, or `pg_dump`). Rehearse the restore path once.
- [ ] **A maintenance window.** Only §5 writes to the live DB, and only to `_prisma_migrations` (plus DDL _only_ in the residual case). Pick a low-traffic moment.
- [ ] **Go-ahead** to run the §5 commands (or run them yourself with me guiding each).

> Handling secrets: prefer running the DB-touching commands yourself in-session with the `!` prefix and pasting output, rather than sharing raw prod credentials. Everything in §3–§4 is read-only.

---

## 3. Setup (no writes to prod)

```bash
cd packages/database

# Shadow DB for diffing/replaying migrations (empty, disposable):
export SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/shadow"

# Per environment, a CLI-friendly URL (Prisma CLI, not the pg adapter):
export DEV_DB_URL="postgresql://.../saroh_dev?sslmode=require"
# export PROD_DB_URL="postgresql://.../saroh_prod?sslmode=require"
```

Sanity (read-only): `pnpm exec prisma validate` and `pnpm exec prisma migrate status --url "$DEV_DB_URL"` (expect it to report the DB is ahead / not fully managed — that is the drift we are fixing).

---

## 4. Detect the true drift (read-only)

Run **per environment**. These never write.

**a) What the deployed DB has that the migrations don't** (the real drift, incl. columns):

```bash
pnpm exec prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-url "$DEV_DB_URL" \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script > /tmp/deployed_ahead_of_migrations.sql
# Non-empty ⇒ the DB is ahead of migrations by exactly this SQL (expected: the ~5 tables).
```

**b) What `schema.prisma` expects that the deployed DB is missing** (should be empty if db push kept the DB current):

```bash
pnpm exec prisma migrate diff \
  --from-url "$DEV_DB_URL" \
  --to-schema ./prisma/schema.prisma \
  --script > /tmp/schema_ahead_of_deployed.sql
# Ideally empty. If NOT empty, the deployed DB is behind schema.prisma — note it; §5 step 4 applies it.
```

**c) The corrective migration content** (migrations → schema; what the new migration must contain):

```bash
pnpm exec prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema ./prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --script > /tmp/corrective.sql
```

Read all three. Confirm (4a) ≈ (4c) ≈ the expected ~5 tables, and that nothing unexpected (e.g. a table drop, data-losing column change) appears. **If a destructive statement shows up, STOP and review before proceeding.**

---

## 5. Reconcile

### Step 1 — Author the corrective migration (offline, in the repo)

Create it against the shadow DB so Prisma writes a proper migration folder:

```bash
# Generates prisma/migrations/<ts>_reconcile_schema_drift/migration.sql from the
# diff between applied migrations and schema.prisma, using the shadow DB.
pnpm exec prisma migrate dev --name reconcile_schema_drift --create-only
```

`--create-only` writes the migration **without applying it anywhere**. Open the generated `migration.sql`, confirm it matches `/tmp/corrective.sql` from §4c, and hand-edit if needed:

- If `ApiKey` → `StoreApiKey` came through as `DROP TABLE "ApiKey"` + `CREATE TABLE "StoreApiKey"`, and the deployed table already holds data, rewrite it as `ALTER TABLE "ApiKey" RENAME TO "StoreApiKey"` (+ any column deltas) to preserve rows. Verify against what §4a actually shows in the live DB.

Commit this migration to the repo (it is the source of truth for fresh environments).

### Step 2 — ⚠️ OPERATOR GATE: backup

Take the fresh snapshot/backup of the target environment **now** (Precondition §2). Do not proceed without it.

### Step 3 — Baseline: mark both migrations as already-applied on the deployed DB

Because the deployed DB already contains everything (init tables via the old migration, drift tables via db push), we record both migrations as applied **without running their SQL**:

```bash
# Tell Prisma the init migration is already applied (its tables exist):
pnpm exec prisma migrate resolve \
  --applied 20260214131612_init_multi_tenant_schema \
  --url "$DEV_DB_URL"

# And the corrective migration is already applied (its objects also already exist):
pnpm exec prisma migrate resolve \
  --applied <ts>_reconcile_schema_drift \
  --url "$DEV_DB_URL"
```

This only inserts rows into `_prisma_migrations`. No table DDL runs.

### Step 4 — Apply residual, if any

If §4b (`schema_ahead_of_deployed.sql`) was **non-empty**, the deployed DB is genuinely missing something the schema expects. Apply exactly that residual during the window:

```bash
pnpm exec prisma db execute --file /tmp/schema_ahead_of_deployed.sql --url "$DEV_DB_URL"
```

(If the residual is meaningful, prefer folding it into a _third_ small committed migration rather than an ad-hoc execute, so history stays complete. Judge at execution time based on size.)

---

## 6. Verify (per environment)

```bash
# 1. Prisma considers the DB fully managed and up to date:
pnpm exec prisma migrate status --url "$DEV_DB_URL"        # "Database schema is up to date!"

# 2. The migrations reproduce the deployed schema exactly (THE acceptance check):
pnpm exec prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-url "$DEV_DB_URL" \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code                                              # exit 0 = empty diff = success

# 3. A brand-new DB built purely from migrations matches schema.prisma:
pnpm exec prisma migrate deploy --url "$SHADOW_DATABASE_URL"   # on a RESET shadow
pnpm exec prisma migrate diff \
  --from-url "$SHADOW_DATABASE_URL" \
  --to-schema ./prisma/schema.prisma \
  --exit-code                                              # exit 0 = fresh deploy == schema
```

All three green on **every** environment ⇒ ticket acceptance met.

---

## 7. Rollback

- Nothing before §5 step 3 changed the live DB — abort freely.
- §5 step 3 only added `_prisma_migrations` rows: undo with
  `pnpm exec prisma migrate resolve --rolled-back <migration> --url "$DB_URL"`, or delete those rows.
- §5 step 4 (residual DDL) or the rename: restore from the §2 backup if anything looks wrong.

---

## 8. After

- [ ] Drop the throwaway shadow DB.
- [ ] `pnpm --filter @saroh/database db:migrate:deploy` is now the canonical deploy path — wire it into deploys (and note it in CI/deploy docs).
- [ ] From here on: **schema changes go through `prisma migrate dev`, never `db push`** against shared DBs. Add this to contributor docs so drift doesn't recur.
- [ ] Update the Stage 0 tracker in `IMPLEMENTATION_BACKLOG.md`: S0-004 → Done, with the reconcile migration SHA.
