# Launch readiness rollout (development → main, after #708)

> **Read when:** releasing everything on `development` that isn't on `main`
> after release #708 (merged 2026-09-29): round-2 follow-ups plus the
> launch-readiness plans DEC-069 (one address, Locations), DEC-070 (a
> business, just me, or my work) and DEC-071 (site test releases). About
> 510 commits, batch PRs #716–#718 and #765–#770.
> Plans: `docs/plans/2026-09-29-002-feat-one-address-locations-plan.md`,
> `2026-09-29-003-feat-who-saroh-is-for-plan.md`,
> `2026-09-29-004-feat-test-releases-plan.md`. Decisions: DEC-062–DEC-074
> (`DECISIONS.md`). Unit-level steps for the round-2 part stay in
> `ROUND_2_PHASE_2_ROLLOUT.md`; this file orders them for this release.
> Referenced from `docs/patterns/devops-tooling-and-deploy.md`.

The short version: **twelve migrations, all expand-only**, one of them a
data update (DEC-074) and three that replace or rebuild a constraint or
index. **Two backfills** (order numbers, `pvt`), **two pre-deploy gates**
(Z1, Z2a), and **read-only audits** for the address work. **Four new
flags, all off in production.** The API goes first, by hand; the release
PR's merge ships the frontends last.

Production writes (deploys, migrations, backfills, flag changes) need the
user's explicit approval at the time. Read-only queries don't.

---

## 1. What ships

In merchant words, by area. Batch PRs: #716 (autopay, payments, invoice
PDF, Plan Editor), #717 (order numbers, notes, round-2 audit fixes,
DEC-067), #718 (browser tests), #765 (launch polish, Turn on, round 2
verified, DEC-072–074), #766–#770 (DEC-069/070/071, waves 1–final). Issue
numbers are the units'. #709 and #715 (CodeQL fixes) already went out with
#708.

### Getting started: who Saroh is for (DEC-070, #766–#770)

