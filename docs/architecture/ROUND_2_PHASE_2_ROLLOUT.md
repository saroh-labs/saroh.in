# Round 2, Phase 2 rollout

> **Read when:** releasing a round-2 Phase 2 checkpoint (`feat/round-2-phase-2`)
> from development to production, or rolling one back. Plan:
> `docs/plans/2026-09-28-001-round-2-phase-2-waves-plan.md` (its Release
> boundaries say why each checkpoint exists). Each unit that needs a step at
> release adds its own section here. Referenced from
> `docs/patterns/devops-tooling-and-deploy.md`.

---

## D22: Razorpay's public key id (CP-1)

Decision: DEC-054. Razorpay's checkout window opens with the business's key
id, which is public. Setup used to keep it only inside the sealed
credentials, so a connection saved without the old optional "Public key"
couldn't open the window. From this release:

- setup stores the Razorpay key id as the connection's `publicKey` (and
  checks it and the secret first);
- **the API makes no payment for a Razorpay connection without a public
  key**, and the booking page stops offering "Pay now" for it;
- Settings › Providers shows such a connection as **Needs attention**, with
  "Add key id".

So every existing Razorpay connection must have its public key **before the
new API serves**, or those businesses lose online pay. The backfill does it.
There is no migration: `MerchantPaymentProvider.publicKey` already exists.

### Before deploying the API

1. **Run the backfill against production**, from a checkout of the release
   commit. It writes only `publicKey`, a column the old API already reads
   and writes, so it is safe while the old API serves.
   `PAYMENTS_ENC_KEY` is the production API's own (it opens the sealed key
   ids); take it from the API host's environment and never paste it into an
   issue, a PR or this file.

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> PAYMENTS_ENC_KEY=... \
      pnpm --filter @saroh/database exec tsx src/backfill/razorpay-public-keys.cli.ts
    ```

    It prints:

    ```text
    [razorpay-public-keys] Razorpay connections: <n>, public keys filled: <n>, already set: <n>, unreadable: <n>
    ```

    Record the four numbers in the release issue. **"Unreadable" must be 0.**
    If it isn't, a second line names those connections by id (nothing
    else); their credentials don't open with this key (the wrong
    `PAYMENTS_ENC_KEY`, most likely) or hold no key id. Stop and find out
    which before deploying: with the right key it is 0, and a connection
    that really is broken will read "Needs attention" and take no online
    payment until its merchant enters the keys again — tell that merchant
    first.

### Deploy

2. **Deploy the API** as usual, and wait for `/health/ready`.
3. **Run the backfill again**, the same command. It catches a connection
   the old app saved between step 1 and the deploy. It prints 0 filled
   unless someone connected Razorpay in that window.
4. **Then the workspace** (`app.saroh.in`), with Providers' Needs attention
   state and the new setup dialog. The old workspace on the new API is
   safe: a key id it sends is checked and stored as the public key, and an
   optional "Public key" it sends must match it (a different one is refused
   with a message saying they are the same code for Razorpay).

### Verify

5. No connected Razorpay account is left without its key (read-only; must
   return 0, or the number step 1 named and the team has told):

    ```sql
    SELECT count(*) FROM "MerchantPaymentProvider"
    WHERE provider = 'RAZORPAY' AND status = 'CONNECTED'
      AND ("publicKey" IS NULL OR "publicKey" = '');
    ```

6. A third run of the backfill prints `public keys filled: 0`.
7. With Razorpay test keys (waves plan, Risks): connect Razorpay on a test
   business, open a booking page, choose Pay now, and the Razorpay window
   opens.

### Rollback

Deploy the previous API tag and the previous workspace. The public keys
the backfill wrote stay; the old API sends them in the checkout handoff,
which is what its checkout needed all along, so nothing breaks. Nothing
needs undoing.

### Payment methods (DEC-059)

Cashfree's drop-in opens on the order's payment session, so it needs no
public key and its setup is unchanged. Neither provider's order sets any
methods, and since D23 Razorpay's window isn't limited either: each shows the
methods the business has switched on in its own account. Saroh's copy names
no methods ("Pay online in the ‹provider› window").

---

## D17: sending an invoice (wave 2)

"Send with pay link" and "Send reminder" on Invoice Detail, through the
business's own connected email provider (`invoices/invoice-send.service.ts`,
the transactional path in `communications/communications.service.ts`).

- **Migration** `20261013160000_invoice_messages`: two nullable columns on
  `Message` (`invoiceId`, `template`), an index and a foreign key. Additive;
  the old API never reads them.
- **API before app.** The workspace shows Send only when the invoice read
  carries a `send` flag with a channel, so the new app on the old API shows
  "Copy pay link" as before, and the old app ignores the new fields.
- **The account thread stays off.** The thread channel needs A14's poster
  (not yet built) **and** the `ACCOUNT_THREAD` flag. Leave the flag without
  a row until A13 and A14 are live in production (waves plan, boundary 6);
  never configured, it is off.
- Nothing changes for a business without a connected email provider: no
  Send, and the Payment panel points at Settings › Providers.

### Verify

1. On a test business with an email provider and a payment provider, open an
   unpaid invoice: "Send with pay link" is offered; send it. The email
   arrives with a pay link that opens the pay page; "What happened" says
   "Sent to …".
2. "Send reminder" is then offered but off, and the Payment panel says when
   the next can go.
3. Without an email provider: no Send, only "Copy pay link".

### Rollback

A queued send whose job has not run yet carries its pay link sealed in the
job, and its stored body holds a slot the old API's worker doesn't fill.
Before deploying the previous API, check no such job is waiting, or it goes
out with the slot instead of the link:

```sql
SELECT count(*) FROM "Job"
WHERE type = 'message.send' AND status IN ('PENDING', 'PROCESSING')
  AND payload ? 'link';
