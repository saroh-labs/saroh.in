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

### Cashfree (noted, not changed)

Cashfree's drop-in opens on the order's payment session, so it needs no
public key and its setup is unchanged. It shows whatever methods the
business's Cashfree account has on, because the order Saroh creates sets
none (`providers/cashfree.provider.ts`), while Razorpay's window is limited
to UPI and card (`packages/site-blocks/src/booking-flow/checkout.ts`). The
booking page promises "UPI or card". Limiting Cashfree the same way would
mean setting `order_meta.payment_methods` (for example `"upi,cc,dc"`) on the
order; it is left for a decision.

---

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

**Before deploying this release again, run the backfill once more** (step 4) and check step 6. After Z1 has removed the fallback, rolling back below
this release means running the backfill before re-deploying, or members
the old API added would read as unlimited.
