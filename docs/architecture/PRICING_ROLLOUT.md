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
   version (OQ-2). One who signs up while no version is live (the first
   scheduled, or waiting on the provider) gets it at go-live:
   `billing.free-rows.start`, queued at every go-live, runs this step's rule
   with the first version's publish as the cutoff (#839), so it never starts
   a business that joined before pricing existed and has no plan override.
   The admin Health page's **Plan rows** counts businesses on no row.
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
   it at once, without a deploy. A business with its own domain on a plan
   without one is told within the hour, and the domain is paused 3 days
   later (below). The merchant-site renderer must be on a release that
   knows a paused domain before this is turned on.
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
9. **Saroh's own invoices (U17)** need, on the instance: the migration
   `20261021130000_saroh_invoices`, and Saroh's seller details
   (`SAROH_LEGAL_NAME`, `SAROH_GSTIN`, `SAROH_GST_STATE`,
   `SAROH_REGISTERED_ADDRESS`, `SAROH_BILLING_EMAIL`, `SAROH_INVOICE_SAC`,
   `SAROH_INVOICE_PREFIX`; `ENVIRONMENT.md`) set **before the first real
   charge**: each invoice copies them when it is written and is never
   rewritten. The series restarts every financial year
   (`SRH/26-27/00001`).

## How a plan override reads (U5)

- An `EntitlementOverride` with `kind = 'plan'`, `planKey` (a catalogue plan
  id such as `grow`) and `expiresAt` (null lasts until removed). The
  migration's CHECK requires the `planKey`.
- Live means unrevoked and not past `expiresAt`, read at request time; there
  is no sweep at the end itself. With several, the newest applies.