```

Wait for 0 (the worker sends them within seconds). The two columns stay;
the old API ignores them.

## D10: classes from the next renewal (CP-2, a manual release)

Plan: `docs/plans/2026-09-26-004-feat-payments-plan.md` §D10, and the
overview's "Rollout and rollback" row "The classes allowance (D10)". Until
now a membership read its plan's classes a month live, so changing a plan's
classes changed every member's allowance at once. From this release a
subscription takes its plan's number at subscribe and at each renewal
(`CustomerSubscription.classesPerPeriod`, stamped with
`classesPerPeriodSetAt`), and a booking paid with the membership, and
Customer Detail's "Classes left", read the subscription's number. Customer
Detail also says "10 a month from 1 Nov" when the next renewal changes it.

**Why it is manual (overview rule 4).** The migration
`20261013180000_subscription_classes_per_period` adds the two columns and
fills them for every live subscription. But the previous API image keeps
creating and renewing subscriptions until it stops serving, and again after
a rollback, without setting either column. A null there means "no
allowance", which would read as unlimited. So, **for this release, a
subscription whose `classesPerPeriodSetAt` is null reads its plan's number**
(`subscriptions/classes-allowance.ts`), exactly as before, and the backfill
script is re-run after the deploy to set those rows. Follow-up Z1 removes
the fallback once the verify query below finds none, in wave 4 or later.
This release does not go through the automatic push-to-deploy.

### Deploy

1. **Back up** production (the host's rollout takes one before it
   migrates; note its name).
2. **Migrate** with the release image: `db:migrate:deploy` applies
   `20261013180000_subscription_classes_per_period`. It is additive (two
   nullable columns the old API never reads) plus a one-statement fill, so
   the old API keeps serving while it runs.
3. **Deploy the API** and wait for `/health/ready`.
4. **Run the backfill**, from a checkout of the release commit pointed at
   the production database. It sets only live (ACTIVE or PAUSED) rows whose
   `classesPerPeriodSetAt` is null, to their plan's number as it stands,
   which is what the API reads for them today, so no member's allowance
   moves. Idempotent, and safe while either image serves.

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/classes-per-period.cli.ts
    ```

    It prints:

    ```text
    [classes-per-period] <database>: live subscriptions unset: <n>, set now: <n>, still unset: <n>
    ```

    Record the three numbers in the release issue. "Set now" is usually
    small: the subscriptions the old API made or renewed between the
    migration and the deploy. **"Still unset" must be 0.** If it isn't, a
    renewal changed a row while the statement ran; the script says so and
    exits 1. Run it again.

5. **Then the workspace** (`app.saroh.in`), for the "10 a month from 1 Nov"
   line. The old workspace on the new API is safe: the field is new and
   optional, and the old one ignores it.

### Verify

6. No live subscription is left unset (read-only; must return 0):

    ```sql
    SELECT count(*) FROM "CustomerSubscription"
    WHERE status <> 'CANCELLED' AND "classesPerPeriodSetAt" IS NULL;
    ```

7. A second run of the backfill prints `set now: 0, still unset: 0`.
8. Nobody's allowance moved (read-only). Right after the deploy every live
   subscription holds its plan's number, so this returns no rows; later, only
   members of a plan whose classes changed since the deploy (its History
   says when), until their renewal.

    ```sql
    SELECT s.id, p.name FROM "CustomerSubscription" s
    JOIN "SubscriptionPlan" p ON p.id = s."planId"
    WHERE s.status <> 'CANCELLED'
      AND s."classesPerPeriod" IS DISTINCT FROM p."classesPerMonth";
    ```

9. In the workspace, on a business with class memberships (Northwind in
   development, never a demo store): change a plan's classes; a member's
   Customer Detail still shows the old number and adds "‹new› a month from
   ‹their renewal day›".

### Rollback

Deploy the previous API tag (and the previous workspace). The columns stay.
The old API never reads them and reads each plan's number live, which is
where every member stood before this release, so nothing breaks. What it
creates or renews meanwhile is left unset or stale:

- a subscription it creates has both columns null, and reads the plan's
  number again once this release is back (the fallback);
- a subscription it renews keeps the number stamped at its last renewal
  under this release, so a plan whose classes changed during the rollback
  reaches those members one renewal late.

**Before deploying this release again, run the backfill once more** (step 4)
and check step 6. After Z1, rolling back below this release means running
the backfill before re-deploying: until it runs, each member the old API
added is served their plan's number and logged as
`subscription_allowance_unset` (see Z1).

## Z1: the classes allowance has no fallback (after CP-2; a manual gate)

