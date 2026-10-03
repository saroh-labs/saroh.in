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
8. **Saroh billing (U15)** needs, on the instance: Saroh's own Razorpay keys
   and webhook secret (`SAROH_RAZORPAY_KEY_ID`, `SAROH_RAZORPAY_KEY_SECRET`,
   `SAROH_RAZORPAY_WEBHOOK_SECRET`), the webhook pointed at
   `/public/billing/webhooks/razorpay` with the `subscription.*` events, and
   the migration `20261021120000_saroh_billing`. Run the test-mode spike
   below before the first real checkout. Until the keys are set, a publish
   with paid plans stays **waiting** (its plans can't reach the provider) and
   the version before it stays live — nothing breaks, nothing is sold.

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

## Saroh billing (U15)

How a business pays for a catalogue plan. Code: `billing/checkout.service.ts`,
`checkout-quote.ts` (the one rule), `billing-webhook.service.ts`,
`plan-moves.ts`, `provider-plan-sync.service.ts`, `moves-apply.handler.ts`.

- **Provider plans.** A publish writes a PENDING `PricingProviderPlan` per
  paid `Plan` row (yearly only while yearly is on) and queues
  `billing.provider-plans.sync`. The job asks the provider for a plan made
  under the row's id, else makes one at the row's price **with GST**
  (`withGstPaise`), per month or per year: SYNCED with the provider's id, or
  FAILED with the reason — a refusal at once, an unanswered call after
  `MAX_SYNC_ATTEMPTS`. While a row waits the job re-queues itself with a
  growing pause. A version with any row not SYNCED never goes live; when the
  last one is SYNCED and its go-live has passed, it is live there and then
  and saroh.in is told (`pricing.site.revalidate`, cause `go-live`).
  `POST /admin/pricing/versions/:v/provider-sync` (`pricing:publish`) asks
  again for the FAILED rows. Cancelling a version drops its waiting sync.
- **Changing plan** — `GET …/billing/change-plan?plan=&cycle=` quotes
  (`billing:read`), `POST …/billing/change-plan {plan, cycle}` changes
  (`billing:manage`). The client sends a plan id and a cycle only; the plan
  row comes from the live version and every amount from `quoteChange`
  (integer paise, GST per line). The kinds:
    - **Free**: at the end of the period paid at the provider (a pending
      move, the provider subscription told to end with the period), else at
      once. No checkout.
    - **NEW** (from Free, cancelled, or a plan not billed through the
      provider): a checkout; on the plan once its first charge is paid.
    - **UPGRADE** (pricier, same cycle, mid-period): a checkout whose
      provider subscription starts at the period's end with the difference
      for what's left (prorated, GST added) as an upfront charge; on the plan
      once authorised, and the old provider subscription is cancelled.
    - **SCHEDULED** (cheaper, the other cycle, or the plan a "move them" is
      taking it to): a checkout authorised now that starts on the date; it
      waits as the subscription's pending move, and the old provider
      subscription is told to end with the period.
- **A checkout** (`BillingCheckout`) is OPEN until the webhook completes it,
  lapses after a day (the sweep cancels it at the provider), and is replaced
  by a newer one. The provider's authorisation link is returned once and never
  stored. `GET …/billing/checkout` lists the open and scheduled ones.
- **Webhooks** (`/public/billing/webhooks/:provider`): signature first, then
  the inbox row and its effect in one transaction (a duplicate event id is a
  no-op; a failed effect rolls the row back so the retry applies). An event
  older than the subscription's `providerEventAt` changes nothing, and
  CANCELLED is terminal, so a late `activated` can't re-open a cancelled
  plan. `charged` renews (new period end, a due move applied); `pending` is
  PAST_DUE; `halted` is CANCELLED — read as Free — and the provider
  subscription is cancelled; `cancelled`/`completed` applies a move to Free or
  to an authorised plan, else CANCELLED.
- **Moves** (KTD-4) apply on the renewal webhook or the hourly
  `billing.moves.apply` sweep, and only when ready (`moveReadiness`): never
  while the version's provider plans aren't SYNCED, and never at a new amount
  the provider would charge without the business authorising it (OQ-6) — the
  access read shows such a move as `waiting: "authorise"` and keeps the old
  plan; a SCHEDULED checkout to the new plan is how the business authorises
  it. A publish never overrides a change the business chose for its period's
  end.
- **Not here:** trials, coupons, add-on purchases and yearly offers (U16),
  Saroh's own invoices and billing emails (U17), limit enforcement (U13,
  behind `PLAN_ENFORCEMENT`), the merchant screens (U14).

### Razorpay test-mode spike (OQ-6) — **unverified**

No test key was available when U15 was built, so the adapter follows
Razorpay's published Subscriptions API and every answer below is
**unverified**. Run each against test mode before the first real checkout and
correct the adapter and this list.

1. **Plan objects.** One Razorpay plan per catalogue row × cycle
   (`POST /plans`, `period` monthly|yearly, `interval` 1, `item.amount` the
   GST-inclusive paise), made once and never edited — a price change is a
   new version, so a new plan. Unverified: that plans can't be edited or
   deleted (assumed), and that `GET /plans` can be paged to find one by its
   `notes.saroh_ref` after a lost answer (Razorpay has no lookup by notes).
2. **Proration.** Assumed Razorpay doesn't prorate for Saroh. An upgrade is a
   **new** subscription with `start_at` = the old period's end and the
   difference charged as an upfront `addons` item at authorisation; the old
   subscription is cancelled at once. Unverified: that an addon with a future
   `start_at` is charged at authentication, and that `subscription.authenticated`
   only arrives once it is paid.
3. **Mid-cycle change.** Assumed not done in place: Razorpay's
   `PATCH /subscriptions/:id` (`plan_id`, `schedule_change_at`) is
   documented for card mandates only, and a UPI mandate's maximum may not
   cover a new amount. Every change of amount is a new subscription the
   business authorises (SCHEDULED for a cheaper plan, a cycle change or a
   "move them" at a new price), and the old one is cancelled at the cycle's
   end (`cancel_at_cycle_end: 1`). Unverified: whether the update API would
   serve card subscriptions better, and how a UPI mandate's limit is shown.
4. **Plan-object sync on a move.** A move at the same amount and cycle keeps
   the old provider subscription (its plan object differs, the amount
   doesn't). A move at a new amount is never applied silently. Unverified:
   that keeping a subscription on an older plan object at the same amount has
   no side effect on invoices or renewals.
5. **Events.** Assumed: `subscription.authenticated` (mandate authorised),
   `activated` and `charged` (paid; `payload.subscription.entity.current_end`
   the period's end), `pending` (a failed charge being retried), `halted`
   (retries exhausted), `cancelled`, `completed`; the delivery id in
   `x-razorpay-event-id` and the event time in `created_at`. Unverified: the
   order they arrive in for a `start_at` subscription, and whether `halted`
   can resume.
6. **`total_count`.** Required by Razorpay; sent as 120 monthly / 10 yearly
   charges so a plan runs until cancelled. Unverified: the maximum allowed.

## Undoing it

Revoke the overrides (`revokedAt`) rather than deleting them; the audit
stream keeps `organization.plan.grandfathered` per business. Extending one
business's date is the admin console's job (U11).