- Before it ends (#805): when the end moves the business to a cheaper plan,
  the hourly billing sweep (`billing.moves.apply`, step 3) tells it 30, 7
  and 1 days ahead, with an inbox notice (`plan.ending`) and an email to its
  billing people, each claimed once per override, end and stage
  (`CustomerNotice` `PLAN_ENDING`). A plan with ten days left is told at
  once. `GET …/billing/access` returns `planEnding` in its last 30 days, and
  the app shows a countdown above every page. An end that costs nothing (a
  business that has since paid for a plan as good) says nothing.
  `billing/plan-ending.ts`, `CatalogueAccessService.planEnding`.
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
  add-ons on its subscription, read from the same version: each one
  offered on the plan it is billed on, for all that is held (DEC-157).
- **The limit map** `check`/`can` read: every catalogue row by id (its cap,
  `true`, or `false`), a row's legacy key beside it (`teamMembers`), and the
  keys no row sells — from the business's own legacy row while it is still on
  that plan, else the product defaults (`sites`, `storefronts`) and
  `customDomain` on with any paid plan.
- **Fail safe:** a missing or invalid version, or a plan not in it, reads the
  business off its own row (or the free floor) and logs
  `catalogue_access_unresolved`.

## How limits are enforced (U13)

`MeteringService` (`billing/metering.service.ts`) is the one place a write
asks whether the business's plan has room; `billing/metering.ts` is the one
place usage is counted, for enforcement, `GET …/billing/access`'s `usage`
and the admin's usage lines and impact (`ImpactService`).

- **Only behind `PLAN_ENFORCEMENT`.** Off, nothing is counted or refused
  on a write, and no notice is sent; `usage` is still shown. The limits
  `EntitlementService.check` has always enforced (`sites`, `storefronts`,
  `customDomain`) are unchanged either way.
- **What is counted:** products not archived; orders this month that
  stand (not cancelled, not an online checkout nobody paid); bookings this
  month that are confirmed (a course's sessions left out); posts live on
  a site; everyone in the business whatever their role, plus open
  invitations and bookable staff with no login (DEC-155); connected payment
  and messaging providers. A month is the business's own, in its zone.
- **Where it is refused:** making, copying, importing or un-archiving a
  product; an order taken by hand; a booking, by hand or on the booking
  page (which is told only that the business isn't taking bookings
  online, before any payment); putting a post live; inviting someone;
  connecting a new provider; making a custom role; changing the site's
  theme; turning on "Publishing needs approval". The site's checkout is a
  soft cap: never refused, the business is told.
- **Who is never refused:** a business the catalogue doesn't reach yet
  (no subscription row, no plan override); any business when its plan
  can't be read (logged `plan_meter_unresolved`).
- **Notices:** `plan.limit.notice` at 80%, at the limit and past a soft
  cap, once each per limit and month (`backend-jobs.md`).
- **A cap inside one thing (DEC-158):** the row `variants` caps how many
  variants ONE product may have. It is not counted across the business
  (`MODULE_MAP.variants.within`, `billing/item-limits.ts`), so it has no
  `usage`, no notice and no "over": only a new variant, or a copy, that
  would take a product past the cap is refused (`PLAN_LIMIT_REACHED`, in
  per-product words). A product already past it keeps every variant and
  every other save. Variants never count as products. A cell with no
  number, a cell that leaves the row out, and a version published before
  the row existed all cap nothing. Set per plan in Admin › Plans; a limit
  override raises it for one business. A catalogue made before the row
  gets it from the Modules tab's "Add Variants row" (it must carry the id
  `variants`; "Add module" makes an id of its own, which governs nothing):
  it arrives with no limit on any plan and hidden from the pricing page,
  so adding it changes nothing until a number is set and published.

## A business's own domain (DEC-139)

A domain belongs to a plan that includes one. When the plan stops including
it the domain is paused, never removed. Code: `billing/domain-plan.ts` (the
rule), `domain-plan.service.ts` (the reads), `domain-plan-notice.ts` (the
sweep's step), `sites/domain-paused.ts` (what the host answers).

- **Only behind `PLAN_ENFORCEMENT`.** Off, every domain reads `included`
  and nothing anywhere changes: no notice, no redirect, no word in the app.
- **What it reads:** `customDomain` in the business's entitlements (on with
  any plan that has a price, `PAID_PLAN_SWITCHES`; off on one without, and
  for a business the catalogue doesn't reach).
- **The states.** `ending`: the plan still includes a domain and is known
  to end within 30 days without one (a plan override's end, a pending
  move, a term nobody paid for again). `grace`: the plan has no domain; the
  domain shows the site for 3 days. `paused`: it sends visitors to the
  site's Saroh address. Back on a plan with a domain: `included`, at the
  next read.
- **The clock** is a `CustomerNotice` (`DOMAIN_PLAN_ENDED`,
  `domain-plan-ended`), written by the hourly sweep (`billing.moves.apply`)
  and dated at the end the business was told about, else at that sweep.
  Until it is written the domain is in its 3 days, so a sweep that isn't
  running pauses nothing.
- **Notices.** Ahead: a line in the plan-ending, term-ending or move-down
  notice and email, 30, 7 and 1 days before; the domain's own `DOMAIN`
  billing email where none of those is sent. At once: told within the
  hour. Paused: told once. To the business's owners, with an inbox notice
  that opens Plan and billing.
- **Paused, the host** (`GET public/sites/by-hostname/:hostname`) answers
  404 with `details.reason: "domain-paused"` and `details.to`, and the
  renderer answers the visitor 307, `Cache-Control: no-store`, to the same
  path there. The `Domain` row, its verification and its hostname at the
  host are never written.
- **Fail safe:** a plan that can't be read pauses nothing
  (`domain_plan_unresolved`).
- **Before turning enforcement on:** deploy the API and the merchant-site
  renderer with this; an older renderer treats the 404 as a host with no
  site.

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
    - **Free**: at the end of what is paid at the provider, a period or a
      first month (a pending move, the provider subscription told to end
      with it), else at once. No checkout.
    - **NEW** (from Free, cancelled, or a plan not billed through the
      provider; also a dearer plan chosen during the first month, DEC-159):
      a checkout; on the plan once its first charge is paid.
    - **UPGRADE** (pricier, same cycle, mid-period): a checkout whose
      provider subscription starts at the period's end with the difference
      for what's left (prorated, GST added) as an upfront charge; on the plan
      once authorised, and the old provider subscription is cancelled.
    - **SCHEDULED** (cheaper, the other cycle, or the plan a "move them" is
      taking it to): a checkout authorised now that starts on the date; it
      waits as the subscription's pending move, and the old provider
      subscription is told to end with the period.
    - **When it takes effect** is one rule, `change-timing.ts` (DEC-159):
      a dearer plan today, anything else once what was paid for has run
      out. See "During the first month" below.
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
  to an authorised plan, else CANCELLED. A provider subscription that ends
  ahead of the date the business's move waits for changes nothing: the
  plan is paid to that date (`runsToMoveDate`), and the sweep or the new
  plan's first charge applies the move then.
- **Moves** (KTD-4) apply on the renewal webhook or the hourly
  `billing.moves.apply` sweep, and only when ready (`moveReadiness`): never
  while the version's provider plans aren't SYNCED, and never at a new amount
  the provider would charge without the business authorising it (OQ-6) — the
  access read shows such a move as `waiting: "authorise"` and keeps the old
  plan; a SCHEDULED checkout to the new plan is how the business authorises
  it. A publish never overrides a change the business chose for its period's
  end.
- **Not here:** limit enforcement (U13, behind `PLAN_ENFORCEMENT`), the
  merchant screens (U14). Trials, yearly, coupons and add-ons are below
  (U16); Saroh's own invoices too (U17).

## Trials, yearly, coupons and add-ons (U16)

Code: `checkout-quote.ts` (the rule), `checkout.service.ts`, `offers.ts`,
`addons.service.ts`, `addon-charges.ts`, `pricing/coupons.service.ts`
(`findUsableCoupon`). Needs the migration `20261021160000_billing_offers`.

- **Trials.** A paid plan whose catalogue trial is on, where the change
  would be NEW and the business never completed a trial checkout, is a
  `TRIAL` checkout: a provider subscription starting at the trial's end, no
  upfront charge. Authorised → on the plan, `TRIALING`, period end = the
  trial's end, no invoice, and the trial-ending email queued a few days
  ahead (`TRIAL_ENDING_NOTICE_DAYS`; it re-reads the checkout for a coupon).
  The first charge makes it `ACTIVE` and is invoiced as a new plan's first
  (`NEW`); a failed one is `pending` then `halted` → Free. One trial per
  business, ever, and it is the offer of the plan it was started on: no
  other plan continues it (DEC-159, "During the first month" below).
- **During the first month** (DEC-159; `change-timing.ts`, read by the
  quote, the change and the webhook). "First month" is any `TRIALING`
  subscription billed at the provider: the nominal first month, or free
  first days.
    - **A plan that costs more a month** is a `NEW` checkout: its full
      first charge now, its 12-month term from now, no offer of its own.
      Paid → on it, `ACTIVE`; the first month's provider subscription is
      cancelled at once. What the first month cost is not refunded or set
      against it. Yearly of a dearer plan is the same, as one payment.
    - **A plan that costs the same or less** (the plan's own yearly row
      included) is a `SCHEDULED` checkout from the month's end, with
      nothing owed now. **Free**, or cancelling, is a pending move to Free
      on the same date. The business keeps its plan until then.
    - **Nothing more is charged for the plan it leaves.** A first month's
      provider subscription has no cycle to end with, so it is cancelled
      at once (`leavesWithCycle`), never "at cycle end", and its
      `cancelled` event leaves the plan where it is until the date.
      **Unverified against Razorpay:** that an authenticated subscription
      with a later `start_at` cancels cleanly at once, and that it then
      sends `subscription.cancelled`.
    - **A change that waits is replaced by the next one.** Free instead
      gives up the plan it authorised (its checkout CANCELLED, its
      provider subscription cancelled); a dearer plan today clears the
      pending move. A plan that waits and is then ended at the provider
      (the mandate withdrawn) becomes Free on the same date, since nothing
      would bill the plan it is on.
    - **Add-ons.** A dearer plan today starts afresh, like any `NEW`: every
      add-on held ends, and nothing owed for the first month's is charged.
      A plan from the month's end keeps the add-ons it is offered and ends
      the rest (DEC-157); Free ends them all. The quote names them first.
    - **A coupon** goes on a checkout that starts a plan, so it can be
      used on the dearer plan today (`NEW`) and not on a plan that waits.
      The first checkout's coupon is not carried to another plan. It was
      never redeemed (that happens with its first discounted charge), so
      it can still be used.
    - **The trial-ending email** says nothing to a business leaving at the
      month's end (`cancelAtPeriodEnd`); the move-down notice tells it.
- **Yearly** is the plan's yearly row ("pay for N months, get 12", priced
  at publish) on its yearly provider plan, sold only while yearly is on.
- **Coupons** (`?coupon=` on the quote, `coupon` on the change) apply to a
  checkout that starts a plan (`NEW`, `TRIAL`). Refused (400, field
  `coupon`): unknown or archived, paused, expired, not for the plan, used by
  this business, or used up — redemptions plus other businesses' OPEN
  checkouts with it, counted across businesses (`outsideOrgContext`).
  Monthly: its discount off each of its months; yearly: that many months'
  worth once, off the first yearly charge, never more than the charge. The
  checkout keeps `couponId`, `discountPaise`, `discountCharges`; the
  provider is told the GST-inclusive difference per charge; on Razorpay it
  is the coupon's Offer that takes it off, and that Offer must match
  (Coupons on Razorpay, below). The redemption row is written by the
  webhook with the first discounted charge (a NEW plan's completion, a
  trial's first charge), never at checkout; an abandoned checkout redeems
  nothing. Invoices take the discount off the plan line for the provider
  subscription's first `discountCharges` charges. Coupon tries are limited
  per business and per address (in-process, a speed bump). A coupon a
  checkout was quoted with is archived on delete, never removed.
- **Add-ons** — `GET …/billing/addons`, `PUT …/billing/addons/:id
{quantity}` (zero removes; `billing:manage`). On a paid catalogue plan
  billed through the provider, trialing or paid up; definitions from the
  plan's own version; a module add-on only where the plan leaves the module
  out, a pack only where the plan caps what it raises. Limits move at once.
  **Per plan (DEC-157):** an add-on may name the plans it is offered on
  (`plans`; none named is every plan) and the most a business may hold
  (`max`; none is `MAX_ADDON_QUANTITY`), both set in Admin › Plans ›
  Offers. A price that differs by plan is two add-ons of one kind, each
  naming its plans; the catalogue refuses two of a kind on one plan. A
  business is listed, sold, counted and charged only the add-ons its plan
  is offered. More than the maximum is refused; what is already held above
  a maximum set since is kept, counted and charged, and only buying more
  is refused. A plan change (an upgrade, a move applied) ends the add-ons
  the new plan isn't offered (`endAddonsNotOfferedInTx`) and buys nothing
  in their place; what the period already owed is still charged. An
  add-on whose id the new version doesn't have at all is left held and
  inert, as before. The quote (`GET …/billing/change-plan`) names the
  add-ons held today that the change ends (`addonsEnding`: id, name,
  quantity, and `onNewPlan`, the new plan's own add-on of the kind or
  null), by the same rule (`addons-ending.ts`), and the change-plan dialog
  says so before Confirm; a client reads a missing field as none. Each
  one ended is an audit row after commit (`organization.plan.addon.changed`,
  `reason: "plan-change"`). Not said: whether the business will be over a
  limit afterwards, which the quote has no counts for.
  Billed after the period, on the provider subscription's next charge
  (`SubscriptionAddonCharge`): bought part-way, what's left of the period
  (prorated); each later period, the whole of it for what's held at its
  start. `billing.addons.sync` sends each row; the renewal invoice takes
  the rows that charge carried as lines. A trial owes nothing for its days.
  A plan change that moves billing to a new provider subscription takes
  the rows along; Free (a move, at once, or a new plan from Free) drops the
  add-ons and what they owed. Known gap: what the last period before
  leaving for Free owes is never charged (no further charge exists).

### Provider assumptions added by U16 — **unverified**

7. **Coupons.** Settled by the test-mode spike (row 7 below) and the next
   section: a coupon goes through Razorpay only with its Razorpay Offer.
8. **Trials.** A subscription with `start_at` at the trial's end and no
   addons: assumed `subscription.authenticated` arrives once the mandate is
   authorised (a token charge, refunded), and `activated`/`charged` at
   `start_at`, with `current_end` the first paid period's end.
9. **Add-on items.** `POST /subscriptions/:id/addons` (one-off item, GST
   included) is assumed to be charged with the subscription's next invoice,
   accepted while the subscription is only authenticated (a trial), and
   dropped when the subscription is cancelled. Razorpay keeps no reference,
   so a retry after a lost answer may add the item twice. An item added
   after Razorpay has drawn up the next invoice is assumed to wait for the
   one after; Saroh's invoice would then list it a charge early.

### Coupons on Razorpay: Offers

Razorpay takes a discount off a subscription only through an **Offer**,
passed as `offer_id` when the subscription is made; Offers **can't be made
through the API** (405, test-mode spike). So each coupon is linked by hand:

1. The owner makes the Offer in the Razorpay Dashboard.
2. They paste its id into the coupon's **Razorpay offer ID** in the admin
   console (Plans › Offers). `PricingCoupon.razorpayOfferId`, migration
   `20261021170000_coupon_razorpay_offer`; the CHECK
   `PricingCoupon_razorpay_offer_shape` holds it to Razorpay's shape,
   `offer_` and 14 letters or digits (20 in all, Razorpay's docs). It can be
   changed or cleared at any time, unlike the code; each change is audited
   (`pricing.coupon.update`).

At checkout the adapter sends the coupon's `offer_id` with the
subscription. A coupon **without** one is refused before Razorpay is asked
(REFUSED → 409 "That coupon can't be used with payments just now. Try
without it.", field `coupon`), never charging the full price. Saroh's own
accounting is unchanged: the checkout's `couponId`, `discountPaise` and
`discountCharges`, the redemption row with the first discounted charge,
the invoice's `discountPaise` and the quote's amounts. Cashfree refuses any
coupon; the fake provider behaves as Razorpay does.

**The Offer's discount must match the coupon's.** Razorpay applies its
own Offer's terms, not Saroh's numbers, so a mismatch means the business is
charged one amount and invoiced another. Set the Offer to:

- a **flat** amount off (not a percentage), equal to the coupon's discount
  **with GST**, the difference `withGstPaise(price) −
withGstPaise(price − discount)` the quote shows;
- applied to the **first N charges**, N being the coupon's months on
  monthly, and **one** charge on yearly, where the amount is the months'
  worth (capped at the charge). A coupon of more than one month is a
  different Offer on yearly than on monthly, and one coupon holds one Offer
  id: limit such a coupon to monthly plans, or keep it to one month;
- valid on the plans the coupon names, for at least as long as the coupon
  (`expiresAt`), and not limited to a payment method a business might use.

There is **no check** that the two match: Razorpay documents no endpoint to
read an Offer back (`GET /v1/offers/:id` isn't in its API reference; only
the list `GET /v1/offers` was seen in the spike, and the shape of an
Offer's discount fields in it is unverified). Unverified as well: that
Razorpay refuses an unknown or expired `offer_id` with a 4xx (it would then
read as REFUSED, the same 409), and how the Offer's discount shows on the
`subscription.charged` amount. Check both with a test payment before the
first real coupon.

## Checkout and term (DEC-093)

Code: `checkout-quote.ts` (the rule, with `TERM_CHARGES` and
`RENEW_WINDOW_DAYS`), `billing-term.ts`, `term-end.ts`,
`checkout-confirm.service.ts`, `billing-webhook.service.ts`
(`reconcileCheckout`), the sweep's `endPaidYears`. Migration
`20261029160000_billing_first_month` lets a TRIAL checkout charge now.

- **Monthly** is a provider subscription made for 12 charges, never
  open-ended. **Yearly** is one payment for the year: a provider order for
  exactly what the quote says is due (`payNowTotalPaise`, a coupon already
  off), no mandate and no Offer; the checkout keeps `providerPlanId`
  `"one-time"`. A yearly plan never has a trial; yearly during a first
  month starts the year now for a dearer plan, and at the month's end for
  the plan it is on or a cheaper one (DEC-159). A move to yearly from monthly is paid now for a year
  that starts at the period's end (SCHEDULED); a pricier year mid-year pays
  the difference now.
- **The first month.** The catalogue's trial may carry `firstPaise` (before
  GST; never more than a month). The TRIAL checkout takes it as an upfront
  item with the mandate (`chargeNowPaise`), and the webhook invoices it on
  its own (source NEW, `chargeKey` `first-month:<checkout>`); the first full
  charge at the trial's end is still the plan's first invoice. Without it
  the days are free and the provider's small set-up check is refunded.
- **The quote names the mandate check** (`mandateCheck`): `PAID` — today's
  payment is a real charge and kept; `REFUNDED` — nothing is owed, the
  provider takes a small amount and refunds it; `NONE` — no autopay. The
  app says exactly that (`lib/saroh-billing/quote-words.ts`), and words the
  failure from the plan the business is on, not "back on Free".
- **Back from paying.** The app opens Razorpay's window from the
  checkout's `handoff` and, when it says paid, asks
  `POST …/billing/checkout/confirm`, which reads the provider and
  reconciles by the webhook's rule (idempotent with it). "Your plan" shows
  a checkout waiting for its payment as "checking" and offers "Check again"
  and "Continue payment" (the same subscription or order) — never "Start
  again", which made a second mandate.
- **The term's end.** Monthly ends 12 months after its charges start;
  yearly with the year. Inside the last 30 days the same plan quotes as
  `RENEW`: a SCHEDULED checkout (stored as SCHEDULED for the same plan)
  from the term's end, at the live price, that cancels nothing — the
  running term's last charges are still owed. A term nobody renews keeps
  the plan to the end of what was paid, then Free: a monthly subscription's
  `completed` with its period still running sets the move to Free on the
  period's end instead of cancelling at once; for a year paid once, which no
  provider event ends, the hourly sweep sets it (`endPaidYears`).
  **Assumed (the safest reading of DEC-093):** no grace period after the
  end; R15's 30-day price notice and 7-day move-down notice are not built
  here (they belong with #800–#802).
- **Unverified in Razorpay test mode:** that a subscription with an upfront
  item and a later `start_at` charges that item as the authorisation payment
  (spike row 2 says so for upgrades); the subscription status read
  (`paid_count`, `current_end`) and `order.paid`'s payload; when Razorpay
  sends `subscription.completed` relative to the last period's end.

## Saroh's own invoices (U17)

The GST invoice Saroh issues a business for each charge it takes for a
plan, and the billing mail. Code: `billing/saroh-invoices.service.ts`,
`saroh-invoice-terms.ts` (the pure rules), `saroh-invoice-paper.ts` (the
paper, drawn by the D16 renderer `invoices/invoice-pdf.ts`),
`saroh-seller.ts` (Saroh's details, from env), `billing-email.job.ts` and
`billing-emails.ts` (the words).

- **Written with the charge.** The billing webhook writes the invoice on
  its own transaction, under the subscription's row lock, so the inbox row,
  the plan change and the invoice commit together (a failure rolls the
  event back and the provider's retry writes it). The hooks are separate,
  named calls: `invoiceCheckoutChargeInTx` from `completeCheckout` (a new
  plan's first period, an upgrade's difference) and from a scheduled
  change's first charge, `invoiceRenewalInTx` from `renewed()`, and
  `paymentFailedInTx` when a charge fails (`pending`, `halted`). A
  SCHEDULED checkout that is only authorised charges nothing and gets no
  invoice.
- **Once per charge.** `SarohInvoice.chargeKey` is unique and checked before
  a number is taken: `upgrade:<checkout>` for an upgrade's difference,
  `period:<provider>:<subscription>:<period end>` for a period. A renewal
  whose provider subscription already has an invoice for a period end
  within half a cycle is not invoiced again — Razorpay's `activated` and
  `charged` for one payment make one invoice. An event with no period end
  is not invoiced.
- **Numbers** are Saroh's own series, `<prefix>/<financial year>/<5 digits>`
  (`SRH/26-27/00001`), counted in `SarohInvoiceSequence` inside the
  invoice's transaction, so a rolled-back charge leaves no gap. The
  financial year is India's (April–March, `Asia/Kolkata`).
- **GST** is 18% on the line's amount after any discount, rounded half-up to
  the paisa once per line (`gstPaise`, KTD-18), and added (Saroh's prices
  are before GST). Place of supply: the state given at checkout, else the
  state of the GSTIN given there or on the business's profile, else the
  profile's state, else Saroh's own. Saroh's state → CGST + SGST (odd paisa
  to CGST), any other → IGST. The migration's CHECKs hold the sums.
- **Checkout** takes an optional `billingState` (a GST state code or name)
  and `gstin` on `POST …/billing/change-plan`, checked before the provider
  is asked (a 400 for a state that isn't one, a GSTIN that doesn't check out
  or isn't in the state given), and keeps them on the `BillingCheckout`.
  Renewals read them from the checkout that made the provider subscription.
- **After money, nothing is refused** (DEC-068): a business with no address
  still gets its invoice; missing seller details are logged
  (`saroh_invoice_seller_incomplete`) and the paper says "Invoice", not
  "Tax invoice".
- **Reading.** `GET …/billing/invoices` (newest first) and
  `GET …/billing/invoices/:id/pdf` (drawn on request, never stored), both
  `billing:read`. The Settings › Plan list and download wait for U14's
  designs.
- **Mail.** `billing.email` (`backend-jobs.md`) sends the invoice with its
  PDF, a failed payment (retrying, or now on Free), a trial ending (U16
  queues it) and, 3 days before each autopay charge, the renewal reminder
  (#804, queued by the hourly sweep), to everyone whose role has
  `billing:manage`.

### Razorpay test-mode spike (OQ-6)

**Checked against Saroh's Razorpay test account on 2026-10-03** (made-up
amounts, test mode; the subscriptions made were cancelled):

| #    | Assumption                                                                                                       | Result                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Plans can't be edited; one per row × cycle, found by `notes.saroh_ref`                                           | **Confirmed.** No edit endpoint for plans (404); `GET /plans` returns `notes`, so paging finds a plan by `saroh_ref`. Plans can't be deleted either.                                                  |
| 2    | An upgrade/trial is a new subscription with `start_at` later, plus an upfront `addons` item for anything due now | **Confirmed.** Razorpay's checkout says "a payment of ₹X will be charged now … then ₹Y every month" from `start_at`; the upfront item is invoiced at once, the recurring amount starts at `start_at`. |
| 3    | No change of amount in place                                                                                     | **Confirmed for our use.** `PATCH /subscriptions/:id` refuses anything not Authenticated/Active; Saroh always makes a new subscription instead.                                                       |
| 6    | `total_count` 120 monthly / 10 yearly                                                                            | **Confirmed.** Accepted (up to 1,200 monthly and 100 yearly were accepted too).                                                                                                                       |
| 7    | Coupons need a Razorpay Offer                                                                                    | **Confirmed.** Offers can be listed (`GET /offers`) and passed as `offer_id` when a subscription is made, but **can't be created through the API** (405). They're made in the Dashboard.              |
| 9    | `POST /subscriptions/:id/addons`                                                                                 | **Confirmed** it's accepted on a subscription not yet authorised. Charging with the next invoice is still unverified.                                                                                 |
| —    | Cancel at cycle end                                                                                              | Refused on a subscription with no running cycle ("created"); cancel such a one immediately.                                                                                                           |
| 5, 8 | Event order (`authenticated`, `activated`, `charged`), `halted`                                                  | **Still unverified**: needs a completed test payment and a webhook reachable from Razorpay (a tunnel to the local API).                                                                               |

Note: Razorpay's checkout shows the account's business name. Set it to Saroh
in the Razorpay Dashboard before launch.

The original assumptions as written when U15/U16 were built:

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
   Since DEC-093 the checkout sends 12 (a monthly term) and yearly is an
   order; 120/10 is only the adapter's fallback.

## The merchant app (U14)

What a business sees of its plan, in `apps/app.saroh.in`. Code:
`lib/billing/` (access, refusals), `lib/saroh-billing/plan-view.ts` and
`billing-actions.ts`, `components/settings/plan-billing/`,
`components/billing/`.

- **Shown only where `NEXT_PUBLIC_PLANS` is `on`** (DEC-136,
  `lib/saroh-billing/plans-shown.ts`). Left out, as production has it until
  pricing opens, none of this section is drawn: Settings › Plan and billing
  and Saroh's invoice PDF are a 404; the page leaves the Settings sections,
  Settings search, the command menu and Activity; the plan and paused reads
  aren't asked, so no banner, limit notice, meter, lock or paused mark
  appears; a plan's refusal is said as any other failure; onboarding reads
  no plan picked on saroh.in and no invite. Switching it on is one line in
  the production `vars` of `apps/app.saroh.in/wrangler.jsonc` and a deploy of
  the workspace. It is a third step beside the two above, and none does
  another's work: publishing a catalogue (steps 3 to 5) and
  `PLAN_ENFORCEMENT` (step 6) stay the API's.
- **Settings › Plan and billing** (read with `billing:read`, changed by the
  owner alone), from the top, as the owner asked on 13 Oct 2026 ("multiple
  info messages are not good"):
    - **One status line**, always there (`lib/saroh-billing/plan-status.ts`,
      `nextParts`): the plan and what happens next. "You're on ‹plan› ·
      First month until ‹date› · then ‹amount› a month", "… · Next charge
      ‹amount› on ‹date›", "… · Nothing to pay", "… · ‹price› · Paid to
      ‹date›" (a year paid once), "… · ‹price› · Ends ‹date›" (a plan it
      is leaving), "… · Free until ‹date› · Nothing to pay" (a plan given
      for a while). How it is paid and "Change" sit under it.
    - **At most ONE message** under it, only when something needs the
      business (`planMessage`), most pressing first: a checkout waiting
      for its payment (it checks with the provider as it is drawn, and is
      what stops a second payment), a payment that failed, a change that
      is due and waits to be authorised, a plan change on its way with its
      date, the term's renewal in its last days, then a legacy plan's
      warning. Never two.
    - **The plans as cards, side by side** once the section has room for
      them and stacked on a phone (`plan-card.tsx`; from
      `GET /public/pricing`; Monthly | Yearly only while yearly is on).
      On each: the name, the price as the largest thing with "a month +
      GST" beside it, who it is for, the first-month offer only where
      `GET …/billing/change-plan` quotes a `TRIAL`, then the button at the
      card's full width, then every line of the plan (the catalogue's card
      lines, UX-045). The button says what it does, from the same quote
      (DEC-159): "Upgrade to ‹plan›" (filled; starts today, with "Starts
      today: ‹amount› now" under it), "Move to ‹plan› from ‹date›" (quiet;
      "You keep ‹plan› until then" under it), "Start ‹plan›" or "Start
      with the first month" from Free. The plan it is on carries "Current
      plan", an Ink edge and a button that is off. A plan a change already
      waits for says "Your plan from ‹date›" in the button's place: there
      is no button to make the change twice, and no way to undo it but
      choosing another plan. Without `billing:manage` no card has a
      button.
    - **"Compare everything on the pricing page"**, to saroh.in's
      `/pricing`, and **"How billing works"**, closed until asked for
      (`how-billing-works.tsx`): the first month's small print, the
      12-month term and its end, a plan given for a while, any note the
      one message left unsaid (with its way on), and how every plan is
      paid (`billingRules`). The change dialog says the same of the one
      change it quotes.
    - Then add-ons, a coupon held for the next change, and Saroh's
      invoices with their PDF (`/api/saroh-invoices/:id/pdf`, a proxy).

    Changing plan is the
    quote, a confirm, then Razorpay's window over the page (the
    `authorisationUrl` page only as a fallback) and a confirm with the
    provider (DEC-093); a move to Free needs none. The picker lists what each
    plan unlocks from the catalogue's card lines, prices before GST, and
    under a plan given for a while marks that plan "You're on this until …"
    (UX-044/045); a coupon is checked on Apply (UX-046). `?plan=&cycle=` opens that plan's change: every
    "Upgrade" in the app links there (`upgradeHref`).

- **Limit notices** at 80% and 100% on Products, Orders, Bookings, Blog
  (Posts), Team and Providers, in `limitNotice`'s words with
  `LIMIT_WORDS` (`@saroh/pricing-catalog`, shared with the API's
  refusals). Only while `enforced` (the access view's
  `PLAN_ENFORCEMENT`): nothing is shown that nothing would stop.
- **Variants a product** (DEC-158): no notice on a list and no meter. The
  product editor's Variants turns "Add to list" off once the product's
  list holds the plan's number, and the line beside it says the cap and
  the way to more (`lib/billing/variant-cap.ts`), in the refusal's words.
- **Locks**: a module shut only by the plan (`ENTITLEMENT_REQUIRED` alone)
  stays in the rail with a lock and its page says which plan has it
  (`PlanLocked`). A catalogue row locks a rail entry only where the API
  backs it (a registry module, or a metered row); invoicing has neither yet.
- **Refusals**: `PLAN_LIMIT_REACHED` and `MODULE_LOCKED` reach the screen as
  `res.plan` (`toFailure`, `mutate`) and show as the notice with its way up
  (`PlanRefusalHost`, `showPlanRefusal`/`reportFailure`), never the raw
  message in a toast. A `plan.limit` notification opens Plan and billing.

## Opening-day invites and the launch offer (U31)

What keeps the waitlist's promise when Saroh opens. Code:
`waitlist/invites.service.ts` (sending), `waitlist/launch-offer.service.ts`
(taking the offer), `waitlist/invite-token.ts` (the rules).

- **Before the first invite**, on the instance: `ACCOUNTS_URL` (where the
  link goes), `LAUNCH_OFFER_DAYS` (the offer's length — the owner's number,
  never committed), an SMTP transport, the migration
  `20261021150000_waitlist_invites`, and sign-up open (`launchMode=open`,
  U27). Without the first two the console says why and offers no button;
  every entry's dry run reads "refused".
- **Sending** is a bulk admin operation, `waitlist.invite`
  (`AdminOperationsService`), from Instance › Waitlist: a dry run first,
  then one row per entry under one idempotency key, followed on
  Operations › run. One invite per entry, safe to re-run: an entry is
  claimed (`invitedAt`, a fresh token's SHA-256 and its end) only while
  nobody has invited it, and marked sent (`inviteSentAt`) once the email
  has left. A send that fails is released (still waiting); one interrupted
  mid-send is sent again by a later batch after 15 minutes. Needs
  `waitlist:read` and `waitlist:invite`.
- **The link** is accounts' `/signup?invite=&email=`. The token rides to
  onboarding (`?invite=`, also through "Log in" for someone who already has
  an account) and wins over a plan intent: no checkout.
- **Taking the offer.** Onboarding asks `POST /waitlist/invite/check` for
  the line under its heading and fills the business name from the entry.
  Once the business exists it calls
  `POST /organizations/:id/launch-offer {token}` (`billing:manage`), which
  in one transaction marks the entry joined (`joinedAt`,
  `joinedOrganizationId`) and writes a `plan` override, `planKey: grow`,
  `expiresAt` = now + `LAUNCH_OFFER_DAYS`, audited as
  `organization.plan.launch_offer`. No payment details; when it ends the
  business reads its own row (Free), told 30, 7 and 1 days ahead (#805,
  U5 above).
- **Refused, politely:** an unknown link (404), a used or expired one (410,
  "ask for a new invite"), another address (403 — the account's address,
  the one its sign-up code was checked against, must match the entry's,
  compared as the waitlist compares them), a business already on a paid
  plan (409). Tokens last 30 days. A repeat for the same business answers
  the same.
- **Email** is the identity transport; with no SMTP it never leaves the
  process — `SITE_CODES_EMAIL_FAKE=log` prints it (off production),
  `fail` fails it (`email-launch-invite.spec.ts`).

## Undoing it

Revoke the overrides (`revokedAt`) rather than deleting them; the audit
stream keeps `organization.plan.grandfathered` per business. Extending one
business's date is the admin console's job (U11).
