---
name: saroh-migrations
description: Use when adding, editing, or reviewing a Prisma migration or a change to schema.prisma in packages/database
---

# Saroh Migrations

## Overview

A migration is correct only if it **replays onto an empty database** and leaves
that database **matching `schema.prisma` exactly**.

Both halves have failed in this repo, and neither failure was visible in a
normal review or in the rest of CI.

**Core principle:** the database you develop against was built incrementally and
proves nothing. Only a replay from empty proves the history works.

## The one command

```bash
createdb saroh_migrate_check   # must be EMPTY
DATABASE_URL="postgresql://<user>@localhost/saroh_migrate_check?host=/var/run/postgresql" \
DATABASE_TARGET_CONFIRM=saroh_migrate_check \
  pnpm --filter @saroh/database db:verify:replay
```

It replays the whole chain into the empty database and then diffs the result
against `schema.prisma`. Exit 0 means both halves hold. It refuses to run
against a database that already has tables, so it can never touch `saroh-dev`.

CI runs the same command in the `migration-replay` job.

## The two failures it catches

### 1. The chain does not replay

Three RLS migrations were timestamped _before_ the migrations that created the
tables they targeted (`eb6ce65`, issue #146). They only ever succeeded where the
finished schema already existed. Every developer database was fine; the first
genuinely fresh one was not:

```
ERROR: column "organizationId" does not exist  (SQLSTATE 42703)
```

That is every new environment, every restore from backup, every integration-test
database, and every shadow database `prisma migrate dev` builds.

**Timestamps are the ordering key and applied migrations cannot be reordered.**
The fix is to guard the early migration on what actually exists and apply the
final state in a later migration — never to renumber a migration that has run
anywhere.

### 2. The migration and the datamodel disagree

`20260905000000_booking_outcome` created an index:

```sql
CREATE INDEX "Booking_organizationId_outcome_endAt_idx"
    ON "Booking" ("organizationId", "outcome", "endAt");
```

…and `schema.prisma` never declared it. Prisma reads an index that is in the
database but not in the datamodel as **drift**, so the next `prisma migrate dev`
anyone ran generated a migration **dropping** the index the workflow depends on.

This is silent. It passes typecheck, lint, unit tests and the integration suite.

**Anything a migration creates must also be declared in `schema.prisma`.** Not
just tables and columns — indexes, unique constraints, defaults.

## Why the rest of CI cannot see either one

The integration suite builds its database with `prisma db push`, which reads
`schema.prisma` directly and **never executes a migration file**. So the
migration directory is not exercised by any other gate. Do not assume a green CI
run has tested your migration; before `migration-replay` existed, it never had.

## Rules

- **Never renumber or edit a migration that has been applied anywhere.** Add a
  new one that corrects the state.
- **Never hand-edit a migration to match the schema.** Fix the schema, or write
  a follow-up migration; then re-run the replay check.
- **Raw SQL in a migration still needs its schema counterpart.** If you write
  `CREATE INDEX` by hand, add the `@@index` to the model in the same commit.
- **Run the replay check before you commit**, not after review. It takes under a
  minute and it is the only thing that looks at the file you wrote.
- **The guard is not an obstacle.** `DATABASE_TARGET_CONFIRM` exists so a
  throwaway database is named on purpose. Do not bypass `db:guard`.

## Red flags

| You are about to…                                       | Stop and…                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Change a timestamp on a migration directory             | Write a new migration instead                                       |
| Add `CREATE INDEX` / `ALTER TABLE` as raw SQL           | Declare the same thing in `schema.prisma`                           |
| Say "it works on my database"                           | Replay from empty; your database was built incrementally            |
| Accept a `migrate dev` migration that only DROPs things | That is drift, not a change you asked for — read it before applying |
