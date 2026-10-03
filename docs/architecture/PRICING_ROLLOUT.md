# Pricing catalogue rollout

> **Read when:** releasing the plans catalogue (plan units U1–U13) to any
> environment, or running the grandfather backfill. Patterns:
> `docs/patterns/backend-auth-and-access.md` (entitlements),
> `docs/patterns/backend-jobs.md` (backfills).

The catalogue lands in steps, so no business is ever read as Free that
didn't sign up after the release. This file keeps those steps in order. It
names no price, limit, date or plan term; those are the owner's, decided at
release time.

## Order

1. **API with the catalogue tables, reads and writes (U1–U4).** Version 1 is
   published from the admin console. Nothing reads the catalogue for
   enforcement yet: `EntitlementService` still reads the legacy `Plan` rows
   and `FREE_ENTITLEMENTS`.
2. **API with plan overrides (U5).** `EntitlementService` now reads a live
   `plan` override ahead of the subscription's plan (below). Deploy it
   before step 3: an older API ignores the overrides the backfill writes, so
   they would do nothing.
3. **Grandfather backfill (U5)**, with the end date the owner sets. Dry run
   first, read the counts, then run it for real:

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/pricing-grandfather.cli.ts \
        --plan grow --until <end date> --joined-before <release time> --dry-run
    ```

    `--joined-before` is when step 2 went out, not "now": a re-run then never
    grandfathers someone who signed up after the release. Re-running is safe;
    a business with a live plan override is left alone, so a second run
    reports everything as "already on a plan override".

4. **API with U12** — access read from the catalogue. Only now does the
   published Free replace `FREE_ENTITLEMENTS` as the fallback, and only in an
   environment where step 3 has run.
5. **U13 enforcement**, behind its kill switch; then the merchant app (U14)
   and Saroh's own billing (U15–U17).

## How a plan override reads (U5)

- An `EntitlementOverride` with `kind = 'plan'`, `planKey` (a catalogue plan
  id such as `grow`) and `expiresAt` (null lasts until removed). The
  migration's CHECK requires the `planKey`.
- Live means unrevoked and not past `expiresAt`, read at request time; there
  is no sweep. With several, the newest applies.
- It replaces the subscription's plan; raises still apply on top
  (`OVERRIDE_ORDER`: plan first).
- Until U12, it is read through the legacy rows that map to the plan
  (`LEGACY_PLAN_KEYS`: `business` and `pro` → `grow`, `free` → `free`): a
  business whose own plan already maps to it keeps its own row; Free is the
  free floor; otherwise the newest active monthly legacy row. An override
  naming a plan with no legacy row is ignored (logged as
  `plan_override_unresolved`), never read as Free.
- Who the backfill skips: businesses that joined on or after the cutoff,
  deleted ones, those with a live subscription on any plan other than Free,
  and those that already have a live plan override.

## Undoing it

Revoke the overrides (`revokedAt`) rather than deleting them; the audit
stream keeps `organization.plan.grandfathered` per business. Extending one
business's date is the admin console's job (U11).