Plan: the waves plan's "Deferred to follow-up work", Z1; payments plan
§D10 ("A later release removes the fallback once a query shows no live
subscription with a null `classesPerPeriodSetAt`"). No migration: the
columns stay. From this release a subscription's own `classesPerPeriod` is
the only designed read (`subscriptions/classes-allowance.ts`). A row with a
null `classesPerPeriodSetAt` is no longer an expected state: the API logs
`subscription_allowance_unset` at ERROR with the subscription's id and,
rather than fail or read unlimited, serves the plan's classes as they
stand (what D10's plan documents for such a row). Any volume of that event
means an API below D10 wrote rows: run the D10 backfill.

### Before deploying (a gate: do not deploy until both pass)

1. **Run the D10 backfill once more** against production, from a checkout
   of this release (read the D10 section, step 4, for what it does; it
   writes only live rows still unset, and is safe while any image serves):

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/classes-per-period.cli.ts
    ```

    It **must print `set now: 0, still unset: 0`**:

    ```text
    [classes-per-period] <database>: live subscriptions unset: 0, set now: 0, still unset: 0
    ```

    If "set now" is not 0, something below D10 wrote rows since the last
    run (a rollback, or an old image still serving): find out what, stop it,
    and run again until it prints 0 and 0. Record the line in the release
    issue.

2. **The query finds no unset row** (read-only; must return 0):

    ```sql
    SELECT count(*) FROM "CustomerSubscription"
    WHERE status <> 'CANCELLED' AND "classesPerPeriodSetAt" IS NULL;
    ```

### Deploy

The usual API deploy; wait for `/health/ready`. No workspace change.

### Verify

3. No `subscription_allowance_unset` event in the API's logs in the first
   hour (any one means run the backfill, then find what wrote the row).
4. Step 2's query still returns 0.

### Rollback

Deploy the previous API tag. It reads the same columns the same way for
every set row, so nothing moves. Rolling back **below D10** (not this
release) is what makes unset rows: run the backfill before deploying D10
or later again, and expect the ERROR event until it has run.

## D5: the plan draft writers (wave 3; CP-3 keeps them apart from D7)

The Plan Editor's API: `POST subscription-plans/drafts` (a new plan starts
as a DRAFT), `GET`/`PATCH :planId/draft` (read and autosave),
`POST :planId/publish`, `POST :planId/discard` and `DELETE :planId` (a
draft nobody bought). Every write carries the editor's `revision`; a stale
one is a 409 naming who saved since. The rules are in
`docs/patterns/backend-billing-and-classes.md` ("Plan drafts").

- **Migration** `20261014150000_plan_drafts`: four columns on
  `SubscriptionPlan` (`pendingChanges`, `pendingChangedAt`,
  `pendingChangedById`, `draftRevision` default 0). Additive; every
  existing plan reads as live with nothing pending.
- **D21 must be in production first** (it has been since CP-1): the readers
  that refuse a DRAFT. An image older than CP-1 would sell one.
- **API before app.** Nothing in the app creates a draft until D7's Plan
  Editor, which ships in a later release than this one (CP-3).
- **Drafts are hidden from the old app.** `GET subscription-plans` with no
  filter lists live and archived plans only; a draft is listed only with
  `?include=drafts` (everything) or `?status=DRAFT`. A workspace from before
  D7 never asks, so if D7 is rolled back after drafts exist, its Plans tab
  doesn't draw a draft as a live card. D7's Plans tab asks with
  `include=drafts`.
- **The old form's `PATCH :planId` stays** until follow-up Z6 (a checkpoint
  after D7). It refuses a draft, and a change through it moves the draft
  revision, so an editor open on the plan is told instead of saving over it.

### Verify

1. `GET subscription-plans` on a business with plans answers as before, now
   with `pendingChangedAt: null` on each.
2. Once D7 is live: a new plan saves as Draft and isn't on the site or in
   Subscribe someone; Publish puts it on sale. On a live plan, a changed
   price shows "Unpublished changes" and Subscribe still charges the old
   price until Publish changes.

### Rollback

To CP-1 or later (the D21 readers): safe. Those images refuse a DRAFT
everywhere it could be sold, and ignore the new columns, so a live plan's
unpublished changes simply wait. Their unfiltered Plans list shows drafts
again, which is why D7 ships in a later release than this one. Below CP-1:
not safe once any DRAFT row exists (it would be sold); archive or delete
the drafts first:

```sql
SELECT count(*) FROM "SubscriptionPlan" WHERE status = 'DRAFT';
```

### Release #708 carries D5 and D7 together (user, 2026-09-29)

CP-3 wasn't released on its own, so D5's writers and D7's Plan Editor reach
production in one release. The API still deploys before the apps. Rolling
the API back below D5 after this release: **roll the Vercel apps back with
it**, and first archive or delete any DRAFT plan (the query above), so the
old Plans list doesn't draw one as a live card. Nothing can sell a draft
either way (D21).

## E14: pack drafts (wave 4; the Pack Editor, E18, ships in a later release)

The Pack Editor's API, the same shape as D5's for plans:
`POST class-packs/drafts`, `GET`/`PATCH :packId/draft`,
`POST :packId/publish`, `POST :packId/discard` and `DELETE :packId?revision=`
(a draft nobody bought). Every write carries the editor's `revision`; a stale
one is a 409 `{ yours, current, changedBy, changedAt }` naming who saved
since. Under the Class packs module (E12), like every pack route. The rules
are in `docs/patterns/backend-billing-and-classes.md` ("Pack drafts").

- **Migration** `20261015160000_pack_drafts`: five columns on `ClassPack`
  (`pendingChanges`, `pendingChangedAt`, `draftRevision` default 0,
  `revisedAt`, `revisedById`). Additive; every existing pack reads as live
  with nothing pending.
- **API before app.** Nothing in the app creates a draft until E18.
- **Drafts are hidden from the old app.** `GET class-packs` with no filter
  lists live and archived packs; a draft only with `?include=drafts` or
  `?status=DRAFT`. E15/E18's Packs screen asks with `include=drafts`.
- **Selling a DRAFT is a 409** "This pack isn't published yet". The image
  before E14 already refused to sell any pack that isn't ACTIVE, and a draft
  has no purchases to spend, so no reader needed to ship first.
- **The old form's `PATCH :packId`, Archive and Sell again** refuse a draft,
  and move the revision, so an editor open on the pack is told instead of
  saving over it.

### Verify

1. `GET class-packs` on Pulse answers as before, with `hasPendingChanges:
false` and `pendingChangedAt: null` on each.
2. Once E18 is live (Northwind): a new pack saves as Draft, has no Sell, and
   isn't in the sell dialog; Publish puts it on sale. On a live pack, a
   changed price shows "Changes not published" and a sale still charges the
   old price until Publish changes.

### Rollback

Safe for selling: the previous image refuses a non-ACTIVE pack, and ignores
the new columns (a live pack's unpublished changes simply wait). Its
unfiltered list shows drafts, though, as cards whose Sell answers 409. If
E18 has been used, delete the drafts first or accept that:

```sql
SELECT count(*) FROM "ClassPack" WHERE status = 'DRAFT';
```

## E20: the calendar reads a range (wave 3)

`GET organizations/:org/calendar` takes `from`/`to` (local dates, both
inclusive, at most 62 days) as well as `month` until Z3 (below)
(`calendar/range.ts`). No migration.

- **API before app.** The new workspace asks for `from`/`to`, which the old
  API refuses (400), so deploy the API first. The old workspace sends
  `month`, which the new API still answers, and ignores the new fields
  (`staffId`, `durationMinutes`, `flags`, `daysOff`, `hasStaff`, `staff`)
  and the new `payments` layer.
- **`month` is an alias for one release.** It is not held to the range:
  the old workspace reads `joinedAt` from the answer and pulls the address
  back itself. Follow-up Z3 removes it once no old workspace is live.
- **What the new API refuses:** a range wholly before the month the
  business joined (`details.reason: "before_joined"`, `earliestMonth`), or
  wholly past three months ahead (`too_far_ahead`, `latestMonth`). The new
  workspace opens that month instead. A role that reads none of orders,
  bookings, subscriptions, invoices or payments gets 403, which the
  workspace shows as its locked card.

### Verify

1. `/calendar` opens this month; `/calendar?month=<a month before the
business joined>` opens the joined month, with no error page.
2. `/calendar?month=<four months ahead>` opens the third month ahead.
3. Kavi Dental (no orders): the Payments layer lists its paid booking
   invoices.

### Rollback

Roll the workspace back first (it asks for `from`/`to`), then the API.
Nothing is stored.

### Z3: the `month` alias is removed (done, batch 2026-09-29)

E20 went to production in #708, so no workspace that sends `month` is live.
The API now answers `from`/`to` only; `?month=` is a 400 ("property month
should not exist"). Before this release, confirmed that nothing calls the
alias: the workspace reads `calendar?from=&to=` (`lib/calendar/service.ts`;
its own `/calendar?month=` is a page URL, not the API), and neither
`saroh.app`, `site-blocks` nor `e2e` reads the calendar. No migration.

- **Rolling the API back** below this release is fine: the E20 API answers
  both.
- **Rolling the workspace back below E20 now breaks the calendar** (it
  would send `month`, which this API refuses). Roll the API back with it,
  to #708 or earlier.

## E9: a treatment sold as one order (wave 2)

Decision: DEC-050. **Migration** `20261014110000_treatment_orders`: a
`BOOKING` value on `CustomerLinkReason`; `OrderItem.serviceId` and
`productId` made nullable; `Booking.orderId` and `visitNumber`; the partial
unique index `Booking_one_live_visit`; two foreign keys; and two CHECKs,
`OrderItem_bills_one_thing` and `Booking_visit_of_order`. Additive: every
existing line has a product and every existing booking neither an order
nor a visit number, so both CHECKs hold on the day.

- **Locks.** Not built `CONCURRENTLY` (no migration here is). Adding
  `OrderItem_bills_one_thing` scans `OrderItem` under an ACCESS EXCLUSIVE
  lock, the two foreign keys validate under SHARE ROW EXCLUSIVE on
  `OrderItem`, `Service`, `Booking` and `Order`, and `Booking_one_live_visit`
  builds under a SHARE lock on `Booking` (reads go on; order and booking
  writes wait). Before running it, note the row counts and run it in a
  quiet hour if `OrderItem` is past a few hundred thousand rows:

    ```sql
    SELECT (SELECT count(*) FROM "OrderItem") AS order_items,
           (SELECT count(*) FROM "Booking") AS bookings;
    ```

- **API before app.** The old workspace on the new API: a treatment line
  comes with `productId: null` and its name. Checked against the released
  workspace (`origin/main`, e365b3ba): Order Detail's line
  (`order-detail/items.tsx`) draws the name as a link through
  `productHref(storeId, l.productId)`, which encodes `null` as the text
  "null" — no crash, but the link opens a missing product page. Nothing
  else in the old workspace reads a line's product id. Treatments are sold
  only once a service has more than one visit, so deploy the workspace
  soon after the API.

### Verify

```sql
-- Both CHECKs exist and are validated (two rows, convalidated = true).
SELECT conname, convalidated FROM pg_constraint
WHERE conname IN ('OrderItem_bills_one_thing', 'Booking_visit_of_order');

-- Nothing breaks them (both 0).
SELECT count(*) FROM "OrderItem" WHERE num_nonnulls("productId", "serviceId") <> 1;
SELECT count(*) FROM "Booking"
WHERE ("orderId" IS NOT NULL AND "visitNumber" IS NULL)
   OR ("visitNumber" IS NOT NULL AND "visitNumber" < 1);
```

### Rollback

Safe only while no treatment order exists. The previous API never writes a
service line, but several of its readers assume every line has a product
(`item.product.name` in Customer detail, an order's pay page, the order
invoice and reviews), so once a treatment order exists they fail on it.
Check first:

```sql
SELECT count(*) FROM "OrderItem" WHERE "serviceId" IS NOT NULL;
```

At 0, deploy the previous API and leave the schema. Above 0, roll forward
instead. Never drop the columns while a row uses them.

## F16: storefront people join the team (wave 3)

Decision: DEC-048 (amended 2026-09-27). **Migration**
`20261014200000_storefront_team_notice`: `Organization.
storefrontTeamNoticeDismissedAt`, nullable (additive). From this API, a
storefront invite accepted puts the person on the business's team as
"Storefront team"; accepting re-checks the inviter's `member:invite` and
reach, so an invite sent before this release by someone who can't invite
to the team is refused ("ask for a new one"). Removing someone from Team
revokes the storefront invites still waiting for them.

### After the API deploys

1. **Take a snapshot and verify it restores** — the backfill writes
   memberships and Activity entries in every business.
2. **Run the backfill** from a checkout of the release commit:

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/store-members-to-memberships.cli.ts
    ```

    It prints counts only: businesses, storefront people, added as
    Storefront team, already on the team, and businesses skipped (their
    `storefront-team` role holds more than the narrow list — an owner
    widened it by hand; look at those before running again). Record them in
    the release issue. **Idempotent:** it never touches a membership that
    exists, so a second run adds nobody (`added … 0`).

### Verify

```sql
-- Storefront people with no membership in the storefront's business
-- (0, or only people in the businesses the backfill skipped).
SELECT count(*) FROM "StoreMembers" sm
JOIN "Store" s ON s.id = sm."storeId"
LEFT JOIN "Membership" m
  ON m."organizationId" = s."organizationId" AND m."userId" = sm."userId"
WHERE m."userId" IS NULL;
```

### Rollback

Deploy the previous API. The memberships the backfill made stay (they are
what Team shows, in the narrow role); remove any by hand on Team. The
column is ignored by the old image.

## G13: the site's bag and checkout (wave 3; off until switched on)

**Migration** `20261014180000_shop_checkout`: `Order.checkoutKey` (unique
per storefront, many nulls) and `StoreSettings.localDeliveryFee` /
`shippingFee`. Additive; the old image never reads them. Everything ships
behind the per-business `SITE_SHOP` flag, off: no checkout can start until
an override is set.

- A refused checkout's refund (the last unit sold meanwhile, or it had
  closed) is sent from a `payments.send-refund` job written with the
  refusal, retried with backoff; the order shows in Orders (money reached
  it), and the customer is told "on its way back" only once the provider
  has the refund. The job type is new: the API that writes it registers
  its handler, so there is no ordering step.
- A new checkout closes the account's older unpaid ones at that
  storefront ("Replaced by a newer checkout").

### Rollback

Switch the `SITE_SHOP` overrides off first, then deploy the previous API. A
`payments.send-refund` job left PENDING dead-letters on the old image (no
handler); its refund stays PENDING on the order, where Try again sends it.

## C8: a contact's address (wave 3)

**Migration** `20261014210000_contact_address`: six nullable columns on
`Contact`. Additive, nothing backfilled; the old image never reads them.
Rollback: deploy the previous API and workspace; addresses saved meanwhile
stay in the columns, unread.

## D20: a mandate ends with its subscription (wave 5; live before D13, CP-5)

**Migration** `20261016110000_payment_mandates`: the `PaymentMandate` table
(RLS `org_isolation`, one ACTIVE per subscription), as far as D20 needs it;
D11 adds its set-up and charge columns. Additive. Nothing creates a mandate
until D12, and `supportsMandates` stays false in production until D11 and
D19 pass a Razorpay test-mode run, so the table is empty at release.

- Every move of a subscription to CANCELLED (staff cancel now, a cancel at
  period end when the renewal or a resume applies it, a customer's own
  cancel when it takes effect) and a merge mark its live mandates CANCELLED
  in the same transaction and queue a `mandate.cancel` job that asks the
  provider after commit.
- **CP-5:** this is in production before D13's charging merges, so no
  mandate can be charged after its subscription ends.

### Verify

No live mandate outlives what it was for (expect 0):

```sql
SELECT count(*) FROM "PaymentMandate" m
JOIN "CustomerSubscription" s ON s.id = m."subscriptionId"
JOIN "Contact" c ON c.id = m."contactId"
WHERE m.status IN ('PENDING', 'ACTIVE', 'PAUSED')
  AND (s.status = 'CANCELLED' OR c."mergedIntoId" IS NOT NULL);
```

A cancel still being confirmed with the provider is
`status = 'CANCELLED' AND "cancelConfirmedAt" IS NULL`; a `mandate.cancel`
job FAILED beside one means the provider never answered, and it needs a
look in the provider's dashboard.

### Rollback

Deploy the previous API. A `mandate.cancel` job left PENDING dead-letters on
the old image (no handler); its mandate is already CANCELLED in Saroh and is
never charged. The table stays; the old image never reads it.

## D19: Razorpay autopay (off until a test-mode run passes)

The Razorpay adapter can set up, read, charge and cancel mandates, and
Razorpay's `token.*`, `invoice.expired`, `order.notification.*` and
recurring `payment.*` webhooks settle through the inbox.

- **No migration.** A new rollout flag, `RAZORPAY_AUTOPAY`: no business is
  offered autopay through Razorpay while it is off, and never configured
  it is off. **Leave it without a row in production** until a Razorpay
  test-mode run on a development business has authorised a UPI mandate
  and settled one charge (waves plan, boundary 6), and D12 (the set-up
  screens) is live.
- **Either order.** Nothing creates a mandate until D12, and the webhook
  mapping only moves rows a set-up made, so the old app, and the old API
  on these deliveries (it ignores `token.*`), are safe.
- **The business's Razorpay webhook** must also send `token.confirmed`,
  `token.rejected`, `token.paused`, `token.cancelled`,
  `order.notification.delivered`, `order.notification.failed`,
  `invoice.paid` and `invoice.expired` before its flag is turned on.

### Verify

With the flag on for one development business, its customer authorises a
UPI mandate from the set-up link and the mandate reads ACTIVE with a masked
handle; one charge's notice is delivered, the debit is asked after
`payment_after`, and `payment.captured` marks the invoice PAID.

### Rollback

Turn the flag's override off: no new set-ups, and from D13 no renewal is
charged either (it is invoiced with a pay link; a charge already queued is
let go before its debit). Mandates already made can still be cancelled.

## D13: renewals charge the mandate (wave 6a; after CP-5)

A renewal whose subscription has an ACTIVE mandate queues its charge in the
renewal's transaction (a CREATED `PaymentIntent` under
`inv_<invoiceId>_<attempt>` and a `subscription.charge` job); the job makes
the provider's order with its pre-debit notice, debits once the notice is
delivered and `debitAfter` has passed, and the payment's webhook pays the
invoice (CHARGED). A decline writes RENEWAL_FAILED and opens the pay link
again; an invoice above the limit writes MANDATE_LIMIT_LOW and is not
charged; Retry charges again (a new key) or makes a pay link.

