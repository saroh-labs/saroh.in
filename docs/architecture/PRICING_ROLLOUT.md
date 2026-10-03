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

4. **API with U12** — access read from the catalogue
   (`CatalogueAccessService`). Safe before step 5: a business with no
   subscription row and no plan override still reads `FREE_ENTITLEMENTS`,
   and nothing new is locked while `PLAN_ENFORCEMENT` is off. From this
   release every new sign-up gets a Free subscription row on the live
   version (OQ-2).
5. **Free-rows backfill (U12)**, after step 3, with step 3's cutoff. Dry run
   first:

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/pricing-free-subscriptions.cli.ts \
        --plan free --grandfathered-before <step 3's --joined-before> --dry-run
    ```

    Every business without a subscription row gets the live Free plan's
    monthly row. A business that joined before the cutoff and has no plan
    override is left alone ("not grandfathered yet"), so running it early
    never puts an existing business on Free. Only now does the published
    Free replace `FREE_ENTITLEMENTS`, business by business, and only where
    steps 3 and 5 have run.

6. **Turn on `PLAN_ENFORCEMENT`** (the kill switch, OQ-4) on that instance:
   module availability then locks a module the plan leaves out (after the
   rollout gate, DEC-057), and U13's limits are enforced. Off again undoes
   it at once, without a deploy.
7. **U13 enforcement**, behind the same switch; then the merchant app (U14)
   and Saroh's own billing (U15–U17).

## How a plan override reads (U5)

- An `EntitlementOverride` with `kind = 'plan'`, `planKey` (a catalogue plan
  id such as `grow`) and `expiresAt` (null lasts until removed). The
  migration's CHECK requires the `planKey`.
- Live means unrevoked and not past `expiresAt`, read at request time; there
  is no sweep. With several, the newest applies.
- It replaces the subscription's plan; raises still apply on top
  (`OVERRIDE_ORDER`: plan first). Since U12 its `planKey` goes straight to
  `resolveAccess` on the business's version; one naming a plan that version
  doesn't have is ignored (logged as `plan_override_unresolved`), never
  read as Free.
- Who the backfill skips: businesses that joined on or after the cutoff,
  deleted ones, those with a live subscription on any plan other than Free,
  and those that already have a live plan override.

## How access reads (U12)

`CatalogueAccessService.resolve` is the one place the API turns a business
into access; `EntitlementService`, module availability and
`GET organizations/:org/billing/access` read it.

- **Where it is on:** its subscription unless CANCELLED, or a pending move
  once `pendingFrom` has passed. A catalogue row (`catalog.<plan>`) is read on
  its own version; a legacy row (`business`, `pro`, `free`) as the plan
  `LEGACY_PLAN_KEYS` maps it to, on the live version. With no live
  subscription it is Free on the live version — if it has a cancelled
  catalogue row or a live plan override. Otherwise (no row, no override) it
  reads `FREE_ENTITLEMENTS`.
- **Then** its live overrides (plan, remove, grant, limit, raise) and the
  add-ons on its subscription, read from the same version.
- **The limit map** `check`/`can` read: every catalogue row by id (its cap,
  `true`, or `false`), a row's legacy key beside it (`teamMembers`), and the
  keys no row sells — from the business's own legacy row while it is still on
  that plan, else the product defaults (`sites`, `storefronts`) and
  `customDomain` on with any paid plan.
- **Fail safe:** a missing or invalid version, or a plan not in it, reads the
  business off its own row (or the free floor) and logs
  `catalogue_access_unresolved`.

## Undoing it

Revoke the overrides (`revokedAt`) rather than deleting them; the audit
stream keeps `organization.plan.grandfathered` per business. Extending one
business's date is the admin console's job (U11).
