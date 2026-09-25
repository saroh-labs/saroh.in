# Running Saroh locally

> **Read when:** starting the stack, seeding or pointing at a database, or
> checking a change in a browser by hand. The URL of every app and every
> environment variable: `docs/architecture/ENVIRONMENT.md`.

## Run the apps with portless, never on ad-hoc ports

Every app is reached at its **production hostname with `.localhost` appended**
(`https://app.saroh.localhost`, `https://api.saroh.localhost`, …). `portless`, a
root devDependency installed once as an OS service, terminates HTTPS on 443 and
routes each hostname to its dev server. Each app's `portless` field in its
`package.json` declares its name. `portless` is a root devDependency; the proxy
itself is installed once per machine, in a real terminal (it asks for sudo):
`npm install -g portless && portless service install --wildcard`.

```bash
pnpm dev                                    # everything
pnpm dev:api-auth                           # api + accounts only
pnpm turbo run dev --filter=@saroh/api --filter=auth --filter=application
pnpm portless:status                        # is the proxy up?
```

**Do not start apps with `next dev -p 3003` or `nest start` and a `PORT`.** It
looks equivalent and is not:

- Unless `CORS_ORIGIN` is set, `api.saroh.in`'s CORS allowlist is the trusted
  origins plus the `.localhost` hostnames (`main.ts`), so sign-in from an app on a bare port is refused by the browser
  before it reaches the API — with no error in the API log, because no request
  arrives.
- Better Auth scopes its cookie to the shared parent domain. Apps on different
  ports of bare `localhost` do not share a session, so the workspace bounces
  back to the login screen forever.
- The `.localhost` names match production, so what you verify locally is the
  shape that ships.
- The API reads the client's address past the proxies it trusts
  (`TRUST_PROXY=cloudflare` by default: Cloudflare's edge and the private
  network, which includes portless here). Reached on a bare port, a client's
  own `X-Forwarded-For` would be believed — set `TRUST_PROXY=none` if you must
  run it that way.

