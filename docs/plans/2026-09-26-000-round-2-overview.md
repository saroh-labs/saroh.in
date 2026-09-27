---
title: "Round 2 — the next screens: overview, phases and defaults to confirm"
type: overview
status: active
date: 2026-09-26
deepened: 2026-09-27 (doc review; the user's re-slice, Brand v2 as its own track, verified-email linking, dropped items)
origin: /saroh-designs gap reports (home-calendar-settings, customers, orders-invoices, subscriptions-plans, courses-packs, bookings-site, site-editor, team-storefront) and the .dc.html designs they compare against
decisions: ADR-011, DEC-037 – DEC-048 (with the 2026-09-27 amendments to DEC-039, DEC-044, DEC-046 and DEC-048), amendments to ADR-007 and ADR-008
---

# Round 2 — overview

## What this round is

The designs of 25 and 26 September cover Home, the Business Calendar,
Settings, Customers, Orders, Invoices, Subscriptions and Plans, Class packs,
Bookings and the Service Editor, the booking pages, the Site Editor and the
Customer Site. Each gap report says which parts of each screen are new,
which have changed and which are done. The user settled the reports' big
questions on 2026-09-26 (DEC-037 – DEC-048) and re-sliced the round on
2026-09-27. This page:

- splits the work into eight epics, each with its own plan, and a separate
  Brand track;
- orders the work in three phases, with phase 1 as one finished flow per
  epic;
- says how each release rolls out and rolls back, and which files several
  units share;
- names the dependencies between epics;
- lists every other default the plans took, for the user to confirm, and
  which of them phase 1 rests on.

The designs stay the source of truth for each screen and are referenced by
file name. `DESIGN-NOTES.md` has the reasoning behind them.

## The epics

Counts marked † are **to be reconciled**: plans A, B, C, E and G are being
deepened in parallel and may split units (for example B2). The phase lists
below are the source of truth for which units are in which phase.

| Epic | Plan | Units | What it delivers |
|---|---|---|---|
| A. Customer accounts and messaging on merchant sites | [001](./2026-09-26-001-feat-customer-accounts-plan.md) | 14 † | Sign-in by a one-time code sent by email, one account per business (ADR-011); no phone sign-in this round. An account area with bookings, orders and tracking, plan and packs, messages and Me. Credits and packs online, a class waitlist, and customer messages. |
| B. Orders and fulfilment | [002](./2026-09-26-002-feat-orders-fulfilment-plan.md) | 17 † | Richer list API and rows, filters, quick view, bulk kitchen actions, states, Order Detail changes, six fulfilment types with shipping tracking, a late rule each storefront sets, a pay link for an order, New order v2. |
| C. Customers | [003](./2026-09-26-003-feat-customers-plan.md) | 14 † | The business-wide Customers list and its API, Needs attention, Customer Detail gaps, merge, privacy removal, email and address editing, reviews and packs on the detail. |
| D. Payments | [004](./2026-09-26-004-feat-payments-plan.md) | 20 | The Plans tab, Plan Detail, and the Plan Editor with drafts and the shared editor shell. Plan and subscription event logs, pause with an end date, and classes from the next renewal. Provider autopay (DEC-038), with mandates that end with their subscription. Invoices: bill of supply, PDF, sending, the source filter and locked states. |
| E. Bookings, services, packs and calendar | [005](./2026-09-26-005-feat-bookings-packs-calendar-plan.md) | 28 † | The Service Editor (visits, deposits, "Either", show on the booking page), time off ranges and business closed, new-booking search, and the booking page's gaps. Packs, Pack Detail and Pack Editor with drafts. The Business Calendar's second pass. |
| F. Home and Settings | [006](./2026-09-26-006-feat-home-settings-plan.md) | 19 | The Home redesign, Settings' real differences, Team's hidden column, storefront people joining the team, extra permissions per person within reach, the role editor's reach fix, and the default bundles of the capability model. |
| G. Site editor and customer site | [007](./2026-09-26-007-feat-site-editor-customer-site-plan.md) | 20 † | The #260 split first, then bound blocks, module pages, header and footer text, Undo toasts, the narrow layout and in-place preview. Customer site v2 without the brand: shop and bag, Prices, On today, open or closed, and nav gated by module. (G21, new-site setup, moved to the Brand track.) |
| H. The font-leak fix | [008](./2026-09-26-008-feat-brand-v2-plan.md) | 1 | **H1 only**: merchant sites stop loading Saroh's fonts. |
| | | **133 †** | About 131 was the target: 140, less H2–H10 (9) and G21 (1), plus D19, D20 and F19 (3). Reconcile once the parallel plan edits land. |

**The Brand track** (plan 008, H2–H11, and plan 007's G21) is **not part of
this round**: not in its phases, not in its count (user, 2026-09-27; DEC-046
amended). It has its own schedule. Its first delivery is fonts: H2, H3, H5,
H6 and H11, a pairing picker in today's Style panel, before palettes, the
logo and the Brand panel.

**The font fix changes every live site.** On the day H1 ships, every
merchant site's text moves from Saroh's fonts to a neutral system font stack,
and stays there until the merchant can pick a font pairing, which is the
Brand track's first delivery (H11). Colours do not change. Merchants are told
in the Style panel ("Your site's text now uses a plain system font. Font
choices aren't available yet.") and in the release note; neither promises a
date. The user chose to ship it now (2026-09-27; default 141).

**Permissions are capabilities, not roles** (DEC-039, reworked 2026-09-27).
A capability shows everything within its scope — `order:read` shows the whole
order, money included — and the built-in roles are default bundles. Granting
is bounded by reach: nobody grants what they don't hold, to themselves, or
above themselves (F17, F19). The matrix answers its first version's eleven
questions under this model and keeps four product choices for the user
(Q1–Q4 below).

Also written: [the permission matrix](./2026-09-26-permission-matrix.md)
(DEC-039), and ADR-011.

Unit IDs are per epic (A1…A14, B1…B17, and so on). IDs are never renumbered:
a moved unit keeps its ID, a split takes a new one (D19 came out of D11), and
a new unit takes the next free number (D20, F19, H11). Each plan's units say
Goal, Files, Approach, Dependencies, Phase, Test scenarios and Verification,
and none is bigger than one to two days of agent work.

## Phases

**Phase 1 is one finished flow per epic** (user, 2026-09-27): about 44
units, each set of them something a merchant or their customer can use and
check in a browser at the end of the phase. It rests on decisions and on
the defaults listed under "Confirm before phase 1 starts". **Phase 2** is
everything else in the round, built on phase 1's foundations. **Phase 3**
waits on the user's answers to the permission matrix's open questions (Q1,
Q3, Q4).

**The rule for every phase: no merchant- or customer-visible control ships
before the unit that makes it work.** A field whose behaviour comes later
(a deposit, a visit count, a Buy button) stays hidden until that unit ships,
rather than shipping inert.

**C1 and C2 land first in phase 1.** Needs attention (C1) and a contact for
every paying customer (C2) are the ground A4, B1 and E4 stand on, so they
merge before those units, and no phase-1 unit carries an "until C1 or C2
lands" fallback.

### Phase 1

| Epic | Units | At the end of phase 1 |
|---|---|---|
| H | **H1** font-leak fix (first, alone, small) | No merchant page is set in Saroh's typography, and a check keeps it that way. |
| A | A1 identity tables · A2 email codes · A3 site session and sign-in sheet · A4 account ↔ contact linking · A9 sign in at the last step of booking, and recognition | On a site with accounts on, a customer books by signing in with an emailed code at the last step, and is recognised next time. The account area comes in phase 2. |
| B | B1 list API · B2 fulfilment types API (split as plan B decides) · B3 rows and tabs · B7 states and locked cards · B10 shipping panel | A merchant works the Orders list with its new rows and tabs, sees each order's fulfilment type, and records a courier and tracking number. "Late" uses B17's default thresholds (2 h pick-up, 24 h local delivery, 48 h shipping) until B17 ships. |
| C | C1 Needs attention API · C2 a contact for every paying customer · C3 customers list API · C4 Customers list screen · C5 Needs attention on the detail | A merchant opens one Customers list for the whole business, and sees and edits Needs attention on the list and the detail. |
| D | D1 plan API · D2 plan events · D3 Plans tab · D4 Plan Detail · D8 pause with an end date · D9 subscription events | A merchant browses plans as a tab of Subscriptions, opens Plan Detail with its history, sees who changed a subscription, and pauses one for 2, 4 or 8 weeks. Plans are still created and edited in today's dialog. |
| E | E1 service fields · E2 Service Editor · E3 time off and business closed · E4 new-booking search · E5 peek, locked state and copy · E7 Where and the intake note · E11 UPI/card checkout on the booking page | A merchant edits services in the new editor, marks time off and closed days, and books a customer from search; their customer pays by UPI or card on the booking page. |
| F | F1 Needs-you sources · F3 flat Needs you · F5 Today column · F6 greeting and Last 24 hours · F8 take-money checklist · F15 hide Extra permissions | An owner opens Home to one ranked list of what needs doing, today's bookings and pick-ups with Arrived and No-show, the last 24 hours, and the take-money checklist. |
| G | G1 editor split · G2 top bar and status · G3 Undo toasts · G4 narrow layout · G5 in-place preview · G6 header and footer text · G8 Visit us · G17 site header and footer v2 · G18 On today and open or closed | A merchant edits their site in the new editor frame with Undo, on a phone too, and their site shows the new header and footer, Visit us, On today and whether they're open. |

Count: 1 + 5 + 5 + 5 + 6 + 7 + 6 + 9 = **44**.

### Phase 2

| Epic | Units |
|---|---|
| A | A5 account area shell, Home and Me · A6 account bookings · A7 orders and Track · A8 plan and packs · A10 credits online · A11 buy packs online · A12 class waitlist · A13 message thread · A14 transactional messages |
| B | B4 filters, search and export · B5 quick view and row menu · B6 bulk kitchen actions · B8 Order Detail quick wins · B9 cancel as refund, change fulfilment · B11 pay link for an order · B12 product fulfilment types · B13 New order v2 · B14 Visits card · B15 Needs attention on orders · B16 order capabilities · B17 late after, per storefront |
| C | C6 Reviews tab · C7 packs on the detail · C8 edit email and address · C9 merge API · C10 merge screens · C11 privacy removal · C12 booking-page notes · C13 customer capabilities · C14 copy and phone polish |
| D | D5 drafts API · D6 editor shell · D7 Plan Editor · D10 classes from the next renewal · D11 mandate spike, model, port and fake provider · D19 Razorpay adapter · D20 a mandate ends with its subscription · D12 autopay set-up by the customer · D13 renewals charge the mandate · D14 autopay in the workspace · D15 bill of supply · D16 invoice PDF · D17 send an invoice · D18 invoices source filter and locked states |
| E | E6 header facts and half-hour starts · E8 deposits · E9 visits API · E10 visits on the page and in Bookings · E12 Class packs module · E13 pack API · E14 pack drafts · E15 Packs list and sell dialog · E16–E17 Pack Detail · E18 Pack Editor · E19–E20 calendar API · E21 calendar copy, range and shortcuts · E22 named problems · E23 money cells · E24 days off and team · E25 Week view · E26 booking and pack capabilities · E27 hour grid · E28 keyboard grid and day sheet |
| F | F19 the role editor within reach (first) · F2 more Needs-you sources · F4 inline actions with Undo · F7 This week · F9 Reviewer view · F10 business types · F11 staff landing · F12 Settings Undo and states · F13 turn-off consequences · F14 alerts · F16 storefront people join the team · F17 extra permissions per person |
| G | G7 text-block photo · G9 Plans block · G10 Journal · G11 public catalogue and product page · G12 Product grid · G13 bag and checkout · G14–G16 module pages · G19 module-gated nav · G20 Prices |

Moved from phase 1 to phase 2 by the re-slice (IDs kept): A5, B4, B5, B6,
B11, B17, C6, C7, C8, C14, D5, D6, D7, D10, D18, E14, E21, E28, F9, F12,
F13, F16, G7, G10, G11, G12. A9 moved the other way, from phase 2 into
phase 1, so the sign-in has something to do: book. The drafts API, the editor shell and the Plan
Editor move together with the Pack Editor, so the shell is built once for
both. G11 and G12 move with checkout (G13), so no product page ships without
a way to buy. E21 and E28 move with the rest of the calendar, so it changes
once.

### Phase 3

| Epic | Units | Waits on |
|---|---|---|
| F | F18 default bundles: the Member bundle, `order:stage` → `order:read`, role templates | matrix Q1, Q3 and Q4 |

B16, C13, E26 and F11 were phase 3 until 2026-09-27. The capability model
decides them, so they are phase 2.

### Brand track (outside the round)

H2 brand contract · H3 font and palette catalogues, with the font files ·
H4 contrast rules · H5 fonts per site · H6 renderer · H11 font picker in
today's Style panel (the track's first delivery, with H2–H6) · H7 logo ·
H10 existing sites move across · H8 Brand panel (after G2) · H9 starting
themes · G21 new-site setup.

## Rollout and rollback

The API and the apps deploy separately, migrations apply before the new API
image serves, and a rollback means deploying the previous tag
(`devops-tooling-and-deploy.md`). So during every deploy the previous API
image runs against the new schema for a while, and after a rollback it runs
against it again. The rules for this round:

1. **Every phase-1 migration is additive or expand/contract.** New tables,
   new nullable columns, new enum values that nothing writes yet, and
   backfills that only fill. No column is dropped, renamed or narrowed in the
   release that stops using it; that happens one release later, once no
   image reads it. Each migration passes `db:verify:replay`.
2. **The previous API image keeps working during a deploy.** Nothing the new
   image writes may be unreadable or mis-read by the old one. Where that
   can't hold, the change ships in two releases: the readers first, the
   writers next, and the PR names the **rollback boundary** (the oldest tag
   it is safe to roll back to).
3. **The API ships before the app** for every changed response or DTO. The
   API serves the old shape beside the new one for one release, so the app
   deployed before it, and an app rolled back after it, both keep working.
4. **A release with a step after its migration writes an ordered checklist**
   in `docs/architecture/`, as `PRODUCTS_STOCK_ROLLOUT.md` does, and does not
   go through the automatic push-to-deploy.
5. **Migrations from parallel branches** are rebased onto the latest
   `development` and re-timestamped before merge, so they apply in merge
   order; `db:verify:replay` catches a stray one late, so check it first.

**The risky ones, by name:**

| Change | Unit (phase) | Why it's risky | How it ships |
|---|---|---|---|
| The fulfilment enum (Collect → Pick-up, Delivery → Local delivery, plus Shipping, Digital, Appointment, Out for delivery, Sent) | B2 (1) | An in-place rename, or a new value the old image reads, crashes the old image's Prisma client on that row and breaks rollback. `ALTER TYPE … ADD VALUE` can't be used in the transaction that adds it. | Expand/contract over three releases: add the new values (outside a transaction) with the old ones kept and still written; switch writes and backfill; drop the old values once no image reads them. The boundary is the release before writes switch. An ordered checklist in `docs/architecture/` (rule 4). Plan B owns the detail. |
| A plan's DRAFT status | D5 (2) | `status` is a String, and the old image has no DRAFT refusal, so it would sell a draft plan. | Readers that refuse DRAFT (subscribe, the site's plan reads, "Sell again") ship a release before anything can create a draft. The boundary is that first release. |
| The Orders list shape | B1 (1) | The same route changes shape, and the app and API deploy separately. | The new shape ships beside the old for one release (a new route or an explicit shape parameter, plan B's choice); the app switches after the API is live; the old shape goes a release later. |
| The classes allowance (D10) | D10 (2) | Subscriptions created by the old image during the deploy, or after a rollback, have a null allowance, which reads as unlimited. | For one release, a subscription whose allowance was never set reads the plan's value; the backfill is re-run as a script after deploy; the fallback goes once a query finds no unset rows. |
| Site style v2 | H2 (Brand track) | The v1 parser refuses v2's keys. | H2's read path ships a release before any writer (H11, H8). |

Everything else in phase 1 is additive: new tables (account, sign-in code
and session tables; Needs attention; plan and subscription events), new
nullable columns (`pausedUntil`, courier and tracking fields), and new
routes.

## Shared files, and the order units land on them

Several units rewrite the same files. On each hotspot the units below land
**one at a time, in this order**, not in parallel; the rest of a phase can
run beside them.

| File or area | Phase 1 order | Later |
|---|---|---|
| `apps/api.saroh.in/src/modules/home/home.service.ts` | F1 → F3 → F5 → F6 | F9, F2, F7, F11 in phase 2; D13 touches only F1's `home-money-sources.ts` |
| The booking flow, `packages/site-blocks/src/booking-flow/**` | **H1 first, alone** → E7 (details step, done card) → E11 (pay step, paying and expired cards) → A9 (sign-in at the last step) | E6, E8, E10, A10 in phase 2 |
| The calendar's `month-grid.tsx` and `day-panel.tsx` | — (none in phase 1 after the re-slice) | E21, E28 and the rest of E19–E27 in plan E's order |
| `apps/api.saroh.in/src/modules/customer-workspace/customer-workspace.controller.ts` | C1 → C2 → C3 → A4, then C5 if it adds routes | C6–C14 in phase 2 |
| The site editor after G1 (`components/sites/editor/**`: `use-editor-draft.ts`, the panels and hooks G1 creates) | **G1 alone** → G2 → G3 → G4 → G5 → G6 | G7, G14–G16 in phase 2; H8 on the Brand track |
| `apps/api.saroh.in/src/modules/organizations/organization-policy.ts` and `organization-roles.service.ts` (`withImplied`, `resolveCapabilities`) | — | F19 first in phase 2, then B16 → C13 → E26 → F17; F18 in phase 3 |
| `apps/api.saroh.in/src/modules/subscriptions/subscriptions.service.ts` and its controller | D1 → D2 → D9 → D8 | D5, D10, D13, D20 in phase 2 |
| `communications/communications.service.ts` (the transactional send path) | — | D17 builds it; A14 reuses it |
| The hold-then-send-or-undo helper in the app | G3 builds it (the first to land) | B6 and F4 reuse it, rather than a timer each |

## Seeds

No clinic business is seeded today: a grep of `packages/database/src/seed`
finds only the first name "Kavitha". Several units verify against "Kavi
Dental" (B2, E12, F1, F2, D15, H9). **A Kavi Dental showcase business is
added by plan E's first unit that needs it (proposed: a step of E1),** with
services, staff and a published booking site, then extended by E9 (visits)
and D15 (0% `gstRate` treatment invoices). Until it exists, those units
verify on Northwind. Kavi, like Rye and Pulse, is a film set: browser checks
on it are read-only.

## Dependencies between epics

- **Customer identity** (A1–A4) comes before:
  - the rest of A;
  - D12's account entry point (a customer sets up autopay);
  - G13 (checkout signs in at the last step) and G20 (join and buy on Prices);
  - C9 and C11 (a merge or a removal moves or retires an account).
- **Needs attention** (C1) comes before C5, C12, B13 (allergy clash), B15, E4,
  F2 and A5 (a customer's own health note). C1 and C2 land first in phase 1.
- **The capability model** (DEC-039): F19 closes the role editor's reach
  hole first; B16, C13 and E26 add the split capabilities; F17 adds extra
  permissions per person; F18 changes the built-in bundles and comes after
  all of them. Until F18, the shipped Member stands (the kitchen view without
  money, DEC-024). The sensitive gate falls back to Owner and Admin (via
  `contact:write`) until C13 swaps in `customer:sensitive` (matrix Q2); C13
  is phase 2, so that stand-in is a real phase-1 state, not a fallback for
  same-phase work.
- **The draft helper and editor shell** (D5, D6) come before D7, E14 and E18,
  and later the course editor. All are phase 2.
- **Fulfilment types** (B2) come before B10, B12, B13, B17, A7 (Track) and G13.
- **Visits** (E9) come before B14 and A6.
- **The pay link for an order** (B11) comes before B13. E4 does not need it:
  it issues the booking's own invoice pay link (ADR-007).
- **Messages** (A13, A14) come before F2, F4's Reply, D17's thread channel and
  B9 ("tell the customer"). D17 ships with the email channel alone; its
  thread channel, and Home's matching confirm copy, turn on only once A13
  exists. D17 owns the transactional send path; A14 reuses it.
- **Mandates** (D11, then D19) come before D12, D13, D20 and F4's mandate
  Retry. A8 does not depend on them: it needs A5 and D8, and shows no autopay
  until D12.
- **A mandate ends with its subscription** (D20): C9 (merge) and C11 (privacy
  removal) call its `cancelFor`, whichever of them lands after D20; if D20
  lands after them, it adds the calls.
- **Pause with an end date** (D8) comes before A8.
- **Published-only reads** (D5, E14) come before G9, A11 and G20.
- **Class packs module** (E12) comes before A11, G20 and F13's packs row.
- **The editor split** (G1) comes before G2–G6 and G16 (and H8, on the Brand
  track).
- **The public catalogue** (G11) comes before G12 and G13. It needs G8's
  "sells from" storefront first.
- **Failed renewals on Home** have one source, F1's. D13 feeds it
  (RENEWAL_FAILED, MANDATE_LIMIT_LOW, a pending charge) and adds no row of
  its own.
- **Within and across epics, found while planning:**
  - E9 needs B2 (the Appointment type);
  - E4's Needs attention part follows C1;
  - E22's Retry and Send a reminder stay hidden until D13 and D17 ship;
  - E14 needs D5 (both phase 2);
  - D8 waits on D9, so an automatic resume is logged;
  - D12's account and join-sheet entry points need A3/A5 and G20, and its pay-link entry needs only D11 and D19;
  - F4's Retry, Send reminder and Reply need D13, D17 and A13, while Mark sent and Retry by pay link ship first;
  - B13 uses C2's contact helper;
  - B14 needs E9;
  - G14 needs G8, G10 and G12.
- **The Brand track's own order:** H2 and H3 come before H11, G21 and H8; H8
  needs G2.

## Later (not planned this round)

- **The Brand track** — H2–H11 and G21 (above). Its own schedule.
- **Phone sign-in and SMS** — phone codes, a verified phone on the account,
  and SMS or WhatsApp messages to it. Out of this round (user, 2026-09-27);
  it comes back as its own decision, including who sends and pays for SMS
  (ADR-011 §6). The former A15.
- **Courses** — the Courses, Course Detail and Course Editor screens
  (DEC-044), with everything the courses-packs gap report lists for them:
  - deposits, per-session charging, the late-join cut-off, the waitlist,
    make-ups and attendance;
  - course staff and place, and a Room model;
  - skipped weeks, the held-session lock and the date-change review;
  - the Courses layer on the calendar and the Courses tab on Customer Detail.

  Built courses keep working.
- **Hindi** — a `locales` list in the section contract, with Hindi on the
  site, in the editor and in the customer site's strings (plan 008, "Later").
- **Saroh's own billing** in Settings › Plan & billing: Saroh invoices,
  usage and a plan picker. It gets its own plan (DEC-014).
- **Cashfree mandates** — after Razorpay's (D11, D19).
- **The Monday summary** — its alert setting and its sender come together.
- **Courier booking** ("Book pickup") — DEC-045 records the courier only.
- **Draft orders** — not designed.
- **The #247 action rail** on Customer Detail.
- **Payouts and expenses** — a separate Money area (DESIGN-NOTES,
  Calendar second pass).
- **Removing "Runs on Saroh"** from a site, and corner and button styles.
- **Rooms or resources** for bookings.
- **Subscriptions that take stock** (DESIGN-NOTES, parked).

## Confirm before phase 1 starts

Phase 1 rests on these defaults from the list below. Changing one after its
unit is built means redoing finished work, so they are the ones to confirm
first; the plans name the unit each one shapes.

- **A (A1–A4, A9):** 2, 3, 4, 5, 6, 71, 72, 73, 74, 79. (Default 1 and the
  linking rule, 7, are decided.)
- **B (B1, B2, B3, B7, B10):** 14, 18, 80, 81, 82, 87. (Default 16 is
  decided.)
- **C (C1–C5):** 20, 21, 96, 98.
- **D (D1–D4, D8, D9):** 29 (the API keeps all four intervals), 30, 33, 99,
  100, 101.
- **E (E1–E5, E7, E11):** 42, 43, 107, 108, 109, 110.
- **F (F1, F3, F5, F6, F8, F15):** 53, 121, 123, 130.
- **G (G1–G6, G8, G17, G18):** 62, 63, 67, 131, 136, 138, 139.
- **H (H1):** 141 is decided.

## Defaults taken — confirm

One line each. Each one is repeated where it applies, in the plan that uses
it. Items marked **Dropped** or **Decided** are kept, with their numbers,
so references stay valid.

**Customer accounts (A)**

1. A site offers email sign-in only; there is no phone field. (Decided 2026-09-27: phone codes and SMS are out of this round.)
2. Browsing is open, and a code is asked for at the last step of booking or buying. The invoice pay link needs no sign-in.
3. Once accounts are on for a site, guest booking and guest checkout end there. Plan A's code limits must not let anyone block a business's bookings by exhausting a shared ceiling, or lock a known customer out (security review; plan A, A2).
4. The code email's sender name is "‹Business› via Saroh", from Saroh's identity sender. The business name in it is cleaned (no links or control characters, at most 40 characters), and site codes go out on a stream separate from workspace sign-in mail (plan A, A2).
5. Codes are 6 digits, live 10 minutes and allow 5 tries; resends wait 30 seconds, with at most 5 an hour and 10 a day per email address.
6. Sessions last 30 days, renewed on use, and never more than 90.
7. **Decided (user, 2026-09-27):** a first sign-in links the account to the contact with that email **only when that contact's email is verified** — proven before by an earlier sign-in code, or by an online order or booking confirmed by email to that address. Otherwise the customer gets a **separate** contact, and the pair is surfaced for staff to merge. Contact.email stays unique per business: the verified email lives on the `CustomerAccount`, and the separate contact is made without taking it until the merge (plan A says exactly how its email field is filled).
8. From their account a customer can pause, resume or cancel at period end, and pay a failed invoice. Plan changes stay with the business.
9. A class waitlist offers a freed place to the first person in line and holds it for 2 hours (or until 1 hour before the class, whichever is sooner), then offers it to the next.
10. Messages about a customer's own orders, bookings and invoices need no marketing consent; marketing still does.
11. **Dropped (user, 2026-09-27):** there is no "Remove my details" in the customer's Me. A privacy request reaches staff by message or in person, and staff use privacy removal (C11).
12. A health note a customer adds arrives as a suggestion for staff to confirm, like a booking-page note.

**Orders (B)**

13. The refund sheet keeps "Or another amount". It is capped at what is refundable, needs a reason, is not tied to lines and returns no stock.
14. Tabs are All · Open · Refunded; cancelled orders stay under All.
15. A product lists the fulfilment types it allows (by default, every type its storefront offers), and an order offers only types every item allows.
16. **Decided (user, 2026-09-27; DEC-045):** when an order counts as late is a per-storefront setting, measured from when it was placed — "Mark pick-up orders late after [N] hours" — in hours, with minutes allowed for counter businesses. One setting per fulfilment type the storefront offers:
    - Pick-up: 2 hours by default. A café-like storefront may set 20 minutes (today's counter wait).
    - Local delivery: 24 hours by default.
    - Shipping: 48 hours by default.
    - Digital: never late, with no setting.
    - Appointments: judged by their visits, with no setting.

    Every storefront, existing ones included, starts on the defaults (plan B, B17). Until B17 ships in phase 2, the API applies these defaults to every storefront.
17. Changing how an order is fulfilled charges or refunds the difference in delivery on the order (a supplementary invoice or a credit note).
18. The existing Collect becomes Pick-up and Delivery becomes Local delivery; the `trackingUrl` stays as the optional link.
19. New order's walk-in customer needs no contact; one is made only if a phone or email is typed.

**Customers (C)**

20. Spent = paid orders (delivery included) + paid invoices that aren't order invoices (subscriptions, packs, hand-written), net of refunds and credit notes. "Customer since" = the first payment.
21. Add customer and Import stay on the Customers list; both make contacts.
22. When two contacts are merged, the merchant picks the survivor (the older one is offered).
23. A merge is refused while both people hold a live subscription to the same plan; one is cancelled first.
24. On a merge, consent per channel takes the more recent answer, notes are kept side by side, and Needs attention entries are combined with duplicates collapsed.
25. Privacy removal is refused while an order is open or a subscription is live.
26. On removal, future bookings are cancelled, and past bookings keep time and service with the name "Removed customer".
27. The Courses tab and card on Customer Detail wait for Courses (DEC-044).
28. Customer Detail tabs scroll sideways on phones instead of wrapping.

**Payments (D)**

29. Plans keep week, month, quarter and year in the API. The editor offers month and year, with week and quarter under "More". The currency is the business's, with no picker.
30. Pause offers 2, 4 or 8 weeks, which resume on their own, or "Until I resume".
31. The Plan Editor's classes section shows only when Appointments is on.
32. A change to a plan's classes applies from each member's next renewal.
33. "Subscribe someone" and search stay on the Subscriptions list, and `/billing/plans` redirects to the Plans tab.
34. Mandates start with Razorpay (UPI Autopay and cards), and Cashfree follows.
35. "Retry" on a failed renewal retries the mandate when there is one and the invoice is within its limit, and sends a pay link otherwise.
36. A GST-registered business's invoice whose lines all have a frozen `gstRate` of 0 (exempt or nil-rated) is titled "Bill of supply", in the same number series. A null rate is "not set", not exempt. An unregistered business keeps "Receipt".
37. Invoice PDFs are rendered by the API on request, from the same data as the printed paper, and are not stored. Only Invoice Detail offers one.
38. Sending an invoice or a reminder goes through the business's connected email provider, and, once A13 exists, into the account thread when the person has a site account (the thread alone when there is no provider). With neither, the only option is "Copy pay link"; Saroh's email is never used. Home and Invoice Detail read the same flag.

**Bookings, packs and calendar (E)**

39. Deposits are None, 25%, 50% or Full. A free cancellation refunds the deposit automatically through the provider; a late one keeps it.
40. A multi-visit treatment is one order (Appointment type) with one booking per visit, invoiced once for the whole treatment when paid.
41. Booking-page slots start on the hour and the half hour for every business.
42. The Service Editor keeps Delete, the time zone, the buffer and the per-service availability rules under "More settings" (00-universal §15); the currency is the business's.
43. The services on the booking page follow each service's "Show on booking page" switch automatically.
44. Class packs become their own module (it needs Appointments), turned on for businesses that have packs; "Also sell" and Settings › Modules flip the same switch.
45. A pack has a kind, Classes or One-to-one sessions. A one-to-one pack pays for one-to-one services, which amends ADR-008's "packs cover classes only". The kind is locked once a pack is sold.
46. An extension adds at most 30 days at a time and is logged; validity is at least 7 days.
47. Calendar fees are the fee each provider reports on a payment, never an estimate. Out = refunds + reported fees.
48. The clinic's Payments layer reads paid invoices.
49. The calendar has no Courses layer this round.
50. A pay-at-session booking's Due is the service price less any deposit paid.

**Home and Settings (F)**

51. On Home, Undo is offered only before a message leaves (a 10-second hold), never after.
52. "Payout on the way" is dropped; there is no data source for it.
53. CRM follow-ups stay on Home.
54. A module that's off shows one shared state: "‹Module› is off · Owners can turn it on in Settings".
55. There is no financial-year picker (DEC-028).
56. Turn-off consequences are real counts from the API.
57. Settings keeps its Activity and Hours tabs.
58. Custom roles are shown, not marked "Coming soon", because they are built.
59. Country stays in the Registered address card (DEC-029), not in Identity as the design moves it.
60. The business types are the design's six, plus Not set: Individual / sole proprietor, Partnership, LLP, Private limited, Public limited, Trust or society. Today's "company" becomes Private limited.
61. Where staff work is read from the staff member's team membership and their storefront roles (DEC-048). No new table.

**Site editor and customer site (G), and the Brand track**

62. The Site Editor keeps Tablet and Zoom (00-universal §15; #347 put them back).
63. A reviewer works on `/review` (#275), not in the editor, and Members don't reply to review notes.
64. Placeholders are marked per field on the server, not detected by pattern.
65. *(Brand track)* An existing site keeps its colours exactly until its merchant saves a brand; nothing is rewritten, and the old contract version keeps validating. When Brand first opens, it offers the nearest palette (or the site's own accent as a custom colour when no palette is close), keeps the site's band rows, and offers the font pairing closest to the site's old type.
66. *(Brand track)* A merchant picks one of several ready-made palettes (eight to start: working names Terracotta, Sunflower, Rose, Plum, Ocean, Forest, Stone and Night) or a custom colour. Any hex is allowed as the custom colour, with contrast worked out automatically (button text and link shade reach 4.5:1); a catalogue palette must pass without adjustment.
67. "Runs on Saroh" stays on every site this round.
68. *(Brand track)* A site uses the business's logo unless a site logo is set, and the letter is the fallback.
69. *(Brand track)* Fonts come from a catalogue of pairings, each a heading face and a body face with Devanagari coverage. Six to start: Plain (Geist, Geist), Lively (Bricolage Grotesque, Geist), Geometric (Space Grotesk, Geist), Serif (Instrument Serif, Literata), Book (Literata, Literata) and Friendly (Poppins, Hind). Under Advanced, the heading or body face can be swapped. Faces are self-hosted by `saroh.app`; nothing is loaded from a third party at view time.
70. Hindi, when it comes, is a general `locales` list with Hindi the only one offered.

**Taken while writing the plans** (each plan names them where they apply)

*Customer accounts (A)*

71. Customer accounts are switched on one site at a time. Sites without them keep anonymous booking until every site is switched.
72. Codes and destinations are stored as keyed hashes under a new server secret. Session tokens are stored as SHA-256.
73. Code limits per destination and per business are counted from stored rows, so they survive a restart. The per-address limit uses the existing in-process limiter.
74. Expired or used codes, sessions and waitlist rows are deleted after 30 days by a cleanup job.
75. From Me, a customer can change their name, email and phone. A new email is checked with a code; the phone is a contact detail, not a way to sign in.
76. No waitlist offer is made within 1 hour of a class starting.
77. Customer messages have their own thread tables. Anything sent outside the account is recorded in the existing `Message` and `Delivery` records.
78. A contact without a site account gets no in-account messages. Staff copy says "They'll see it when they sign in on your site".
79. A contact made at first sign-in has the source `SITE_ACCOUNT`.

*Orders (B)*

80. Collect becomes PICKUP and Delivery becomes LOCAL_DELIVERY in the enum, by expand/contract (see "Rollout and rollback"). The stages gain Out for delivery and Sent.
81. Handover is Collected, Out for delivery, Handed to courier, Sent, or the first attended visit. After it, an order can't be edited, re-fulfilled or cancelled, but it can still be refunded.
82. The courier name and tracking number are optional, can be added after handover, and can be filled in by anyone with `order:stage`.
83. The refund reasons offered are: Customer changed mind, Item unavailable, Quality, Late, Other. Free text can be added to any of them.
84. A cancel refunded online reads Cancelled only once the refund settles (DEC-026).
85. An order's pay link is `saroh.app/pay/o/<token>`, charged through the order's storefront's provider. It is stored only as a hash and shown once; "New pay link" replaces it (never "Copy"). It is cleared when the order is paid, cancelled or refunded.
86. A bulk kitchen move takes at most 100 orders, each naming the stage it expects to move from.
87. The Orders list pages by cursor, 50 at a time. Tab counts apply every filter except the tab itself.
88. New order is hidden for a business whose products are all appointments.

*Customers (C)*

89. On a merge, the merchant picks the survivor's name, email, phone, company and address. Values not chosen survive only where orders or invoices printed them.
90. A merge is also refused while both people hold an active enrolment in the same course.
91. A merge can't be undone, and its dialog says so.
92. A dismissed duplicate pair stays dismissed.
93. A removed contact's email becomes a unique placeholder that can't be delivered to, and every reader treats it as no email.
94. **Dropped (user, 2026-09-27):** privacy removal does not reach into leads or form entries; it removes the customer's details as DEC-042 lists.
95. A booking-page note counts as sensitive until staff confirm it.
96. Customers search matches name, phone and email for anyone who can open the list (`contact:read`); there is no separate contact gate (DEC-039).
97. A contact's address is six new optional fields, following DEC-029's state and PIN rules.
98. The old allergen note rows are written for one more release, then dropped in a two-deploy change.

*Payments (D)*

99. The plan and subscription event logs start at deploy. Older records say "Earlier changes weren't recorded".
100. An automatic resume that comes due while Payments is off leaves the subscription paused, and Home raises it.
101. Plan names are unique per business, ignoring case, among Active and Draft plans.
102. Mandates pay subscription renewals only this round; a mandate always belongs to one subscription.
103. When an invoice is above the mandate's limit, the renewal doesn't charge it: it falls back to the pay link, and the merchant sends the customer an autopay set-up link to authorise again.
104. An invoice reminder goes at most once a day.
105. Sending an invoice makes a new pay link, and the old one stops working.
106. **Dropped (user, 2026-09-27):** the pay page has no PDF download, and there is no "Share on WhatsApp".

*Bookings, packs and calendar (E)*

107. A business closure is its own table (`BusinessClosure`).
108. A closure or time off warns about the bookings it covers and cancels nothing.
109. A service offered either way records the customer's choice on the booking. The meeting link shows only on online bookings.
110. The booking page's intake note is at most 1,000 characters. It is stored as sensitive and kept out of logs.
111. Visits are booked in order, and never more than the service's count.
112. A cancelled visit refunds nothing by itself; money comes back through the order's refund.
113. The booking page's header shows the registered address, the opening hours and the business's public phone.
114. A pack sale records how it was paid: Cash, UPI, Card, Bank, Online or None.
115. An expired pack can still be extended.
116. A payment's fee is stored as the provider reports it in its webhook.
117. The calendar reads by from and to dates, and the month query stays as an alias for one release.
118. The calendar's CSV is built in the app from the same items as the screen.
119. The calendar goes back to the business's creation date until a joined date exists.
120. Class packs need their own rollout flag in each environment.

*Home and Settings (F)*

121. Home's Needs you shows at most 12 rows, then "See all N".
122. An inline action that sends no message runs at once, and its Undo uses the record's own undo window.
123. Home's take-money checklist and Settings' "Ready to take payments" read the same list of steps. Hiding the checklist is remembered per person in the browser.
124. For one release, an old app sending the type `company` is saved as Private limited.
125. Settings offers no Undo where the old values can't be put back: a GST registration that has already numbered an invoice, or a replaced logo.
126. Alerts start with the bell on for everything, email on for failed payments only, and WhatsApp off. A channel with no provider shows as off.
127. **Changed 2026-09-27:** the Monday summary alert is left out until its sender is built; no unit this round builds it.
128. Adding someone to a storefront never lowers a business role they already hold.
129. On the staff landing, someone with no storefront role sees every storefront.
130. For one release, Home's API sends its old fields beside the new ones.

*Site editor and customer site (G)*

131. A site sells from one storefront, stored on the site. It defaults to the first open storefront with listings, and a picker shows only when there are several.
132. Module pages are ordinary pages with a kind (Shop, Book, Prices, Journal, Contact), at most one of each per site, at /shop, /book, /prices, /journal and /contact. Existing sites get none until the merchant adds them.
133. A module page whose module is off leaves the menu, and its address shows "This isn't available right now".
134. The bag lives in the browser and holds only ids and quantities. The order is made when payment succeeds.
135. The shop takes online payment only this round; with no provider it says it isn't taking online orders yet.
136. An Undo toast lasts 10 seconds. Discard all, restore a version and "Start this site again" still ask first.
137. The text-block photo is an optional field on the current contract version, with alt text required.
138. "On today" shows only for businesses with Appointments.
139. Without `site:update`, the inspector shows the site name and footer text as read-only.
140. Until autopay ships, Join on Prices issues the first invoice with its pay link. With Payments off it offers "Ask about joining".

*Brand (H1 in round 2; the rest is the Brand track)*

141. After the font fix, every merchant site uses a neutral system font stack until its merchant picks a font pairing (the Brand track's first delivery, H11), and Saroh's own pages in `saroh.app` use it too. **This changes how every existing site looks on the day it ships** (user: ship it now, 2026-09-27). The Style panel and the release note say so, without a date.
142. *(Brand track)* A pairing may use Geist, Bricolage Grotesque or Space Grotesk as the merchant's own font. These are served from a separate copy for sites, never from Saroh's font files.
143. *(Brand track)* Brand v2 is version 2 of the existing site style, with no database migration: a v1 style is read as v1 until its merchant saves.
144. *(Brand track)* The old colour rows and spacing sliders stay under "Advanced".
145. *(Brand track)* A site in dark mode is dark for every visitor, whatever their system setting.
146. *(Brand track)* The logo is fixed when the site is published; a later change shows as an unpublished brand change.
147. *(Brand track)* The suggested starting theme follows the modules: clinic-like appointments suggest Calm clinic, classes or packs Bright studio, and selling only Warm bakery. Each theme is a palette and a pairing from the catalogues.
148. *(Brand track)* The brand needs `site:update` and a logo upload `media:write`, so plan H waits on no permission review.
149. *(Brand track)* A catalogue entry is never deleted. A retired palette or pairing leaves the pickers and keeps rendering for the sites that use it.
150. *(Brand track)* The catalogues are data files in `packages/site-blocks`, read by the API, the editor and the renderer; a new entry ships with a release, not from the admin console.

**Taken while deepening the plans (2026-09-27)**

151. The pay link offers "Pay and turn on autopay" (D12), though no design draws it: it is the one autopay entry that needs no A or G unit, so autopay can ship before accounts and Prices.
152. Autopay actions (send a set-up link, cancel autopay, retry) need `subscription:write`, the key that already cancels the subscription; `payment:manage` keeps connecting providers and refunding invoices.
153. Someone added to the team through a storefront, or by the backfill, joins in a narrow "Storefront team" role (no customers, bookings, orders or money), never as Member; the owner is told in Activity and a one-time Team notice (DEC-048 amended).
154. Nobody grants a capability they don't hold, changes their own extra permissions, or edits a role or a person that can do more than they can (F17, F19).
155. *(Brand track)* A shipped catalogue entry is never edited: a re-tuned look ships as a new key and the old one is retired, so no live site changes look on its own. A version restore or the template's theme may still name a retired key.

## Still for the user to decide

- **Four permission choices** (DEC-039, matrix §9). The capability model
  answers the matrix's eleven questions; these product choices remain:
  - **Q1.** The Member default bundle (proposed: today's reads plus whole
    orders, New order, booking changes, and selling packs).
  - **Q2.** Whether sensitive notes are their own capability,
    `customer:sensitive` (proposed: yes).
  - **Q3.** Which role templates ship (proposed: Counter, Front desk,
    Practitioner, Packer).
  - **Q4.** Whether the rest of a new Member bundle reaches existing
    businesses (proposed: yes). Under either answer, every role that moves
    orders starts seeing order money when F18 ships; F18 lists those roles
    to owners first.
- **When the Brand track runs.** Until its first delivery (fonts), merchant
  sites stay on the neutral font.
- **Whether F19** (the role editor's reach fix) ships ahead of phase 2 as a
  standalone security fix. It depends on nothing.
- **Saroh's own billing** (Settings › Plan & billing): when, and in which
  plan.
- **The defaults under "Confirm before phase 1 starts"**, before phase 1
  begins.