- **No migration.** It writes the columns D11 added.
- **CP-5 is met** (D20 in production, #708), so no mandate is charged after
  its subscription ends.
- **Gate.** Nothing is charged unless the provider's charging is on for the
  business (`RAZORPAY_AUTOPAY` for Razorpay,
  `payments/mandate-charge-gate.ts`); off, a renewal is invoiced with a pay
  link exactly as before, and a charge already queued is let go before its
  debit.
- **API before app, either is safe.** `POST subscriptions/:id/retry` takes an
  optional `via` (absent: a pay link, as the previous app sends it) and
  answers `url: null` for an autopay retry. New read fields
  (`autopayCharge`, `retryVia`, `online.autopayCharge`,
  `autopayCharging`, send reason `AUTOPAY_PENDING`) are ignored by the
  previous app and site. The previous app on the new API shows no
  "Autopay charge in progress" line, but its pay link and Send are refused
  (409) while a charge is under way, so nobody pays twice.
- **Lead time.** By default the renewal invoice is raised on the renewal
  date as before and falls due 7 days later; the debit is asked for 26
  hours after (Razorpay's 25-hour notice plus a margin), leaving room for
  one Retry by autopay before it is overdue. D13B (below) lets the merchant
  choose otherwise.

### D13B: the merchant chooses when autopay debits (DEC-065)

"When autopay charges" on the Plans tab (and per plan on Plan Detail):
on the renewal date (invoice and notice 2 days early), the day after
renewal (the default, D13 unchanged) or on the due date.

- **Migration** `20261018200000_autopay_charge_timing`, additive: the
  business's setting (default `DAY_AFTER_RENEWAL`, so nothing changes until
  a merchant picks), the plan's nullable override, CHECK constraints, and
  `Invoice_one_live_per_period` rebuilt to leave CREDITED invoices out as
  it does VOID ones (a SHARE lock on "Invoice" while it builds; writes
  wait). The previous API never reads the columns and treats a CREDITED
  invoice as live, so it never issues beside one.
- **API before app, either is safe.** New fields (`autopay` on the
  settings read, `autopayChargeTiming` on plans, `autopayNextCharge` on the
  account and pay page) are ignored by the previous app and site;
  `PATCH …/subscriptions/settings` still takes `membersCanPause` alone.
  The previous app shows no setting, so every business stays on the
  default until the new app ships.
- **Gate.** The setting shows only where autopay can charge (a connected
  provider that takes mandates, `RAZORPAY_AUTOPAY` on). The early pass only
  touches subscriptions with an ACTIVE mandate whose provider's charging is
  on.
- **Early invoices.** Under "on the renewal date" the renewal job invoices
  two days early. A cancel, pause or plan change before the renewal date
  voids that invoice (a GST business gets a credit note) and cancels its
  charge before any debit; the customer may already have had the bank's
  notice, which the provider can't take back.
- **A changed setting never moves a queued charge**: its planned debit is
  on its intent.

#### Verify

With `RAZORPAY_AUTOPAY` on for a development business and a UPI mandate
ACTIVE: pick "Charge on the renewal date" on the Plans tab; move the test
subscription's `currentPeriodEnd` to 47 hours ahead; after the next renewal
run the invoice is ISSUED with the renewal date as its period start and
its charge's intent has `debitAfter` = the renewal date. Cancel it at
period end: the invoice reads VOID, the intent CANCELLED, and the log says
"Voided the early renewal invoice". Charges planned ahead:

```sql
SELECT i.status, i."debitAfter", inv."periodStart", inv.status AS invoice
FROM "PaymentIntent" i JOIN "Invoice" inv ON inv.id = i."invoiceId"
WHERE i."viaMandateId" IS NOT NULL AND i.purpose IS NULL
  AND i.status = 'CREATED' AND i."debitAfter" IS NOT NULL
ORDER BY i."debitAfter";
```

#### Rollback

Deploy the previous API and app; leave the columns. The old image runs a
queued charge's steps when they fall due but ignores its planned debit: it
asks for the debit 26 hours after preparing (a card at once), so no charge
is lost but one may come earlier than the merchant chose. An early invoice already issued stays
the period's invoice and is charged as D13 would; a cancel or pause on the
old image doesn't void it, so void those by hand (the SQL above, where
`periodStart` is still ahead). Dropping the columns is a later contract
step.