**Set `BETTER_AUTH_TRUSTED_ORIGINS` when you run the stack yourself.** Unset, it
falls back to the `*.saroh.in` production list, so a return-to on a `.localhost`
origin is correctly refused and sign-in lands on the app launcher instead of the
page asked for (#222). The root `.env.example` has the value; an ad-hoc `turbo run dev`
with your own env does not inherit it. A second copy of the app under another
portless name (a worktree's `customers-app.saroh`, say) must add its own origin
to the list for both that app and the API it calls: the app's middleware answers
every server action from an unlisted origin with `403 Untrusted request origin`,
which the page only reports as "An unexpected response was received from the
server".

A **merchant's own site** hangs off the renderer's apex, so the seeded
`northwind` site is https://northwind.saroh.app.localhost — that wildcard is
why `portless service install` takes `--wildcard`. A **draft preview** lives at
`https://saroh.app.localhost/preview/<token>`.

## Seeded data

```bash
pnpm --filter @saroh/database db:seed        # "Northwind Supply"
```

Sign in as the owner `demo@saroh.dev` / `demo-password-123`, or as
`reviewer@saroh.dev` (same password) to see the Reviewer role — fixture values
for a throwaway database, from `packages/database/src/seed/data.ts`. The seed lays down 24
contacts, 16 leads, 3 services, 10 bookings, 12 products, 10 orders and 3 sites
— enough for every operational surface to have something on it.

### Showcase (the product film's world)

```bash
pnpm --filter @saroh/database db:seed:showcase   # base seed, then seven businesses on top
pnpm --filter @saroh/database db:seed:reset      # removes both
```

This runs the base seed first, then adds more to Northwind (about 50 products,
500 customers, 500 orders, 120 contacts and 40 leads) and adds six more
businesses — the first four each with one published site at
`<slug>.saroh.app.localhost`, the two shops without one:

- **Pulse Fitness** (a gym): personal training, assessments, classes and a
  free trial, about 490 bookings. Four people on the diary (`pulse.ts`): the
  demo owner as Karan Mehta (linked to their membership) and
  three trainers without accounts, each with their own weekly hours; one off
  for two days this week, one with extra hours this Saturday; booking rules
  (21 days ahead, 2 hours before, free cancel up to 12 hours). Every booking
  is taken by someone who works then, or left Unassigned (a few each week),
  and says how it was paid — membership, pack, online or at the desk — with
  late cancels and no-shows. Standard (₹2,500, 8 classes a month; ₹2,200 for
  members who joined before the last price rise), Off-peak (₹1,600, 4) and
  Yearly (₹25,000, 8) memberships with 120 subscriptions over the past year,
  invoiced every period — most paid, some overdue with a failed renewal, a few
  paused, cancelled or ending, one changing plan at renewal. Packs of 5
  (₹2,200 / 60 days) and 10 (₹4,000 / 90 days) classes and a retired "First 3
  classes" (₹999): about 30 sold, one about to run out, one run out unused. One
  open course, a few invoices written by hand, notes on three people. About
  770 invoices. `checkPulse` stops the run if any of these states is missing.
- **Prana Yoga** (a studio): studio classes, and live online classes whose
  bookings carry a meeting link. Four courses — one running, one online
  starting soon, one finished, one draft — with 30 enrolments; three class
  packs (one retired) with 45 sold and the classes spent on real bookings.
- **CarePoint Clinic**: doctors' appointments (one of them by video) and 260
  patients, about 340 bookings. No Payments, so no billing.
- **Lumen Studio** (a design studio): 30 leads and 3 posts.
- **Leela & Loom** (a beauty and dresses boutique, owned by `demo@saroh.dev`;
  #471): the store the products screens are filmed in. Thirty products —
  skincare for women and men, and women's dresses — with 3–5 photos each
  (free-licence Unsplash images, credited, loaded by address), MRP beside most
  prices, variants by Volume, Shade, Size or Colour with stock counted per
  variant (one sold out, a few low, eight open orders holding stock), and 81
  verified-purchase reviews behind delivered orders — some replied to, one
  hidden. Its catalogue is fixed; its orders and reviews are rewritten each
  run and checked (`checkBoutique`). Before filming, run
  `node scripts/check-demo-images.mjs` to confirm every photo still loads.
- **Rye & Co.** (an artisan bakery on Hill Road, Bengaluru, owned by
  `demo@saroh.dev`; Nisha Kulkarni works the counter as a Member; `bakery.ts`):
  the business the invoices, orders, subscriptions and customer screens are
  filmed in. GST-registered in Karnataka (GSTIN `29AAGCR4375J1ZU`, prefix RC):
  breads nil-rated (HSN 1905 90 10), pastry 18% (1905 90 20), coffee 5% (SAC
  996331), delivery ₹60 at 18% (SAC 996813), prices GST-inclusive; eight
  allergens on the storefront and each product's "contains" / "may contain".
  About 65 orders over five weeks, each paid one with its tax invoice
  (RC/26-27/0001…; CGST + SGST, IGST for deliveries to Goa, Telangana, West
  Bengal and Maharashtra), and today's board in every kitchen stage — new,
  preparing (one edited before preparing, with a supplementary invoice),
  ready, collected, one with the courier and a tracking link, one whose
  payment failed — plus one partly refunded by line with its credit note
  (RCCN/26-27/0001). A Sourdough plan (₹480 a week) and a monthly one
  (₹1,800), eight subscribers collecting on Saturdays: one renewal failed, one
  paused, one changing plan at renewal, skips to come; renewals are tax
  invoices with the loaf at 0% (plans carry no GST rate). Four trade cafés
  billed by hand — paid, due, overdue, a draft, and one in Goa in IGST.
  Subscribers' contacts are linked to their store customers; Rohan Das is a
  contact and a customer with the same email, left unlinked (a possible
  match). Priya Raman's note names sesame and today's order holds a loaf that
  may contain it (the allergy banner). `checkRye` stops the run if any of these
  states is missing.

Every business keeps time in Asia/Kolkata (`BusinessProfile.timezone`). The
showcase code is in `packages/database/src/seed/showcase/`. It uses a seeded
random generator and dates relative to now, rounded down to the half hour:
running it again inside that half hour changes no row (except the base seed's
demo and reviewer password hashes, which it re-salts on every run). On a later
day it moves the diary, the renewals and the invoices forward with the
calendar. It queues no jobs: the API starts its own subscription renewal run
when it boots. At the end it checks, in SQL, that every invoice adds up (and
every tax invoice line's GST is its rate's), each invoice series runs from
0001 with no gaps (INV-0001…, RC/26-27/0001…, RCCN/26-27/0001…), subscription periods
follow the renewal rules, no service is booked past its capacity (counting the
seats an open course still holds), and every class spent from a pack was one
the pack could pay for; it stops with the failing rows if not. Rows it wrote
for Mirror & Co. and the earlier Rye & Co. (`seed_sc_rye_`; today's is
`seed_sc_rc_`), the earlier line-up, are removed.

#### Demo accounts

Every account's password is `demo-password-123`, and every email is verified.

| Email                | Business and role                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `demo@saroh.dev`     | Northwind OWNER · Leela & Loom OWNER · Rye & Co. OWNER · Pulse Fitness OWNER · Prana Yoga ADMIN · CarePoint Clinic MEMBER · Lumen Studio REVIEWER (its site only) — plus the base seed's Monsoon and Whitefield sites, OWNER                                                                                                                                 |
| `admin@saroh.dev`    | Northwind ADMIN · Pulse Fitness ADMIN                                                                                                                                                                                                                                                                                                                        |
| `member@saroh.dev`   | Northwind MEMBER · Prana Yoga MEMBER                                                                                                                                                                                                                                                                                                                         |
| `reviewer@saroh.dev` | Northwind REVIEWER (base seed)                                                                                                                                                                                                                                                                                                                               |
| Business owners      | `radhika.bhat@` (Prana) · `meera.nair@` (CarePoint) · `aditi.rao@` (Lumen), all `@saroh.dev`                                                                                                                                                                                                                                                                 |
| Staff                | Northwind: `suresh.gowda@`, `anita.fernandes@` · Pulse: `kabir.sethi@`, `ritika.nair@`, `imran.shaikh@`, `deepa.hegde@` · Prana: `anand.murthy@`, `leela.krishnan@`, `farah.siddiqui@` · CarePoint: `pooja.shetty@` (ADMIN), `arjun.rao@`, `sara.thomas@` · Lumen: `vikram.iyer@`, `sana.merchant@`, `rohan.pillai@` · Rye & Co.: `nisha.kulkarni@` (MEMBER) |

CarePoint is a Member's view on purpose. A Member's role today reads the
business, its team and its sites but not contacts or bookings, so the clinic
shows how little a Member can open rather than its diary; sign in as
`meera.nair@` (OWNER) or `pooja.shetty@` (ADMIN) to see the appointments and
patients.

## Databases

`packages/database/src/database-target.ts` refuses to migrate or seed a
database that is not allow-listed for the current `NODE_ENV`. To use a
throwaway database, name it explicitly rather than working around the guard:

```bash
DATABASE_TARGET_CONFIRM=saroh_scratch DATABASE_URL=... pnpm --filter @saroh/database db:seed
```

Changing a migration: `.agents/skills/saroh-migrations/SKILL.md` (the replay
check CI runs as `migration-replay`).

## Checking a change in a browser

**Drive the PERSISTENT Chrome window. Never `playwright test` with its own
throwaway browser** for a manual check. A throwaway launch uses a fresh profile
and closes itself: the session is gone every run, nothing you did is
inspectable afterwards, and nobody watching the screen sees anything happen.

Start the window once, and leave it open (macOS path shown):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.saroh-dev-chrome" \
  --no-first-run --no-default-browser-check --ignore-certificate-errors
```

`--ignore-certificate-errors` is for portless's own CA on the `.localhost`
names. Sign in once as the seeded demo owner; the profile keeps the session.

Attach from a script run inside `e2e/` (where `@playwright/test` is installed),
drive it, and detach — the window stays open:

```js
import { chromium } from "@playwright/test";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
const page = browser.contexts()[0].pages()[0];
await page.bringToFront();
await page.goto("https://app.saroh.localhost/sites");
// …drive, screenshot, measure…
await browser.close(); // detaches; the window is still there
```

Take screenshots at 1440 and 400 wide and LOOK at them — a layout question is
not answered by a passing assertion. `page.evaluate` measuring a real
`getBoundingClientRect` is how you check a gutter or an overflow. What to check
is in `docs/patterns/frontend-verification.md`; automated browser tests, which
run in CI, are in `.agents/skills/saroh-browser-tests/SKILL.md`.
