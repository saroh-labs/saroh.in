# Backup and restore drill (#106)

**Purpose:** prove that the newest backup of an environment's database can be
restored, that it holds what the live database holds, and how long that takes.
A backup nobody has restored is a hope, not a backup.

**Status:** written 2026-09-26, **not yet run**. The first run is on the
development server, with the user's approval. Record each run in the log at the
end.

**Where:** on the database host itself, so no dump crosses the network. Every
command below uses placeholders. Hosts, paths, container names and credentials
stay in the operator's notes, never in this repository.

| Placeholder           | Meaning                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `<pg>`                | how you reach `psql`/`pg_restore` on the host (e.g. inside the DB container)   |
| `<source-db>`         | the live database the backup was taken from                                    |
| `<dump>`              | the newest backup file the deploy's rollout wrote (custom format, `-Fc`)       |
| `saroh_restore_drill` | the scratch database: always this name, so it can't be mistaken for a live one |

The deploy's rollout takes a backup before every migration. Use the newest of
those. If it's plain SQL rather than custom format, use `psql -f` in step 3
instead of `pg_restore`.

## Before you start

- It's a quiet hour, and the host has free disk of at least twice the size of
  `<dump>` (`df -h`; `ls -lh <dump>`).
- Nothing else is called `saroh_restore_drill` (step 2 refuses if it is).
- You run everything as the database owner. The drill creates and drops one
  database and touches nothing else.

## Steps

**1. Note the backup's age and size.**

```bash
ls -l --time-style=+%FT%T <dump>
```

**2. Create the scratch database.** Stop if it already exists.

```bash
<pg> psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE saroh_restore_drill"
```

**3. Restore, timed.**

```bash
time <pg> pg_restore --no-owner --no-privileges --exit-on-error \
    -j 4 -d saroh_restore_drill <dump>
```

Write down the `real` time: that's the restore time. `--exit-on-error` makes
any failure loud. A restore that "mostly worked" is a failed drill.

**4. Count rows in both, per table.** Run this in the scratch database and in
`<source-db>`:

```sql
-- Exact counts for every table in public, one row per table.
SELECT format(
  'SELECT %L AS t, count(*) AS n FROM public.%I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
```

Save each output (`\o drill-restore.txt` / `\o drill-source.txt` before
`\gexec`), then `diff` them.

- **Expected:** identical for every table, **except** tables written since
  the backup was taken (the job queue, analytics events, webhook inbox,
  sessions). Their source count may be higher, never lower.
- **A table missing, or a restored count higher than the source:** the drill
  failed. Stop and report.

**5. Check the migration history matches.**

```sql
SELECT count(*), max(migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL;
```

The scratch database must show the same latest migration as `<source-db>`, or
the migration applied after the backup (check the deploy log).

**6. Spot-check that the data reads.** In the scratch database:

```sql
SELECT count(*) FROM "Organization";
SELECT id, "createdAt" FROM "Order" ORDER BY "createdAt" DESC LIMIT 3;
```

The newest order should be from just before the backup.

**7. Drop the scratch database.**

```bash
<pg> psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE saroh_restore_drill"
```

Confirm it's gone (`\l`). Delete the two count files: they describe customer
data volumes.

## What would make it better, later

- Run it on a schedule (monthly), and alert if the newest backup is more than a
  day old.
- Keep a copy of the backup **off the host**. A backup on the same disk as the
  database doesn't survive losing the host.
- Restore production's backup into a throwaway database too, once there's
  enough data for the time to mean something.

## Log

| Date | Environment | Backup age | Dump size | Restore time | Counts match? | By  |
| ---- | ----------- | ---------- | --------- | ------------ | ------------- | --- |
| —    | development | not run    |           |              |               |     |