- **"What are you setting up?"** A business, Just me, or A site for my
  work. The answer sets Saroh's words ("your business" or "you",
  "customers", "clients" or "readers") and the defaults. It never limits a
  feature (K1, K2 #738).
- **Home's first run and the module picker follow the kind.** Just me can
  invoice a client from day one (K3 #739).
- **The registered address, business type and logo are asked for only once
  something invoices or takes money**, not from everyone (K4 #740).
- **Change what you're setting up** in Settings › Business › Identity, with
  Undo (K5 #741).
- **Bookings' Turn on sheet** fills in defaults for the kind (K8 #744). The
  sheet now actually shows the defaults the API suggests (K15).
- **New site templates:** Portfolio (K12 #748), Writing (K13 #749) and
  Personal (K14 #750), plus a **Projects block** (image, title, summary,
  link) (K11 #747). A new site starts from the template that fits the kind,
  and its enquiry form works from the first publish (K15 #751).
- **The starter template stops assuming a business**, and new sites no
  longer open with broken images (K10 #746).
- **Invoices work without the Payments module.** Issue, send and mark paid
  work on their own. An online pay link still needs a connected provider
  (K6, K7 #743).
- The docs say who Saroh is for (K9 #745).

### Turning a module on (DEC-068, #765)

- **One Turn on sheet everywhere** (Settings, Home's first run, onboarding,
  "Also sell"). It asks only the minimum that makes the module work, with
  sensible defaults to edit (M1, M2).
- **Business details before money:** the registered address and GST are
  asked before the first invoice or online payment (M3).
- **A module Saroh hasn't rolled out stays hidden everywhere.** The API
  refuses to turn it on, in plain words. Going live asks for the business
  type (P1, DEC-057).

### One web address, and Locations (DEC-069, #766–#770)

- **Storefronts become Locations** across the workspace and the API's
  messages. Each location says whether it sells in person only, or online
  too (L9 #730, L10 #731, L11 #732).
- **Your online shop sells from ‹location›.** The four addresses are named
  apart: web address, registered address, location address, and the blog's
  posts path (L12 #733, and a follow-up fix).
- **Selling online readies the shop:** turning on selling online makes the
  starter site on the business's web address (L13 #734).
- **A site is never made without a web address.** A site that has none is
  held back from publishing until the owner picks one (L5 #726).
- **Web address in Settings › Business,** with **Change** for the owner.
  The old address forwards to the same page on the new one for 90 days, and
  stays held for the business (L2 #723, L3 #724, L4 #725). Behind
  `WEB_ADDRESS_CHANGE`, off.
- **Pay pages open on the business's own address** (L6 #727), and **pay
  links use it** (L7 #728, behind `PAY_LINK_ON_SITE`, off). Old pay links
  keep working.
- **Share buttons share the link that fits:** the shop, the booking page or
  the site (L8 #729).
- **A location has no web address of its own.** The dead field is gone
  from the screens (L14 #735). The column is dropped later (L15, section 6).
- An address containing `--` can never be claimed, and held addresses count
  as taken (L1).

### Website test releases (DEC-071, #766–#770), all behind `SITE_TEST_RELEASES`, off

- **Make a test release:** a frozen, named copy of the site on its own test
  address, shared by link. It shows the whole site, including the shop,
  booking and account pages, under a "Test release" bar. It is never
  indexed, and **it never takes a real order, booking, form or payment**
  (T1 #752, T2 #753, T3 #754, T4 #755, T5 #756, T6 #757).
- **Go live** with exactly what was tested, now or at a set time, with
  Cancel and an alert when it happens (T7 #758, T10 #761).
- **Review a test release:** ask for a review, record a verdict and notes.
  Version history names the release (T8 #759, T12 #763).
- **"Publishing needs approval"** (a site setting, off by default): only an
  approved test release can go live. An owner can override it, and the
  override is recorded (T9 #760, T13 #764).
- In the site editor: make, share, schedule and go live, and Publish reads
  "Needs approval" when it does (T11 #762).

### Payments and autopay (#716, #717)

- **Autopay (UPI Autopay, card, eMandate) through Razorpay.** Customers set
  it up from a pay link, the Prices page or their account, with a ₹1 check
  that is refunded automatically. Renewals are charged, with a pay link if
  a charge fails. The merchant chooses when autopay debits, sends set-up
  links, and cancels autopay (D11, D19, D12, D12B, D13, D13B, D14). **All
  behind `RAZORPAY_AUTOPAY`, off.**
- **Join a plan online from the site's Prices page:** pay first, then the
  membership starts (G20, DEC-062).
- **A payment is confirmed even when its webhook never arrives**, from the
  checkout's signed return and a background check. There is also a
  `payments reconcile` tool for one business (P1 #710).
- **Connecting Razorpay needs its webhook signing secret,** with guided
  setup. Existing connections without one read "Needs attention"
  (WHSECRET, DEC-063; see `ROUND_2_PHASE_2_ROLLOUT.md` › WHSECRET).
- **Take payment at the desk from a booking** (P2 #711). Paying at the
  counter voids the pay link (B11). Staff can't mark a treatment paid while
  an online payment is in flight (#622).

### Invoices (#716, #765)

- **Download an issued invoice as a PDF**, with the business's logo (D16,
  D16B).
- **GST shows only when it applies:** no "Nil-rated" on a line with no
  rate, and no GST totals when no line is rated (DEC-072).
- Invoice pay links follow the business's payment provider rule.

### Orders (#717, #765)

- **Order numbers are one series per business**, across all its locations
  (P3 #712, DEC-066).
- **A location's team sees and moves that location's orders**, with no
  money, refunds or cancelling (DEC-074).
- On the phone: Filters and quick-view sheets. Bulk Print tickets, "Next
  ‹date›", the allergy tag, "Refund on its way", and a failed refund raised
  on Home (DEC-067). A balance link for a paid site order that now costs
  more (B9).
- Shop setup hints, a Shop link, the order confirmation, and "Made by"
  (P4/P5 #713).

### Customers (#717)

- **Customer notes are text only.** Allergies live in Needs attention
  (Z2a).
- A customer with orders or invoices can't be deleted outright (DEC-042).
  Classes left shows even with Class packs off (C7). Signed-in customers
  can use the Contact page form (A13).

### Bookings, classes and plans (#716, #717)

- **The Plan Editor** (D7 #599): plans save as drafts and publish.
- A **Class packs block** for the site (P4). One-to-one packs count
  "sessions" (A11). The calendar for kitchen staff (E20). "Due from today"
  plus Overdue (E23).

### The website and editor (#716, #765)

- **Module pages (Book, Prices, Shop) in the editor** (G16 #679), with the
  design's page title and lead line (DEC-073).
- The account area's compact header, whole-rupee prices ("₹500"), and
  product cards that sum up their options ("2 sizes") (DEC-073).
- **Fixed:** the product grid and Plans pages failing to load; site pages
  losing their query string (`?service=`, Track, `?move=`); the booking
  page header never showing the address, hours or phone.

### Polish and accessibility (#765)

- Long values wrap and actions stay on screen on a phone (P2). Interaction
  states in every primitive, with an automated accessibility check (P3).
- Round 2 checked against its designs in six areas, with the fixes made
  (VERIFY-*, DEC-073).

### Behind the scenes

- Clean-ups: the classes-allowance fallback removed (Z1), a private limited
  company stored as `pvt` (F10b), the calendar's `month` alias (Z3), and
  Home's old fields (Z5).
- Faster, parallel and deterministic browser tests, a faster CI, and a
  local pre-push gate that runs what CI runs (#717, #718, #765).

---

## 2. Migrations

Twelve, in order. Each file runs as one transaction, so every lock below is
held until that migration commits. **None was timed on production data**:
count the tables named below first (section 5, step 1), and restore a copy
to time them if any is large.

| # | Migration | What it does | Safe for the previous API? | Locks / rewrites |
|---|---|---|---|---|
| 1 | `20261018100000_plan_join_online` | `Invoice.planTerms` (nullable JSONB), partial index for open plan joins | Yes, never read | ACCESS EXCLUSIVE on `Invoice` (brief, ADD COLUMN), then SHARE while the partial index builds (writes wait). No rewrite. |
| 2 | `20261018110000_payment_mandate_setup` | Nullable set-up and charge columns on `PaymentIntent` and `PaymentMandate`, `currency` NOT NULL DEFAULT `'INR'`, three indexes, one FK | Yes | Constant default, so no rewrite. **New UNIQUE index on `PaymentMandate (organizationId, provider, providerMandateId)` fails if duplicates exist** (pre-check below; the table should be empty). Index builds take SHARE on `PaymentIntent` and `PaymentMandate`. |
| 3 | `20261018160000_payment_mandate_setup_source` | Two nullable columns on `PaymentMandate` | Yes | Brief. |
| 4 | `20261018170000_payment_intent_authorisation_check` | Two nullable columns, a unique index, an FK, and **`PaymentIntent_one_target` dropped and re-added, looser** (allows an `AUTHORISATION` intent with no order or invoice) | Yes, every row the old API writes still passes | **Not purely additive: a CHECK is replaced.** Re-adding it validates every `PaymentIntent` row under ACCESS EXCLUSIVE (reads and writes wait). Existing rows passed the stricter check, so it can't fail. |
| 5 | `20261018200000_autopay_charge_timing` | `BusinessProfile.autopayChargeTiming` NOT NULL DEFAULT, nullable `SubscriptionPlan.autopayChargeTiming`, two CHECKs; **`Invoice_one_live_per_period` dropped and rebuilt** to leave CREDITED invoices out too | Yes. The rebuilt index only allows more rows; the old API treats CREDITED as live | **Not purely additive: a unique index is rebuilt.** `DROP INDEX` takes **ACCESS EXCLUSIVE on `Invoice`** (reads wait too) until the migration commits, which includes the rebuild. `ROUND_2_PHASE_2_ROLLOUT.md` › D13B says only SHARE; that understates it. The CHECKs scan `BusinessProfile` and `SubscriptionPlan` (small). |
| 6 | `20261018230000_payment_intent_last_lookup` | `PaymentIntent.lastLookupAt`, an index, and a partial UNIQUE index on `Job` (one pending `payments.confirm-pending`) | Yes, it never enqueues the sweep | SHARE on `PaymentIntent` and `Job` while the indexes build (writes wait; the job queue pauses). The `Job` index would fail on two pending sweep jobs, but none can exist before this API. |
| 7 | `20261019100000_order_number_sequence` | New `OrderNumberSequence` table (RLS), nullable `Order.renumberedFrom` | Yes. It still numbers per location | Brief. The unique (business, number) index is later work (Z7). |
| 8 | `20261019120000_storefront_team_orders` | **Data update:** every `storefront-team` role gains `order:stage` | **Only briefly.** Until the new image serves, the old API would show that role every location's orders in the kitchen view (no money). **Roll the API out straight after migrating.** | Row locks on `OrganizationRole` (small). Idempotent. |
| 9 | `20261020100000_address_reservation` | New `AddressReservation` table (RLS), FKs to `Organization` and `Site` | Yes | FKs take SHARE ROW EXCLUSIVE on `Organization` and `Site` briefly (the new table is empty). |
| 10 | `20261020110000_store_slug_optional` | `Store.slug` DROP NOT NULL | Yes while it serves. **Rollback hazard:** see below | Metadata only, brief ACCESS EXCLUSIVE on `Store`, no scan. |
| 11 | `20261020120000_organization_kind` | `Organization.kind` NOT NULL DEFAULT `'BUSINESS'`, a CHECK | Yes. Every existing business becomes BUSINESS; no backfill | Constant default, so no rewrite. **The CHECK scans `Organization` under ACCESS EXCLUSIVE**, and almost every request reads `Organization`. Small table, brief. |
| 12 | `20261020130000_site_test_releases` | Two new tables (RLS); `Site.publishNeedsApproval`, `Publication.kind` NOT NULL DEFAULT `'LIVE'`, `Publication.sourcePublicationId`, `testReleaseId` on `SiteComment` and `SiteApproval`; CHECKs, indexes, FKs; a `DO` block that **only reports** addresses with `--` or longer than 57 characters | Yes. It never writes a TEST row, and none exists until the new API makes one | **ACCESS EXCLUSIVE on `Site` and `Publication`** from their ALTERs until commit: the `Publication.kind` CHECK scans every publication, and two `Publication` indexes build. **Serving merchant sites reads both tables, so site pages wait for the length of this migration.** Also ACCESS EXCLUSIVE on `SiteComment` and `SiteApproval`. No rewrite. |

**Not purely additive:** #4 (a CHECK replaced, looser), #5 (a unique index
rebuilt, looser), #8 (a data update that widens a role before the code
that narrows it is live) and #10 (a NOT NULL relaxed). None drops a column
or table, and none rewrites a table.

**Rollback hazards:**

- **`Store.slug` (#10).** The new API creates locations with no slug. The
  previous image's Prisma client types `slug` as non-null, so if the API is
  rolled back after one exists, it can fail reading that location. Before
  deploying the previous image, check and fill the nulls:

    ```sql
    SELECT count(*) FROM "Store" WHERE slug IS NULL;   -- read-only
    -- only on a rollback, with approval:
    -- UPDATE "Store" SET slug = id WHERE slug IS NULL;
    ```

- **Test releases (#12).** After TEST publications exist, the old image's
  version history, readiness and admin counts include them. That's harmless
  (no live pointer names one), but they're visible.
- **Plan joins (#1).** Roll back only when
  `SELECT count(*) FROM "Invoice" WHERE status = 'DRAFT' AND source = 'SUBSCRIPTION'`
  is 0, or wait 24 hours (the migration's own note).

### Pre-migration checks (read-only; all must pass)

```sql
-- #2: the new unique index on mandates builds (expect 0 rows)
SELECT "organizationId", provider, "providerMandateId", count(*)
FROM "PaymentMandate" WHERE "providerMandateId" IS NOT NULL
GROUP BY 1, 2, 3 HAVING count(*) > 1;

-- #6: the sweep's unique index builds (expect 0)
SELECT count(*) FROM "Job"
WHERE type = 'payments.confirm-pending' AND status = 'PENDING';

-- Sizes, to judge the lock windows above
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE relname IN ('Invoice', 'PaymentIntent', 'Publication', 'Site',
                  'Organization', 'Job', 'OrganizationRole')
ORDER BY n_live_tup DESC;
```

---

## 3. Backfills and audits, in order

Every command runs from a checkout of the release commit, with the
production database URL and `DATABASE_TARGET_CONFIRM=<database>` (the
guard refuses otherwise). Keep each command's output for the release issue.

| Step | When | Command (`pnpm --filter @saroh/database exec tsx src/backfill/…`) | Idempotent | Writes |
|---|---|---|---|---|
| A. Z1 gate | Before the deploy | `classes-per-period.cli.ts` | Yes. It writes only live rows still unset, and is safe while either image serves | Only if something is unset. It **must print `set now: 0, still unset: 0`** |
| B. Z2a gate | Before the deploy | SQL only (below). If it isn't 0: `contact-attention.cli.ts` **from a checkout of `main` (#708)**, because this release deletes it | Yes (C1: a second run makes nothing) | Only if the gate fails |
| C. L5/T1 audits | Before the deploy | SQL only (below) | n/a | None |
| D. Order numbers | After migrating (the table must exist), dry run then real | `order-numbers.cli.ts --dry-run`, then `order-numbers.cli.ts` | **Yes.** A second run finds nothing to change. Each business runs in its own transaction and holds its counter row's lock | Seeds each business's counter; renumbers later duplicates within a business (the old number goes to `renumberedFrom`) |
| E. Order numbers again | Once the previous API image has stopped serving | `order-numbers.cli.ts` | Yes | Only duplicates the old image made meanwhile. **Must print 0 renumbered** |
| F. `pvt` | Once the previous image has stopped serving (it stores `company` until then) | `business-type-pvt.cli.ts` | **Yes.** Exits 1 if rows changed while it ran: run it again | `BusinessProfile.type` `company` → `pvt`. **"still company" must be 0** |
| G. Stuck payments (optional) | After the API is live | `payments reconcile` inside the API's container, per business (`ROUND_2_PHASE_2_ROLLOUT.md` › P1) | Yes | Settles what the provider already has |

No backfill in this release fails to be idempotent. DEC-069, DEC-070 and
DEC-071 have **no backfill writes** by design: `Organization.kind` and
`Publication.kind` take their defaults, and the address work only audits.

### A. Z1 (read-only check after the run)

```sql
SELECT count(*) FROM "CustomerSubscription"
WHERE status <> 'CANCELLED' AND "classesPerPeriodSetAt" IS NULL;   -- 0
```

### B. Z2a gate (must return 0)

```sql
SELECT count(*) FROM "ContactNoteAllergen" na
JOIN "ContactNote" n ON n.id = na."noteId"
JOIN "StoreAllergen" a ON a.id = na."allergenId"
WHERE NOT EXISTS (
  SELECT 1 FROM "ContactAttention" e
  LEFT JOIN "StoreAllergen" ea ON ea.id = e."allergenId"
  WHERE e."contactId" = n."contactId" AND e.kind = 'ALLERGY'
    AND lower(trim(coalesce(ea.name, e.label))) = lower(trim(a.name))
);
```

### C. Address audits (DEC-069 L5, DEC-071 KTD-12)

Record each count in the release PR (the plan's Q4/Q5):

```sql
-- sites with no web address, live or draft (Q4: none is assigned silently)
SELECT count(*) AS no_address,
       count(*) FILTER (WHERE "currentPublicationId" IS NOT NULL) AS live
FROM "Site" WHERE subdomain IS NULL;

-- businesses whose address differs from their site's
SELECT count(*) FROM "Organization" o
JOIN "Site" s ON s."organizationId" = o.id
WHERE s.subdomain IS NOT NULL AND s.subdomain <> o.slug;

-- addresses a test host can't carry (Q5; any "test--…" is renamed by hand
-- with its owner before SITE_TEST_RELEASES goes on). Migration #12's DO
-- block reports the same rows as NOTICEs.
SELECT 'Organization' AS t, id, slug AS address FROM "Organization"
 WHERE slug LIKE '%--%' OR length(slug) > 57
UNION ALL
SELECT 'Site', id, subdomain FROM "Site"
 WHERE subdomain IS NOT NULL AND (subdomain LIKE '%--%' OR length(subdomain) > 57);

-- pages at /pay, which L7 reserves for pay pages
SELECT count(*) FROM "Page" p JOIN "Site" s ON s.id = p."siteId"
WHERE p.path = '/pay' AND NOT p.hidden AND s."currentPublicationId" IS NOT NULL;

-- rows in CustomDomain (L15 drops it later, and expects 0)
SELECT count(*) FROM "CustomDomain";
```

### D–E. Order numbers (before and after)

```sql
-- duplicates within a business: some before, 0 after step E
SELECT s."organizationId", o."orderId", count(*)
FROM "Order" o JOIN "Store" s ON s.id = o."storeId"
GROUP BY 1, 2 HAVING count(*) > 1;

-- counters behind the highest number: 0 after step D
SELECT count(*) FROM "OrderNumberSequence" q
WHERE q."lastNumber" < (
  SELECT coalesce(max(NULLIF(regexp_replace(o."orderId", '\D', '', 'g'), '')::int), 0)
  FROM "Order" o JOIN "Store" s ON s.id = o."storeId"
  WHERE s."organizationId" = q."organizationId" AND o."orderId" LIKE 'ORD-%');
```

### F. `pvt` (before and after)

```sql
SELECT count(*) FROM "BusinessProfile" WHERE type = 'company';  -- 0 after
SELECT count(*) FROM "BusinessProfile" WHERE type = 'pvt';
```

### DEC-074 (migration #8, after)

```sql
SELECT count(*) FROM "OrganizationRole"
WHERE key = 'storefront-team' AND NOT ('order:stage' = ANY(actions));  -- 0
```

---

## 4. Flags

Every flag is fail-closed (DEC-013): no row means off. **All four new flags
are off in production at release.** Turn each on in the admin console, one
business (an override) before everyone, and only in the order below.

| Flag | Gates | Production at release | Turn on when |
|---|---|---|---|
| `WEB_ADDRESS_CHANGE` | The owner's Change button and `PUT …/web-address` (L2, L4) | Off | Once the renderer that forwards an old address (L3) is live in production. First for one internal business, then globally. |
| `PAY_LINK_ON_SITE` | Pay links on the business's own address (L7) | Off | Once the renderer serves `/pay` on a business's own address (L6) in production. **Northwind first**, then globally. Old links keep working either way. |
| `SITE_TEST_RELEASES` | Everything test-release: the endpoints, the test-host lookup (the host's kill switch), scheduling, the Website alert row, the editor panel, and the "Publishing needs approval" row and its write | Off | Keep it off until **this API has been live for one release** (it keeps TEST rows out of version history). Then: (1) Northwind in development, after `site-test-release.spec.ts` and `site-test-release-go-live.spec.ts` pass; (2) Northwind in production, checked by hand (make, open, the refused checkout, go live, restore); (3) globally. Rename any `test--…` address from audit C first. |
| `RAZORPAY_AUTOPAY` | Offering, setting up and charging autopay through Razorpay (D12–D14) | Off, **no row** | Only after a Razorpay test-mode run on a development business has authorised a UPI mandate and settled one charge (waves plan, boundary 6), **and** that business's Razorpay webhook sends the `token.*`, `order.notification.*` and `invoice.*` events listed in `ROUND_2_PHASE_2_ROLLOUT.md` › D19. Off, renewals are invoiced with a pay link as before. |

- **No other flag is added.** DEC-070 has no flag (KTD-14): the kind
  changes only words and defaults. `SITE_SHOP`, `ACCOUNT_THREAD`,
  `SITE_ACCOUNT_AREA` and the module rollout flags are unchanged by this
  release.
- **Seed only:** the development and CI seed registers `WEB_ADDRESS_CHANGE`
  **on by default** (a business a browser test sets up must be able to
  change its own address), and gives **Northwind a `SITE_TEST_RELEASES`
  override**. It also seeds `northwind-before` as Northwind's previous
  address, and three first-run businesses for `founder@saroh.dev`. Nothing
  here reaches production, which never runs the seed.
- **Configuration:** `API_PUBLIC_URL` (the API's own public origin, from
  which Settings › Providers builds the webhook address, DEC-063) must be
  set in production. It's optional in code: unset, setup shows no webhook
  address. Check it's set before the deploy.
- **The plan's advisory suites** (`site-shop.spec.ts`,
  `site-account.spec.ts`) still apply before their own flags go on
  (`ROUND_2_PHASE_2_ROLLOUT.md` › Before switching a flag on).

---

## 5. Release order

**The API goes first, by hand; the frontends go last, with the release
PR.** The new workspace and merchant-site pages call endpoints and read
fields only this API has. Every DTO change is additive, so the old
frontends are safe against the new API. The renderer pieces (L3, L6, T5,
T6) degrade to today's behaviour when a field is missing.

1. **Pre-flight, read-only, against production:** section 2's checks and
   table sizes, the Z2a gate (3B), the address audits (3C), the WHSECRET
   counts (`ROUND_2_PHASE_2_ROLLOUT.md` › WHSECRET: record both numbers and
   the list of businesses to tell), and the "before" queries for 3D–F.
   Confirm `API_PUBLIC_URL` is set. Stop if any check fails.
2. **Z1 gate** (3A): run `classes-per-period.cli.ts` and get
   `set now: 0, still unset: 0`.
3. **Build the image** from the head of `development` with a manual run of
   the API deploy workflow (`workflow_dispatch`, target development). Note
   its `sha-<commit>` tag. Let it deploy to the development environment and
   pass `/health/ready` there.
4. **Back up production** through the host's rollout, and confirm the
   snapshot exists and note its name. Rollback is that snapshot plus the
   previous tag.
5. **Migrate** with the new image, without starting it
   (`db:migrate:deploy`). Watch the `NOTICE` lines from migration #12 and
   record them. Choose a quiet hour: #5 locks `Invoice`, and #12 locks
   `Site` and `Publication` (site pages wait) while they run.
6. **Order numbers, dry run and real** (3D).
7. **Roll the API out** with the same `sha-<commit>` tag through the host's
   rollout for production, **straight after step 5** (DEC-074's role update
   is live from the migration), and wait for `/health/ready`. Its backup and
   migrate run again and find nothing to do.
8. **After the old image has stopped:** order numbers again (3E, must
   renumber 0), then `business-type-pvt.cli.ts` (3F, "still company: 0"),
   then the "after" queries for 3D–F and DEC-074.
9. **Then the user merges the release PR** (`development` → `main`).
   Vercel ships the frontends: the workspace, accounts, admin and the
   merchant-site renderer, together. The push to `main` also runs the API
   rollout again on the merge commit. That's the same code with the
   migrations already applied, so it's harmless. If the host can't be
   reached from CI, that run fails at its connection step and changes
   nothing.
10. **Verify:** section 8's browser checks, the WHSECRET "Needs attention"
    count and the merchants to tell, no `subscription_allowance_unset`
    event in the API log for the first hour (Z1), and every flag still off.
11. **Flags, later and one at a time,** per section 4.

**Rollback:** turn off any flag you turned on first. Deploy the previous
API tag, after the `Store.slug` check in section 2, and roll the frontends
back with it: an old workspace against a new API is fine, but a new
workspace against an old API is not. A restore from the step 4 snapshot is
the last resort, and it loses anything written since. Unit-level rollback
notes (P1, P3, Z2a, D13B, WHSECRET, F10b) are in
`ROUND_2_PHASE_2_ROLLOUT.md`.

---

## 6. Held for later

- **L15 (#736): drop `Store.slug` and `CustomDomain`.** This is the
  contract step for L14. Run it only after L14 has been in production for
  at least one release and the app that stopped sending the field is live.
  Pre-flight: `CustomDomain` has 0 rows in production (audit 3C); if not,
  stop and ask.
- **Payments and autopay stay flag-off:** D11/D19/D12/D12B/D13/D13B/D14
  behind `RAZORPAY_AUTOPAY` (section 4). `SITE_SHOP` checkouts are
  unchanged.
- **Z7:** the unique index on (business, order number), once no image
  before P3 can run and step 3E prints nothing to change.
- **Z8:** blocking checkout on a Razorpay connection with no webhook secret
  (not in this release, by decision; see WHSECRET).
- **Z2:** drop `ContactNoteAllergen`, two deploys after Z2a.
- **Z4:** stop accepting `company`, once audit 3F reads 0 in production.
- **Z6:** remove D5's temporary `PATCH :planId`, one release after the Plan
  Editor (D7) is live.
- **Flag removals:** `PAY_LINK_ON_SITE` (with the apex-only link
  functions), `WEB_ADDRESS_CHANGE` and `SITE_TEST_RELEASES` (its seven
  readers), each one release after it is on everywhere.
- **Test host on a custom domain** (`test.` + the merchant's domain) needs
  the merchant's DNS record and the host added by hand, as the domain
  itself does. Until then only the platform test host is offered.
- Optional: delete `components/invoices/payments-denied.tsx` once no route
  uses it (DEC-070 plan).

---

## 7. Design reviews still owed

These were built with no design. Each needs a design pass before its flag
goes on, or, for surfaces that are already live, soon after the release:

- The **test-release bar and link gate** on the test host (T5).
- **T6's test-release stops** for orders, bookings, forms, sign-in and
  payment.
- **T11's editor sheets:** make, share, schedule and go live.
- **T12's release review page**, and version history naming a release.
- The **Projects block** (K11).
- The **Portfolio, Writing and Personal templates** (K12–K14).
- **Settings rows:** K5's "What you're setting up" and T13's "Publishing
  needs approval".

K5, the Projects block and the templates are live at release (they aren't
behind a flag). The test-release surfaces stay dark until
`SITE_TEST_RELEASES`.

---

## 8. Browser checks

At desk and phone widths, on the development environment after step 3 (or
locally on the seeded stack). **Writes only on Northwind.** Rye, Pulse,
Leela & Loom and Kavi are read-only: look, never save.

**Web address and Locations (DEC-069)**

- **L4 web address card:** Settings › Business › Identity shows the web
  address. With `WEB_ADDRESS_CHANGE` on, the owner sees Change and its
  dialog: 90-day forwarding, and customers sign in again. A non-owner sees
  no Change. Off, there's no button at all (not a disabled one).
- **L3 forwarding:** the previous address (`northwind-before` in the seed)
  answers 307 to the same page on Northwind's address. An unknown address
  still 404s. A test host never forwards.
- **L8 share buttons:** the shop, booking page and site each share their
  own link (the custom domain when verified).
- **Locations:** Sell › Locations, and no "storefront" in the copy. The old
  route redirects there. "Your online shop sells from ‹location›".

**Who Saroh is for (DEC-070)**

- **K3 first run per kind:** sign in as `founder@saroh.dev` and open each of
  Asha's seeded businesses (A business, Just me, A site for my work). Home's
  first run and the module picker follow the kind, and Sell is pre-selected
  only for the business.
- **K4 checklist when money moves:** Asha Rao Studio (WORK, nothing on)
  shows no registered address, business type or logo nudge. Northwind,
  where money moves, shows them as before, and its Home is otherwise
  unchanged. (Watching the nudges appear as a module goes on is a write;
  the browser suite covers it on a business it sets up.)
- **K5 kind switch:** Settings › Business › Identity: change the kind, see
  the words change, and Undo puts them back (desk, phone, dark).
- **K7 invoices with Payments off:** issue, send and mark paid work; no
  online Pay where no provider is connected. Northwind (Payments on) is
  unchanged.
- **K15:** the Turn on sheet's template line names the template, and a new
  site for each kind starts from its template (business: starter, just me:
  personal, work: portfolio), with a working enquiry form.

**Test releases (DEC-071), on Northwind with its override on**

- **T11:** in the editor, make a test release, share it, schedule it and
  cancel, then go live. Publish reads "Needs approval" when the setting is
  on.
- **T12:** review a test release; version history names it and records an
  owner's override. A new test release doesn't already read Approved.
- **T13:** the "Publishing needs approval" row. It can't be turned on while
  the flag is off.
- On the test host: the bar, `noindex`, and a refused checkout, booking and
  form (T6). With the API stopped, the stop still shows and reads show
  their failed states, never zeros.

**Everything else**

- The Turn on sheet from each entry point (DEC-068); a hidden module
  appears nowhere.
- Pay pages on the tenant host (L6) open and pay on Northwind.
- An invoice PDF with the logo; GST lines per DEC-072 on Rye (read-only).

---

## 9. Known flaky tests (harden later)

- **`site-sign-in.spec.ts` A9 and `public-booking`, late in the day.** A
  booking test took "the first open day", which late in the day has only
  one time left. A9's `chooseTime` now picks a day with two free times.
  `public-booking` failed beside it once (T4's run) and passed on rerun.
  Its cause isn't confirmed, so check how it picks its day. Rule: read the
  day from the page or the API.
- **The workspace's `lib/merchant-copy.test.ts` times out at 5s under
  load.** It scans every source file synchronously. Give it an explicit
  timeout.
- **`@saroh/site-blocks` `src/account/bookings-list.test.tsx`:** "window is
  not defined" after all tests pass, under load. A timer outlives jsdom.
  Clear timers in `afterEach`.
- **@serial phone branches that test `project.name === "phone"`.** Under
  `e2e/run.mjs` a @serial test runs in `phone-serial`, so the phone branch
  never runs (and passes without checking). Use `startsWith("phone")`. K7's
  spec is fixed; sweep the other @serial specs.

Details and causes: `DEV_LEARNINGS.md` (entries dated 2026-09-29 and
2026-09-30).
