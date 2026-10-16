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
origin is correctly refused and sign-in lands on the app's front door instead of the
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

A **test release** (DEC-071) is served on its own host,
`https://test--northwind.saroh.app.localhost/?release=<token>` — the link the
API returns when one is made (`SITE_TEST_RELEASES` is on for Northwind in the
seed). The first visit moves the token into a `__Host-saroh-test` cookie for
that host and drops it from the address; without the cookie every page of the
host shows "Open this test release from its link". On a bare-port stack (CI,
`pnpm prepush --e2e`) the same host is `http://test--northwind.localhost:3005`.

## Seeded data

```bash
pnpm --filter @saroh/database db:seed        # "Northwind Supply"
```

Sign in as the owner `demo@saroh.dev` / `demo-password-123`, or as
`reviewer@saroh.dev` (same password) to see the Reviewer role — fixture values
for a throwaway database, from `packages/database/src/seed/data.ts`. They
are used only when the database is on this machine (localhost, as here and on
CI); seeding any other database needs `SEED_PASSWORD` (12+ characters, kept
out of the repo), and the seed refuses the documented one there
(`seedPassword()`). The seed lays down 24
contacts, 16 leads, 3 services, 10 bookings, 12 products, 10 orders and 3 sites
— enough for every operational surface to have something on it. Northwind has
two storefronts: "Northwind Supply Store" (`seed_store`) and "Online"
(`seed_store_online`), which sells six of the products from its own shelves
(one low, one out) so Move stock has somewhere to go (#526). Northwind is the
write sandbox; re-seeding counts every shelf back.

Provider connections are stand-ins (`seed/stand-in-providers.ts`): the seed
never writes a real credential, so their sealed keys are placeholders the API
can't open. On this machine's database Northwind's Cashfree and Resend, and
the showcase's Razorpay and Cashfree, read as CONNECTED so the browser specs
and films can offer Pay now, make pay links and name email on Send — the
specs stub the provider in the browser — but a real checkout there fails and
an email sent through Northwind's own provider fails on every retry. On any
other database (the dev environment's) the seed writes none, and removes one
an earlier seed left; connect real test keys in Settings › Providers instead.

### Showcase (the product film's world)

```bash
pnpm --filter @saroh/database db:seed:showcase   # base seed, then the showcase businesses on top
pnpm --filter @saroh/database db:seed:reset      # removes both
```

This runs the base seed first, then adds more to Northwind (about 50 products,
500 customers, 500 orders, 120 contacts and 40 leads) and adds seven more
businesses — Pulse, Prana, CarePoint, Lumen and Kavi Dental each with one
published site at `<slug>.saroh.app.localhost`, and Rye & Co. and the
boutique with their own. Pulse, CarePoint, Rye & Co. and Leela & Loom each
have a journal at `/blog` (24–30 posts in Help, News and Articles, photos
inside the posts; `journal.ts`, `<business>-posts.ts`) linked from the menu,
and Pulse, CarePoint and Leela & Loom 90 days of Insights traffic that
counts their paid orders and enquiries and follows the festival calendar
(`traffic.ts`; the product records no traffic source, so neither does the
seed):

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
  Commerce is on (the gym sells at its counter, `pulse-shop.ts`): a "Front
  desk" storefront with 30 products — house-labelled supplements by flavour
  or size (whey 1 kg and 2 kg, isolate, plant protein, creatine, pre-workout,
  BCAA, electrolytes, protein bars single or by the box, peanut butter,
  multivitamin, omega-3), gear (shakers and bottles by colour, gloves and
  belts by size, wraps, bands, rope, roller, mat, towel, bag) and Pulse
  T-shirts (S–XXL) and tanks (S–XL) in four and two colours — photographed,
  with MRP and GST by HSN, counted per variant (two sold out, some low), and
  about 140 counter orders a month for 90 days from about 100 members (by
  their contact's email, so their page shows them), two open today holding
  stock, one in a hundred returned. With Commerce on, a member's page reads
  as a shop with a diary: Orders beside Bookings, "Subscriptions" rather
  than "Membership". `checkPulseShop` checks it.
- **Prana Yoga** (a studio): studio classes, and live online classes whose
  bookings carry a meeting link. Four courses — one running, one online
  starting soon, one finished, one draft — with 30 enrolments; three class
  packs (one retired) with 45 sold and the classes spent on real bookings.
- **CarePoint Clinic** (5th Cross, Malleshwaram): doctors' appointments
  (one of them by video) and 260 patients, about 620 bookings from 90 days
  back to 3 weeks ahead. Payments is on with the stand-in Razorpay
  (`carepoint-billing.ts`): a third of visits, and every teleconsultation,
  paid online at booking (the booking's own invoice, marked paid); the rest
  billed at the desk after the visit, mostly paid there by UPI, cash or card,
  a few due or overdue — about 150 paid consultations a month, exempt, in
  INV-0001…, each naming the patient's contact so their account on the site
  shows their visits and bills (nothing medical is stored).
  `checkCarePoint` checks it.
- **Lumen Studio** (a design studio): 30 leads and 3 posts.
- **Leela & Loom** (a beauty and dresses boutique, owned by `demo@saroh.dev`;
  #471): the store the products screens are filmed in. Thirty products —
  skincare for women and men, and women's dresses — with 3–5 photos each
  (free-licence Unsplash images, credited, loaded by address), MRP beside most
  prices, variants by Volume, Shade, Size or Colour with stock counted per
  variant (one sold out, a few low, eight open orders holding stock), and 81
  verified-purchase reviews behind delivered orders — some replied to, one
  hidden. Its catalogue is fixed; its orders and reviews are rewritten each
  run and checked (`checkBoutique`). Behind them, three months of trade
  (`boutique-history.ts`): about 150 orders a month from about 100 paying
  customers, delivered by courier with tracking or collected on Commercial
  Street, a few cancelled and refunded, WELCOME100, MONSOON20 and GLOW15
  redeemed in their windows, numbered LL-1001… in the order they were placed.
  Its site, `leela-and-loom.saroh.app.localhost` (`boutique-site.ts`): home
  (new in, testimonials, the journal), four collections, about and visit us,
  the shop at `/shop` selling from its storefront (now a shop with an address,
  hours, collection and ₹79 delivery free over ₹1,499; `SITE_SHOP` is on for
  it). Before filming, run `node scripts/check-demo-images.mjs` to confirm
  every photo still loads.
- **Rye & Co.** (an artisan bakery on Hill Road, Bengaluru, owned by
  `demo@saroh.dev`; Nisha Kulkarni works the counter as a Member; `bakery.ts`):
  the business the invoices, orders, subscriptions and customer screens are
  filmed in. GST-registered in Karnataka (GSTIN `29AAGCR4375J1ZU`, prefix RC):
  breads nil-rated (HSN 1905 90 10), pastry 18% (1905 90 20), coffee 5% (SAC
  996331), delivery ₹60 at 18% (SAC 996813), prices GST-inclusive; eight
  allergens on the storefront and each product's "contains" / "may contain".
  About 75 orders over five weeks, each paid one with its tax invoice
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
  match). Priya Raman's Needs attention names sesame and today's order holds a loaf that
  may contain it (the allergy banner). The products screens' sample data
  (#526, `bakery-catalogue.ts`, `bakery-stock.ts`): two storefronts, Hill
  Road and Online (`seed_sc_rc_store`, `seed_sc_rc_store_online`), and one
  website; fifteen products, seven counting stock per storefront — Sourdough
  loaf 800g/400g, Cinnamon bun Single/Six-pack, Almond croissant Single/Box of
  4, Rye & caraway, Focaccia, House blend beans 250g by grind and 1kg. The
  Products list reads "Needs you: 1 short for orders · 2 out of stock · 1
  running low" — the Cinnamon bun (its six-pack 2 short at Hill Road), the
  Rye & caraway loaf and the 1kg beans, the Focaccia; the rest are healthy.
  Open orders hold what they promise. A five-day stock log —
  counted, baked, received, sold, wasted and a move from Hill Road to Online —
  adds up to every shelf, and three checks are open: that short, a count that
  didn't match, and yesterday's loaf sold without leaving stock. The
  multigrain loaf (untracked) is marked Sold out by hand at Hill Road. Four
  collections: Bread (automatic, from Breads), Weekend bakes, Gifts and New
  this week. The stock log and resolved checks are rewritten whole each run,
  so a take is undone by re-seeding. Custom cakes (`bakery-cakes.ts`):
  eight cakes made after the order with 48 hours' notice — chocolate truffle,
  red velvet, black forest, rasmalai (always eggless), lemon & blueberry,
  coffee walnut, vanilla & seasonal fruit and a theme cake — by size with an
  eggless twin where the recipe allows, never counted, and candles, number
  candles, a topper and a message plaque; five cake orders placed this
  morning for delivery two to five days out, paid, the day, theme and message
  in the order's note (an order has no due date). They take order numbers in
  the order placed; the films' orders keep their ids. `checkRye` stops the
  run if any of these states is missing.

- **Kavi Dental** (a dental clinic on 12th Main, Indiranagar, owned by
  `demo@saroh.dev`; Divya Kamath works the desk as a Member; `clinic.ts`,
  `clinic-plan.ts`; E29): the clinic the round-2 bookings screens are verified
  and filmed in. GST-registered in Karnataka (GSTIN `29AAKFK7719M1ZJ`, prefix
  KD) but exempt: every service and invoice line is 0%, SAC 9993. Six
  services — Check-up and clean (30 min, ₹1,200), Follow-up review (20 min,
  ₹500), Root canal treatment (3 visits of 60 min, ₹12,000, 50% deposit),
  Teeth whitening (2 visits of 45 min, ₹8,500), Video consultation (20 min,
  ₹600, at the clinic or by video, with a meeting link) and X-ray, full mouth
  (OPG) (hidden from the booking page; the desk books it). Two dentists,
  Dr. Meenakshi Rao and Dr. Arun Pillai, with their own weekly hours, one of
  them with a day off this week; booking rules of 4 weeks ahead, 2 hours
  before and free cancel up to 24 hours. A published site (`kavi-dental`)
  whose `/book` page lists the five shown services, and one storefront, "Kavi
  Dental", a shop with the clinic's address and hours and nothing listed
  (E9's treatment orders will go there). About 370 bookings from 60 days ago
  to 3 weeks ahead, every one on a start the dentist's week offers, none in
  the closure "Closed for Diwali" (the day before Diwali to two days after,
  from a table of dates in `clinic-data.ts`) or on the day off: attended
  visits, no-shows, a late cancel, video consultations online or in person.
  The designs' patients and scenes: Rahul Verma's root canal (visit 1 last
  week, visit 2 coming, booked on the site with a note still waiting as a
  Needs attention suggestion), Leela Menon's check-up and video consultation,
  Farah Khan's whitening, Vikram Rao's check-up, the X-ray it led to (billed,
  overdue) and his review; Needs attention on Rahul (blood thinners, latex),
  Farah (pregnant) and Leela (anxious patient). Visits paid online have their
  invoice (source BOOKING, KD/26-27/0001…); the desk bills a visit by hand
  afterwards, mostly paid there and then, some due or overdue. Treatments
  carry no bill yet: E9 turns them into orders. `checkKavi` stops the run if
  any of these states is missing, and `clinic.test.ts` plans the clinic for
  every half hour's `now` over months and across Diwali, month, year and
  financial-year boundaries to prove it works on any day.
- **Ammi Ki Barni** (a home pickle kitchen in Nishatganj, Lucknow, owned by
  `demo@saroh.dev`; Faizan Khan takes the orders as an Admin; `achaar.ts`,
  on the Grow plan): 35 products — pickles in 250 g / 500 g / 1 kg jars (some
  in mustard or sesame oil), winter pickles waiting for November, Diwali and
  Eid boxes, and masalas, papad and aam papad counted on the shelf (one sold
  out, two low). The pickles are made after the order comes in and count no
  stock, so about 40 open orders sit in New or Preparing with "Pick-up Sat 18
  Oct" or "Faizan delivers Tue 20 Oct" in their notes. About 460 orders over
  three months from 105 customers (one-timers to weekly regulars), mostly
  pick-up and local delivery, paid by UPI or cash at the handover; a few
  cancelled, refunded, uncollected or delivered and not yet paid; Diwali
  bulk orders. 40 reviews, an "Achaar ka Dabba" monthly box with 50 ongoing
  and 50 ended subscribers and their invoices, enquiries from the site's "Ask
  Ammi" form as leads, two QR codes with their scans, and 90 days of site
  traffic that agrees with the orders. Its site
  (`ammi-ki-barni.saroh.app.localhost`) has six pages and a journal of 30
  posts in Help, News and Articles. `checkAchaar` stops the run if a designed
  state is missing.
- **Margin Books & Café** (an independent bookshop with a café corner on
  Prabhat Road, Pune, owned by `demo@saroh.dev`; Siddharth Kale is a Member;
  `pagdandi.ts`, on Pro): 93 products — public-domain classics in Paperback,
  Hardcover, used and Hindi/Marathi/Bengali editions, books by fictional Pune
  writers (one, _Kasba Peth Rains_, on pre-order until 1 Nov, its paid orders
  waiting), stationery with many variants (a notebook in 24, inks in 12) and
  café things. Book covers are generated SVGs
  (`scripts/demo-covers/generate-pagdandi-covers.mjs` →
  `pagdandi-covers.ts`). About 500 orders, nearly half at the counter to
  walk-ins; Thursday author evenings and a Saturday story hour with ~320
  bookings; a Book of the Month club with 50 ongoing and 50 ended members;
  reviews, enquiries, QR codes, traffic and a 30-post journal as above, at
  `margin-books.saroh.app.localhost`. `checkPagdandi` guards its states.
  Both are written by `demo-shop.ts`; run `node scripts/check-demo-images.mjs`
  before filming either.

- **Golden Hour Weddings** (a wedding photography and planning studio on Lake Palace
  Road, Udaipur, with a Jaipur desk; owned by `demo@saroh.dev`, Meher Bhati
  plans as a Member; `frame-vow.ts`, `frame-vow-data.ts`, the engine in
  `studio.ts`): GST-registered in Rajasthan (prefix GH, prices include 18%:
  SAC 998385 photography, 998386 prints and albums, 998596 planning). Four
  people on the diary (Kabir Shekhawat, Ishaan Mathur, Meher, Tanvi Purohit)
  and ten services: a free planning call (studio or video), engagement,
  pre-wedding, haldi & mehendi and wedding day (25% deposit), maternity,
  newborn, family and couple sessions paid in full online, corporate half
  days billed after. Fifteen couples' jobs — a 25% advance invoice holds each
  date, the 75% balance is invoiced once the edit is delivered (paid, or for
  Sanya & Vivek overdue and being chased), planning invoices itemise décor and
  catering by the plate on the final count — plus three quotes as draft
  invoices, about 330 bookings (weddings booked months ahead), 16 products
  (a 27-variant album by size · cover · pages, canvas, cotton-rag prints,
  sheesham frames, edit packs; décor, catering per plate, DJ and mehendi as
  quoted-only products) with about 175 print and album orders and 20 reviews,
  33 enquiries across New enquiry → Call done → Quote sent → Advance paid →
  Booked → Delivered (15 from the site's form), notes, 30 posts (Help, News,
  Articles) and 90 days of Insights. Site at
  `golden-hour-weddings.saroh.app.localhost`: home, portfolio, packages, planning,
  enquire, about, journal. `checkFrameVow` stops the run if a designed state
  is missing.
- **Loop Local Media** (a five-person social-media and local-marketing agency at
  Shekhar Central, Palasia, Indore; owned by `demo@saroh.dev`, Nikita Rathi
  as a Member; `pixel-chai.ts`, `pixel-chai-data.ts`): GST-registered in
  Madhya Pradesh (prefix LL, SAC 998361, shoots 998385, print 998912). Monthly
  retainers as plans — Listing care ₹2,999, Starter ₹14,999, Growth ₹27,999,
  Pro ₹44,999 — with about 100 subscriptions over 18 months: 51 running (two
  paused, one whose renewal failed), 50 ended (some moved up a plan), every
  period invoiced. A free 20-minute audit call, a strategy workshop and a
  Google profile clean-up paid online, reel shoot days billed after; brand
  kits and festive packs billed by hand and a proposal as a draft; standees,
  table tents and print packs ordered online; 26 leads (13 from the site),
  notes, 30 posts and 90 days of Insights. Site at
  `loop-local-media.saroh.app.localhost`: home, work, plans, audit, contact,
  journal. `checkPixelChai` stops the run if a designed state is missing.
  Their photos are Unsplash images every one of which was looked at
  (`studio-photos.ts`, checked by `node scripts/check-demo-images.mjs`);
  album covers, a catering card, standees and a sample report are drawn by
  `scripts/demo-art/studio-art.mjs` and carried as `data:` URIs.
- **Aarohan Academy** (a NEET/JEE coaching centre on Gopalpura Bypass,
  Jaipur, owned by `demo@saroh.dev`; Vikram Choudhary, the director, signs in
  as Admin and Kavita Saini, the admissions counsellor, as Member;
  `shiksha.ts`, `shiksha-data.ts`, `shiksha-posts.ts`): GST-registered in
  Rajasthan (prefix AA, SAC 999293 at 18%, prices include GST). Batches are
  class-style services with 40 seats and weekly times (NEET Class 11 morning,
  NEET Class 12 and JEE Class 11 evening, Class 9–10 weekends) that the site's
  timetable reads; the free demo class and the counselling call are booked
  online. Courses: the JEE Main crash course running, IELTS starting after
  Diwali, Spoken English finished, the next one a draft — each enrolment
  invoiced. About 50 students on monthly fee plans (some renewals failed or
  overdue) and as many who have left; 42 on the ₹96,000 yearly programme pay
  four ₹24,000 instalments, raised by hand each quarter (some overdue, one
  voided, one draft after a scholarship). Six faculty on the diary with their
  hours. 175 students, each with their parent written on their record as a
  note; 40 admissions enquiries in the pipeline (Enquiry → Counselling call →
  Demo class attended → Admitted, or lost), most from the site's form; about
  200 shop orders of study modules and test-series books (subject × Hindi or
  English medium), T-shirts, lab coats and OMR packs. A published site
  (`aarohan-academy`) with courses, batches and timetable, results, faculty,
  admissions, a demo-class page, and 27 posts in Help, News and Articles;
  three QR codes with daily scans; ~4 months of site traffic with the results
  day and admissions opening in it. What is missing for a real coaching
  centre: a parent login (or a parent linked to a student), batch attendance,
  quizzes and test marks, an instalment plan (instalments are invoices raised
  by hand) and a batch as something a student is on (not a booking).
- **Baithak Cowork** (a small coworking space on Baner Road, Pune, owned by
  `demo@saroh.dev`; Rhea Deshpande, community manager, is Admin and Omkar
  Pawar, front desk, Member; `desk42.ts`, `desk42-data.ts`,
  `desk42-posts.ts`) — a CONCEPT demo of what a coworking space can do on
  Saroh today. GST-registered in Maharashtra (prefix BC, SAC 997212 at 18%).
  The day pass is a service with 20 places a weekday (the hot desks), also
  bought ten at a time as a Flexi 10 pack; the Sahyadri meeting room and the
  call booth are one-to-one services by the hour (two hours is two
  bookings), every online booking paid with its tax invoice. Memberships are
  monthly plans — hot desk, dedicated desk, virtual office: 36 on one (a
  failed renewal, one paused, one ending) and 21 who left; 50 on at once
  would be more than a 34-desk space holds. About 110 café, locker, printing
  and merch orders; 22 membership enquiries; 26 posts. What is missing:
  desks and rooms as resources (which desk, a floor plan, a 90-minute room
  booking), member credits (the dedicated desk's four room hours a month),
  check-in at the door, guest passes, and the virtual office's mail.

    Both are drawn from photos hot-linked from Unsplash (checked by
    `scripts/check-demo-images.mjs`) and pictures the seed draws —
    covers, uniforms, timetables, the results card, the floor plan —
    rendered by `scripts/demo-assets/render-demo-assets.mjs` into
    `apps/app.saroh.in/public/demo/`, so they show only while the local app
    runs at `https://app.saroh.localhost`. `checkShiksha` and `checkDesk42`
    stop the run if a designed state is missing.

- **Gulmohar Salon & Bridal** (a unisex salon and bridal studio on Prithviraj
  Road, C-Scheme, Jaipur, owned by `demo@saroh.dev` as Noor Siddiqui on the
  diary; Kavya Rathore keeps the desk as a Member; `salon-*.ts` on the shared
  `diary-shop*.ts`): GST-registered in Rajasthan (prefix GS), services 18%
  SAC 999721, prices inclusive. Twenty-seven services from a ₹100 threading
  to a ₹28,000 bridal package — colour, keratin, smoothening, engagement and
  bridal makeup and bridal mehendi take a 50% deposit online, the balance
  billed at the desk — and seven people on the diary with their own weeks,
  one off this week, booked per person so two stylists cut at once. About
  950 bookings over three months and three weeks ahead (no-shows, late
  cancels, a few nobody has marked), packs of 5 blow-dries and 6 facials
  (one nearly out of time), a Blow-dry Club and a Men's Grooming Club the
  desk books (52 members, 50 who left), a counter of 36 products — a cream
  colour in 28 shades and a lacquer in 18, each with a drawn swatch — with
  orders, stock and 34 reviews; the scenes: Aarti's trial done and her
  wedding-day makeup and mehendi booked with deposits, Nidhi's PPD allergy,
  Megha's booking-page note that she is pregnant, Sana's engagement
  cancelled late with the deposit kept. A published site
  (`gulmohar-salon`: home, services & prices, bridal with an enquiry form, team,
  journal, visit us) with 27 posts in Help, News and Articles; 90 days of
  Insights rollups. `checkDiaryShop` stops the run if a designed state is
  missing.
- **Stride Physio** (a physiotherapy clinic on CMH Road, Indiranagar, owned
  by `demo@saroh.dev` as Dr. Ananya Krishnan; Dr. Rohit Menon on the diary;
  Shruti Gowda on the desk as a Member; `physio-*.ts`): not GST-registered,
  so plain receipts (INV-0001…). Assessments, follow-ups, sports and
  post-surgery rehab, home visits with travel buffers, video follow-ups, dry
  needling, and a six-session knee programme sold as one order (some
  stopped after visit 3). Courses of visits weighted so most people stop
  after the third, packs of 6 and 10, a Keep Moving plan (50 members, 48
  who left), about 890 bookings; patients' Needs attention after ACL
  surgery, diabetic, a pacemaker (no IFT), blood thinners, and a pregnant
  patient's booking-page note. A counter of supports by size and side,
  bands by strength and tape by colour. Site `stride-physio` (home,
  conditions, treatments & prices, team, a 28-post journal, contact with
  "Ask a physio"). The drawn images live in `apps/app.saroh.in/public/demo/`
  (`scripts/demo-swatches/`), served from `https://app.saroh.localhost/demo/`.

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
seats an open course still holds), no booking made after a closure was put up
stands inside it, and every class spent from a pack was one
the pack could pay for; it stops with the failing rows if not. Rows it wrote
for Mirror & Co. and the earlier Rye & Co. (`seed_sc_rye_`; today's is
`seed_sc_rc_`), the earlier line-up, are removed. A business renamed since a
database was seeded (`RENAMED_BUSINESSES`: a site at its old address) is
removed and written again under its new name.

No seeded person can be rung or emailed for real. Every phone is
`+91 00000 NNNNN` (a business's own line, E.164 `+9100000NNNNN`): fixtures
carry fixed ones, generated people get theirs from `dummyPhone()` in
`seed/helpers.ts`, the same person keeping one number everywhere. Customer,
contact and booker emails are `@example.com`; staff sign in on `@saroh.dev`.
`showcase/contact-check.ts` stops the run if a seeded row or a site's words
break either rule (turning an older database's numbers into dummies first),
and `seed/contact-details.test.ts` checks the seed's source.

#### Demo accounts

Every account's password is `demo-password-123` on a local database (the
`SEED_PASSWORD` you set anywhere else), and every email is verified.

| Email                | Business and role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo@saroh.dev`     | Northwind OWNER · Leela & Loom OWNER · Rye & Co. OWNER · Kavi Dental OWNER · Aarohan Academy OWNER · Baithak Cowork OWNER · Gulmohar Salon & Bridal OWNER · Stride Physio OWNER · Pulse Fitness OWNER · Prana Yoga ADMIN · CarePoint Clinic MEMBER · Lumen Studio REVIEWER (its site only) — plus the base seed's Monsoon and Whitefield sites, OWNER                                                                                                                                                                                                                                                                                    |
| `admin@saroh.dev`    | Northwind ADMIN · Pulse Fitness ADMIN                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `member@saroh.dev`   | Northwind MEMBER · Prana Yoga MEMBER                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `reviewer@saroh.dev` | Northwind REVIEWER (base seed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Business owners      | `radhika.bhat@` (Prana) · `meera.nair@` (CarePoint) · `aditi.rao@` (Lumen), all `@saroh.dev`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Staff                | Northwind: `suresh.gowda@`, `anita.fernandes@` · Pulse: `kabir.sethi@`, `ritika.nair@`, `imran.shaikh@`, `deepa.hegde@` · Prana: `anand.murthy@`, `leela.krishnan@`, `farah.siddiqui@` · CarePoint: `pooja.shetty@` (ADMIN), `arjun.rao@`, `sara.thomas@` · Lumen: `vikram.iyer@`, `sana.merchant@`, `rohan.pillai@` · Rye & Co.: `nisha.kulkarni@` (MEMBER) · Kavi Dental: `divya.kamath@` (MEMBER) · Aarohan Academy: `vikram.choudhary@` (ADMIN), `kavita.saini@` (MEMBER) · Baithak Cowork: `rhea.deshpande@` (ADMIN), `omkar.pawar@` (MEMBER) · Gulmohar Salon: `kavya.rathore@` (MEMBER) · Stride Physio: `shruti.gowda@` (MEMBER) |

CarePoint is a Member's view on purpose. A Member's role today reads the
business, its team and its sites but not contacts or bookings, so the clinic
shows how little a Member can open rather than its diary; sign in as
`meera.nair@` (OWNER) or `pooja.shetty@` (ADMIN) to see the appointments and
patients.

### Plans: local matches dev

The seed installs a **sample** pricing catalogue (made-up plans, in
`@saroh/pricing-catalog/seed`); Saroh's real plans live only in each
environment's database. To make the local workspace and pricing page show the
plans the dev environment (saroh.io) shows:

1. In admin.saroh.io, open **Plans › Versions** and click **Download
   catalogue (JSON)** on the live version. The file is
   `{ version, goLiveAt, catalog }`, the snapshot as stored.
2. Save it as `.local/catalogue.dev.json` at the repository root. `.local/`
   is git-ignored: the file carries real prices and never goes in the repo.
3. From the repository root:

    ```bash
    pnpm --filter @saroh/api catalogue:import .local/catalogue.dev.json
    ```

It publishes the file as the next local version, live now, policy "keep",
through the publish's own code (`CatalogueWritesService.importSnapshot`), and
prints version numbers and counts only. It refuses any database that is not
on this machine, and a local one other than `saroh-dev` unless
`DATABASE_TARGET_CONFIRM` names it. With no `SAROH_RAZORPAY_*` keys (the usual
case here) a paid plan's provider plan could never sync and the version would
wait behind the sample for ever, so the import marks them synced with a
stand-in `local_…` id and says so; checkout still can't charge. With keys set
it leaves them to the sync job, as a publish does. Run it again after dev
publishes new pricing; a file that is already live changes nothing.

A fresh database gets the sample again on `db:seed`, so import again after
it. Re-seeding a database that already has versions keeps them and puts the
demo businesses on the live version's `pro` plan, so a dev catalogue without
a `pro` plan stops the seed: seed first, then import.

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