### Verify

With `RAZORPAY_AUTOPAY` on for a development business and a UPI mandate
ACTIVE: renew its subscription (move `currentPeriodEnd` into the past on a
test row); the invoice reads "Autopay charge in progress · ‹date›" on
Subscription Detail and Invoice Detail, "Copy pay link" and Send are gone,
and `POST …/pay-link` answers 409. After the notice is delivered and
`payment_after` passes, the debit goes and `payment.captured` marks the
invoice PAID with a CHARGED event. Charges waiting or stuck (expect only
recent rows):

```sql
SELECT i.status, i."preDebitStatus", i."debitAfter", i."updatedAt"
FROM "PaymentIntent" i
WHERE i."viaMandateId" IS NOT NULL AND i.purpose IS NULL
  AND i.status IN ('CREATED', 'REQUIRES_PAYMENT', 'PROCESSING')
ORDER BY i."updatedAt";
```

### Rollback

Deploy the previous API. Queued `subscription.charge` jobs dead-letter on
the old image (no handler); their intents stay CREATED or REQUIRES_PAYMENT
and are never debited (the old image has no charge path), but the old
image doesn't know them and would let a pay link be made alongside — so
first turn the flag's override off and let queued charges be let go, or
mark open charge intents CANCELLED. A debit already asked for (PROCESSING)
is still settled by its payment webhook on the old image.

