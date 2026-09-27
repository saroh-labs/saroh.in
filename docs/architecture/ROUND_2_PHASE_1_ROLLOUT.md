# Round 2, Phase 1 rollout

> **Read when:** releasing round 2's Phase 1 (`feat/round-2-phase-1`) from
> development to production, or rolling it back. Decisions: ADR-011
> (customer accounts on merchant sites), DEC-040 (Needs attention), DEC-041
> (a contact for every paying customer), DEC-045 (order fulfilment types).
> Plans: `docs/plans/2026-09-26-000-round-2-overview.md` and the plans it
> names. Referenced from `docs/patterns/devops-tooling-and-deploy.md`.

This release moves every merchant site's booking page to sign-in (A9): a
customer books after signing in with an email code. The booking page can't
work until the API and saroh.app share a secret and the API can send the
code. It also carries the order fulfilment types' first release (B2a, see
`ORDER_FULFILMENT_ROLLOUT.md`, release 1), and two backfills that run
**after** the new API serves (C1 and C2).

Every migration in it is additive, so the old API keeps serving while they
run and rolling back is deploying the previous tags. The one exception to a
clean rollback is under [Rollback](#rollback).

---

## Before deploy

Do all of these before merging anything. Any "no" is a stop.

1. **PostgreSQL is 14 or later** on production. Read it (read-only):

    ```sql
    SHOW server_version;
    ```

    The migrations use nothing newer than 14. The booking's account key
    (`20261011140000_booking_customer_account`) was written for 14 (review
    M-4); keep it that way in any later edit.

2. **Environment variables**, by name. Set each in the API host's
   environment for production, and in Vercel where it says so. Never paste
   a value into an issue, a PR or this file. `docs/architecture/ENVIRONMENT.md`
   says what each one does.

    - **`SITE_RELAY_SECRET`**, in the API **and** in saroh.app in Vercel,
      for **Production and Preview**. 32 characters or more, byte-identical
      in all of them. saroh.app signs every sign-in call with it; a
      mismatch or a missing value fails every sign-in, so no one can book.
    - **`SITE_ACCOUNTS_CODE_SECRET`**, API. 32 characters or more. It keys
      the stored hashes of a code and its email. Without it the site
      sign-in routes answer 500.
    - **`TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`**, API. Both set.
      Without them no bot challenge is ever asked and the API logs
      `site_codes_challenge_unconfigured` at ERROR.
    - **`SITE_CODES_SMTP_HOST`, `SITE_CODES_SMTP_PORT`,
      `SITE_CODES_SMTP_USER`, `SITE_CODES_SMTP_PASS`** (and
      `SITE_CODES_EMAIL_FROM` if not the default), API: the codes' own
      sending stream. If they aren't set, the codes go over the identity
      `SMTP_*` credentials, which must then be set. A code that doesn't
      leave is a booking that can't be made.
      **The port:** use 465 (TLS from the start). Port 587 (STARTTLS) needs
      the review M-3 fix, which takes the codes transport's TLS mode from
      its own settings rather than `SMTP_SECURE`; without it, 587 fails
      every send.
    - **`SITE_CODES_EMAIL_FAKE` is not set** in production. It is for
      development and the CI browser stack only.

3. **CI is green** on the commit you release: lint, typecheck, test and
   build; Migration replay from empty; Browser E2E; Permission states; Secret
   scan.
4. **Merchants were told.** A release note and a notice to every merchant at
   least a week before: every site's booking page moves to sign-in on the
   same day (plan overview, row "Sign-in on every merchant site").
5. **The code-send alert is live** (A2): a failed code email logs
   `site_code_send_failed`, and someone is watching for it.

---

## Deploy order

A merge to `main` builds the API image and runs the host's rollout, and
Vercel ships every frontend from `main`, at the same time. saroh.app ahead of
the API is the breaking direction: the new booking page calls sign-in routes
the old API doesn't have. So the production API goes first, by hand, and the
merge comes last, as for Products and Stock (`PRODUCTS_STOCK_ROLLOUT.md`,
"Releasing to production: the order").

1. **Build the image.** Merge the release into `development` and let CI
   build it. The push to `development` builds `sha-<commit>` and deploys it
   to the development environment. Check it there first (Verify, below).
2. **Back up** production. The host's rollout takes a backup before it
   migrates; confirm it exists and note its name.
3. **Migrate** with that image: `db:migrate:deploy` applies the release's
   16 migrations (`20261008100000_rls_remaining_tables` to
   `20261011140000_booking_customer_account`). All are additive; the old API
   keeps serving while they run.
4. **Deploy the API** image `sha-<commit>` through the host's rollout and
   wait for `/health/ready` to answer 200. The API now runs the new code with
   the old frontends, which is the safe direction: the old booking page
   still books through the anonymous route, which this release keeps
   serving.
5. **Then saroh.app.** Merge `development` into `main`. The push rebuilds
   the same code and reruns the rollout (the migrations are already applied,
   so it is harmless), and Vercel ships saroh.app with the other frontends.
   If Vercel lets you promote one project at a time, promote saroh.app first
   and check a booking page before the others.
6. **Then the other frontends** (the workspace, accounts, admin and the
   rest), from the same merge.

---

## After deploy: the backfills

Run both once the new API serves, C1 first, from a checkout of the release
commit pointed at the production database. Both are idempotent and safe
while the API serves traffic. They run after the deploy, not between
migrate and deploy, so they also catch what the old API wrote during the
deploy.

1. **C1: note allergens become Needs attention Allergy entries.**

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/contact-attention.cli.ts
    ```

    It prints
    `[contact-attention] businesses: <n>, Allergy entries made: <n>`.
    Record both numbers in the release issue.

2. **C2: a contact for every paying store customer.**

    ```bash
    DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> \
      pnpm --filter @saroh/database exec tsx src/backfill/paying-customer-contacts.cli.ts
    ```

    It prints one line:

    ```text
    [paying-customer-contacts] businesses: <n>, paying customers without a contact: <n>, contacts made and linked: <n>, left to suggest (a contact already has the email): <n>, no usable email: <n>
    ```

    Record all five in the release issue. "Contacts made", "left to
    suggest" and "no usable email" add up to "without a contact".

A backfill that prints "backfill failed" exits with code 1. What it had
finished stays (C1 commits one business at a time, C2 one store customer at
a time); fix the cause and run it again, and it picks up the rest.

---

## Verify

1. `/health/ready` answers 200.
2. **The migrations applied** (read-only; must return no rows):

    ```sql
    SELECT migration_name FROM "_prisma_migrations"
    WHERE migration_name >= '20261008100000'
      AND (finished_at IS NULL OR rolled_back_at IS NOT NULL);
    ```

3. **The backfills are done.** Run each again. C1 prints 0 Allergy
   entries made. C2 prints 0 contacts made and linked, and its "without a
   contact" is no more than the first run's "left to suggest" plus "no
   usable email".
4. **Order fulfilment release 1:** run the three read-only queries in
   `ORDER_FULFILMENT_ROLLOUT.md`, release 1, step 5. Each returns no rows.
5. **A booking, end to end,** on a merchant site with Appointments on (not a
   demo store the team records on): open a service's booking page, ask for
   a code, get the email, sign in, book. The booking shows in the
   workspace's diary. Then cancel it from the workspace.
6. **The logs are quiet** for the first hour: no 500 from
   `public/site-accounts/*`, no `site_codes_challenge_unconfigured`, no
   `site_code_send_failed`, and no "SITE_RELAY_SECRET is not set" from
   saroh.app.

---

## Rollback

Roll back **saroh.app together with the API**, saroh.app first:

1. Redeploy saroh.app's previous production deployment in Vercel. The old
   booking page books through the anonymous route, which the new API still
   serves.
2. Deploy the previous API tag through the host's rollout.
3. Redeploy the other frontends' previous deployments if they had gone out.

Never leave the new saroh.app on the old API: every booking page breaks.

The migrations stay applied. The old API never selects the new columns and
tables, so it reads and writes as before. Accounts, sessions and bookings
made signed in stay in the database, unused, until the release goes out
again.

**Links with no team member on them (review M-6).** The C2 backfill, a paid
order (`PAYMENT`) and a site sign-in (`SITE_ACCOUNT`) make
`CustomerIdentityLink` rows with no `linkedByUserId`. The old API's Prisma
client says that column is never empty, so its "link this contact and store
customer" action answers 500 when the pair is already linked by one of these
(its upsert returns the row and can't read it). Nothing else in the old API
reads that column. Either:

- accept it for a short rollback: tell support that linking an
  already-linked pair fails until the release is back; or
- for a longer one, fill the column with each business's owner, and undo
  that before the release goes out again. `reason` tells the two apart:
  every `MANUAL` link has a team member and no other link does.

    ```sql
    -- On rollback (a write: take a backup first).
    UPDATE "CustomerIdentityLink" l
    SET "linkedByUserId" = (
        SELECT m."userId" FROM "Membership" m
        WHERE m."organizationId" = l."organizationId" AND m."role" = 'OWNER'
        ORDER BY m."id" LIMIT 1)
    WHERE l."linkedByUserId" IS NULL;

    -- Before the release goes out again.
    UPDATE "CustomerIdentityLink"
    SET "linkedByUserId" = NULL
    WHERE reason <> 'MANUAL';
    ```

A business with no owner keeps its empty rows; the first query leaves them
as they are.

---

## Later releases

- **Order fulfilment, release 2 (B2c)** is a separate release, after this one
  has been live (API and frontends) in production. Its checklist is
  `ORDER_FULFILMENT_ROLLOUT.md`, release 2.
- **The anonymous booking route closes in the next release.** This release
  keeps `POST public/services/:serviceId/book` serving so a page loaded
  before the deploy still books. The next release makes it answer 410 "Sign
  in to book" (customer accounts plan, A9); from then on, rolling back
  saroh.app past this release breaks booking.