## D14: autopay in the workspace (wave 8)

Subscription Detail's Plan card says how autopay stands and how it was set
up, "Autopay limit too low", a cancel still being confirmed and a charge
under way, and — with `subscription:write` — offers "Send a set-up link"
and "Cancel autopay". The Subscriptions list marks a row "UPI Autopay ·
…". The plan and subscribe dialogs promise autopay only where the
business offers it (`GET subscriptions/autopay`); otherwise "It renews
with an invoice each period".

- **No migration.** `setupSource` gains `SETUP_LINK` and the log gains
  `MANDATE_LINK_SENT` (both strings); `AUTOPAY_SET_UP_LINK` is a new
  Message template.
- **Behind `RAZORPAY_AUTOPAY`.** Off, nothing offers or promises autopay:
  no "Send a set-up link", and `POST …/autopay/link` answers 403. A
  mandate already made still shows on its subscription and can still be
  cancelled (the flag's own rule).
- **API before app, either is safe.** New read fields (`autopayCard`,
  `autopayOn`) are ignored by the previous app, which keeps D12's line.
  The new app on the previous API sees no card: today's line, no actions,
  and the copy says "renews with an invoice" (the offer read 404s, so it
  reads as not offered).
- **Not done here:** the customer isn't sent a notice when staff cancel
  their autopay — no notice template fits (A14's are about bookings and
  orders), and their next renewal arrives as an invoice with its pay link.
  Home's "Autopay limit too low" row still offers Retry by pay link; the
  set-up link is sent from Subscription Detail.

### Verify

With the flag on for a development business: on a subscription without
autopay, "Send a set-up link" → pick UPI → the link opens Razorpay's
registration page for UPI (₹1 check, refunded); approving it turns the
card to "Autopay on · UPI · …, set up by ‹name› from a set-up link ‹you›
sent". "Cancel autopay" → "Autopay cancelled"; the next renewal is
invoiced with a pay link and no `subscription.charge` job is queued. With
the flag off, neither button shows and the dialogs say "renews with an
invoice each period".

### Rollback

Deploy the previous API and app. PENDING mandates made by a set-up link
stay and lapse after a week; one approved in the meantime is an ordinary
ACTIVE mandate (D12's rules).

## Date-range indexes (review follow-up)

**Migration** `20261015100000_calendar_range_indexes`: `Order
(organizationId, createdAt)`, `Invoice (organizationId, status, paidAt)`,
`(organizationId, paidAt)` and `(organizationId, issuedAt)`, and
`StaffTimeOff (organizationId, startAt)`, for the calendar's and Home's
date-range reads. Additive; each build holds a SHARE lock on its table
(writes wait while it builds). Rollback: nothing to do — the old image
reads the same; drop an index only if it is found to cost writes.

## F4: Home's inline actions (wave 7a)

Mark sent, Retry by pay link, Send reminder and Reply on Needs you's rows
(`home/home-inline.ts`), each calling its target's existing endpoint.

- **No migration.** Additive only: `GET /home`'s `inline` gains `yes`,
  `done`, `sends`, `target`, `person`, `stage` and `via`, and
  `POST subscriptions/:id/retry` also answers with the link's `url`.
- **Either order.** The app draws a button only for a row whose `inline`
  the API sent, so the new app on the old API shows links as before, and
  the old app ignores the new fields.
- **Reply stays dark** while `SITE_ACCOUNT_AREA` is off (as A13's thread
  routes are). Send reminder's thread wording appears only once D17's
  thread channel is on. Retry by mandate is D13's; until then Retry is a
  pay link only.

### Verify

On Northwind, as the owner: an order ready to hand over offers Mark sent;
the confirm says who is told; Undo within ten seconds puts it back to
Ready. An overdue invoice, with an email provider connected, offers Send
reminder; Undo within ten seconds sends nothing. A Member sees no buttons.

### Rollback

Deploy the previous API or app; nothing is stored.

## Z5: Home's old fields are removed (done, batch 2026-09-29)

F3, F5, F6 and F7 served `GET /home`'s old fields beside the new ones for
one release (default 130). B2d and those units are in production (#708), so
Z5 removes the two no live app reads: **`primaryAction`** and **`numbers`**
(with the reads behind them only: the CRM lead and contact counts, and the
upcoming bookings count). No migration.

- **Confirmed unused** before removing: neither is read by `app.saroh.in`
  (in this branch or in #708's), `saroh.app`, `site-blocks` or `e2e` (only
  the permissions API mock sent them; it no longer does).
- **Kept on purpose:** `actions` (the workspace rail's badges read its
  OVERDUE rows, `components/shared/app-shell.tsx`), `upcoming` (Needs you's
  "Next" line) and `hasAnyModule` (the first-run screen). They are not
  legacy while the app reads them.

### Rollback

Rolling the API back below this release is fine (it sends the two fields
again, which the app ignores). **Rolling the workspace back below F5/F6
(to an app from before #708) now breaks Home**: that app draws the numbers
band from `home.numbers`, which this API no longer sends. Roll the API back
with it.

## F10b: a private limited company is stored as `pvt` (follow-up to F10)

F10 (#708) shipped the readers: every API and app since reads `company` and
`pvt` alike as Private limited, and still stored and sent `company`
(boundary 9). F10b:

- **The API stores `pvt`** for either spelling (`business-type.ts`), and
  answers a row still stored as `company` as `pvt`. It still **accepts**
  `company`, so an F10 app keeps saving; follow-up Z4 drops that a release
  later.
- **The app sends `pvt`.** It still reads `company` as Private limited
  until Z4, in case the API is rolled back to F10 before the backfill runs.
- **No migration.** A backfill CLI rewrites the stored rows
  (`packages/database/src/backfill/business-type-pvt.ts`): only
  `BusinessProfile.type = 'company'`, to `pvt`. Idempotent; prints counts
  only.

### Deploy

1. **The API first.** F10's app sends `company`, which this API takes.
2. **Then run the backfill** once the old image has stopped serving (it
   stores `company` until then):

    ```bash
    DATABASE_URL=<production url> DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/business-type-pvt.cli.ts
    ```

    It prints
    `[business-type-pvt] <database>: stored as company: <n>, rewritten to pvt: <n>, still company: <n>`.
    "Still company" must be 0; if not, run it again.

3. **Then the workspace** (`app.saroh.in`), which sends `pvt`.

### Verify

```sql
SELECT count(*) FROM "BusinessProfile" WHERE type = 'company';  -- 0
SELECT count(*) FROM "BusinessProfile" WHERE type = 'pvt';
```

A business that was `company` shows Private limited company in Settings, and
saving another type records `type: pvt → <new>` in Activity.

### Rollback

Rolling the API back to F10 is safe: F10 reads `pvt` rows and stores
`company` again, so re-run the backfill after re-deploying F10b. Rolling the
app back to F10 is safe (it sends `company`, which this API maps to `pvt`).
Below F10, the API refuses `pvt` and would not name those rows: don't, once
the backfill has run. Z4 must wait until the query above reads 0 in
production.

## P1: a payment confirmed without its webhook (#710)

A booking paid in Razorpay's test mode stayed "Awaiting payment" because
its webhook never came (no secret configured), and the 15-minute hold ran
out with the money taken. From this release the webhook is the backup,
not the only way money is seen (`webhooks/payment-lookup.service.ts`):

- **The checkout's signed return.** Every merchant-site window (booking
  page, shop bag, plan join, pack purchase, the autopay window) posts what
  the provider handed back to `POST /public/payments/return`. The API
  checks Razorpay's `razorpay_signature` with the business's own key
  secret (a bad one is a 400 and writes nothing), then **reads the payment
  from Razorpay** — its order, `captured` status and amount must match the
  intent — and settles it through the webhook's own reconciliation. A
  Cashfree return is only the cue to ask Cashfree. Rate-limited per caller
  and per provider order.
- **The pending sweep** (`payments.confirm-pending`, every minute): open
  intents are asked about from 3 minutes old, every 3 minutes while young,
  then every 30 minutes, then every 6 hours, for 3 days. The hold release
  asks about a hold's payment before letting it go; a provider that can't
  answer keeps the hold up to an hour past its time.
- **`payments reconcile`** for one business (below).

Whichever of these and the webhook comes first settles the payment; the
rest change nothing. A capture on a hold already released goes the
existing way: confirmed when its place is still free, otherwise recorded
as owed back (Home raises it until a refund is recorded).

**Migration** `20261018230000_payment_intent_last_lookup`: nullable
`PaymentIntent.lastLookupAt`, an index on `PaymentIntent (status,
createdAt)`, and the partial unique index that keeps one waiting run of the
sweep. Additive; the old API never reads or writes them.

### Order

**API first, then saroh.app.** The new pages post the return; on the old
API that route is a 404, and the page waits for the webhook as before. The
old pages never post it, and the new API's sweep still settles their
payments.

### Reconcile a stuck payment (the 2026-09-29 test booking)

After the API is deployed, inside the API's own container (it needs the
same database and the key that opens provider credentials):

    node apps/api.saroh.in/dist/cli/payments-reconcile.cli.js <organization id or slug>

It asks the provider about every open payment intent of that business and
settles what the provider has. It prints counts only:

    [payments-reconcile] open intents asked: <n>, settled: <n>, already settled: <n>, not paid: <n>, amount mismatch: <n>, no connection: <n>, provider errors: <n>

Safe to run more than once and beside live webhooks; a second run asks
only about what is still open. Exit 1 means a provider couldn't answer for
some intent — run it again later. For the Northwind 15:00 booking: its hold
was released, so the capture is recorded as owed back unless the slot was
still free — then the booking is confirmed. Check Bookings and Home after.

### Verify

In Razorpay test mode on Northwind, with the webhook secret left unset:
book a pay-now slot and pay. The booking page reads "You're booked" within
a few seconds of the window closing, and the booking shows Paid online. Then
set the webhook up and pay another: still one payment recorded (Order or
invoice timeline shows one capture).

### Rollback

Deploy the previous API and app. Nothing to undo: the column and indexes
stay, unread. A payment the new API settled stays settled.

## Before switching a flag on (advisory)

These browser suites are skipped in CI while their features are off. Run
them against a stack prepared as each file's header says, and record the
result in the release issue, **before** turning the feature on anywhere:

- `e2e/tests/site-shop.spec.ts` — before any `SITE_SHOP` override:
  `E2E_SITE_SHOP=1`, Northwind's override on, a Razorpay test connection.
- `e2e/tests/site-account.spec.ts` — before `SITE_ACCOUNT_AREA=on` (API
  first, then saroh.app): the stack started with `SITE_ACCOUNT_AREA=on` in
  both.
