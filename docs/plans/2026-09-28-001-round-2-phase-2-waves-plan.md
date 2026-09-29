---
title: "Round 2, phase 2: build waves"
type: feat
status: active
date: 2026-09-28
deepened: 2026-09-28
origin: docs/plans/2026-09-26-000-round-2-overview.md
---

# Round 2, phase 2: build waves

## Overview

Phase 1 (48 units) is in production; B2c and B10 are in #693. This plan
orders phase 2's 88 units, plus 6 new units for the 2026-09-28 decisions
(DEC-053–059), into 9 waves. Each wave runs as parallel worktree agents, one
unit each (`~/Desktop/mohit/saroh-designs/R2-UNIT-BRIEF.md`). They merge into
`feat/round-2-phase-2` in dependency order, then into `development`. The unit
scopes are in plans 001–007. This plan decides only order, the new units and
the release boundaries.

## Requirements

- R1. Every unit's dependencies (plans 001–007, the overview's "Dependencies
  between epics") land before it merges.
- R2. The overview's shared-file chains land one at a time (one slot per wave).
- R3. The rollout rules hold: the API ships before the app for every changed
  DTO; expand/contract; release boundaries (below).
- R4. The 2026-09-28 decisions ship (DEC-053–056).
- R5. The phase-1 follow-ups listed against a unit are absorbed by it.

## Shared-file chains (one slot per wave)

| Chain | Order |
|---|---|
| Policy (`organization-policy.ts`, `organization-roles.service.ts`, `capability-catalogue.ts`) | F19 → C9 → C11 → B16 → C13 → E26 → F17 |
| Customer workspace | C9 → C12 → C8 → C10 → C11 → C15 → C13 → C6 → C7 → C14 |
| Booking flow (`packages/site-blocks/src/booking-flow/**`) | E8 → E6 → D23 → A10 → E10 |
| `home.service` | F9 → F7 → F2 → F4 → F11 |
| Calendar grid | E21 → E28 → E22 → E23 → E24 → E25 → E27 |
| Section contract | G7 → G10 → G9 → G12 → G14 → G20 → G16 |
| Order module (and `payments.service.ts` where they touch it) | B12 → B2d → E9 → B9 → B13 → B6 |
| `subscriptions.service` | D21 → D10 → D5 → D20 → D13 |
| Communications | D17 → A14 |

Changes from the overview's order, each checked against plans B, E and F:
- **B12 runs ahead of B2d.** B12 stores only new values, so B2d's migration
  always casts `Product.fulfilmentTypes` (B12 has shipped by then).
- **F7 runs ahead of F2.** F7 depends only on F6.
- **E8 runs ahead of E6** in the booking flow. Neither depends on the other.
- **D10 runs before D5, and D20 before D13.** D13 depends on D20; D10 only on D9.
- **B6 runs last** in the order module. It depends only on B1 and B2c.
- **E9 is an order-module slot.** It shares `orders/serialize.ts`,
  `order-read.ts`, `order-refunds.ts` and `payments.service.ts` with B2d, B8,
  B9 and B11.

**Sub-waves.** A wave's "a" units run in parallel from its start. A "b" unit
starts once the named "a" units have merged, because it shares files with
them. `schema.prisma` and `job-handler.registry.ts` edits are additive in
every wave; each migration is re-timestamped at merge (overview rollout
rule 5).

## Implementation Units (by wave)

A **CP** (checkpoint) is a release of `development` to production, made
before the next wave merges. The Release boundaries section says why each
one exists.

### Wave 1
- **1a:** F19 #662 (security fix, heads Policy) · F20 (new, DEC-053) · D22
  (new, DEC-054) · D21 (new, DRAFT readers) · E8 #621 (deposits; the
  anonymous booking route answers 410) · G11 #674 (hidden until G13) · B12
  #571 · E12 #625 · G7 #670 (also passes `siteId` to `PageSections`) · E21
  #634 · F9 #652
- **1b:** C9 #586, after F19, E8 and D21. It shares the policy files,
  booking services and the subscriptions writes with them. It owns
  `resolveContact`, finishes A2's `linkOrCreate` and moves C3's `notRetired`.
- **CP-1:** #693 (B2c, B10) and wave 1.

### B2d, alone
- B2d #561, merged by itself after CP-1, then released through
  `ORDER_FULFILMENT_ROLLOUT.md` release 3 (**CP-B2d**). It also removes the
  Orders list's old shape. Wave 2 builds in parallel but merges after CP-B2d.

### Wave 2
- **2a:** B11 #570 · B4 #563 · B8 #567 (also takes DEC-056's Reviewer locked
  card and B10's free-text "Other" courier) · C12 #589 · E6 #619 (shows F20's
  phone, and calls through the signed relay header) · D6 #598 · D17 #610 ·
  E28 #641 · D10 #602 (the allowance fallback, and the fix for "Paused
  until" a day that has passed)
- **2b:** E19 #632, after B11 (`webhooks.service.ts`).
- **2b:** E30 (new, DEC-058), after B11 (`payments.service.ts`). D23 (new, DEC-059), after E6 (booking flow).
- **CP-2:** a manual release. D10's allowance backfill is re-run after the
  deploy (overview rule 4). The checklist lives in D10's PR and in
  `docs/architecture/`.

### Wave 3
- **3a:** E9 #622 (order-module slot) · B5 #564 · C8 #585 · A10 #551 · A5 #546
  (behind an environment flag, off until the end of wave 4) · D5 #597 (the
  draft writers; D21 has been live since CP-1) · G10 #673 · E20 #633 · G13
  #676 (must not add `placedOnline` again) · D11 #603 (blocked on
  credentials) · F7 #650 · F16 #659
- **CP-3:** keeps D5's draft writers and D7 in different releases.

### Wave 4
- **4a:** B15 #574 · C10 #587 · E10 #623 (also fixes the
  `/contacts/:id` link on booking detail) · A7 #548 · A8 #549 (weeks only) ·
  E14 #627 · D7 #599 · D19 #604 · G9 #672 (needs D5, which is live)
- **4b:** A6 #547, after E10 (`bookings.service.ts`) · A13 #554, after C10
  (`customer-workspace/actions.ts`) · B9 #568, after A13 (its "tell the
  customer" notice uses Messages).
- The account area's flag (A5–A8, A13) switches on at the release after
  wave 4. It is the environment variable `SITE_ACCOUNT_AREA=on`, set in
  the api first and then in saroh.app (`docs/architecture/ENVIRONMENT.md`);
  unset or `off`, every `public/site-accounts/me` route is a 404 and no
  site shows Sign in or `/account`.

### Wave 5
- **5a:** B13 #572 · A14 #555 · D20 #612 (adds the `cancelFor` call to C9's
  merge path, which merged before it) · E22 #635 · G12 #675 · E13 #626 ·
  A11 #552 · F10 #653 (readers first; see boundary 9) · D15 #608
- **5b:** C11 #588, after D20, wiring `cancelFor` · B14 #573, after A14
  (`order-kitchen.service.ts`).
- **CP-5:** D20 is in production before D13's charging merges.

### Wave 6
- **6a:** B6 #565 (A14 has merged) · B16 #575 · C15 (new, DEC-055) · D13
  #606 · E23 #636 · G14 #677 · F2 #645 · E15 #628 · E18 #631 · F13 #656 ·
  A12 #553
- **6b:** D16 #609, after D13 (`invoices.controller.ts`).

### Wave 7
- **7a:** C13 #590 ("Returning" counts only what the viewer can read,
  DEC-056) · E24 #637 · G15 #678 · F4 #647 · D12 #605 (no Join entry point;
  G20 adds it) · E17 #630 · E16 #629 · D18 #611 · F12 #655 (brings back the
  Settings checklist nudges, DEC-056)
- **CP-7:** G15's renderer is in production before G16 lets merchants create
  module pages.

### Wave 8
- E26 #639 · C6 #583 · E25 #638 · G20 #683 (wires D12's Join entry point) ·
  F11 #654 · D14 #607 · F14 #657

### Wave 9
- **9a:** F17 #660 · C7 #584 · E27 #640 · G19 #682 · G16 #679
- **9b:** C14 #591, after C7 (the detail screen). It also makes "Add
  customer" create a contact only (DEC-056), and makes Spent net of partial
  refunds.

## New units

| ID | Scope | Wave |
|---|---|---|
| F20 | An optional public phone on the business profile (additive), checked as E.164 (`+91…`) and shown on the site once set. A field in Settings → Business, with a `settings-audit` entry. `businessPublicPhone(site)` in `site-host.ts` is filled in, and saving it refreshes the site's cached pages so a removed number stops showing. It unblocks G8's Call button, E6's header and A2/A9's "call ‹Business›" copy. | 1a |
| D22 | Settings › Providers asks for the Razorpay public key id, and the API returns it for E11's checkout. **An idempotent script fills `PaymentProvider.publicKey` from the sealed `keyId` for existing Razorpay connections, and it runs before the "needs attention" state goes live**, so no merchant loses online pay. | 1a |
| D21 | The readers that refuse DRAFT (subscribe, the site's plan reads, "Sell again"). They are live from CP-1, before any draft writer. | 1a |
| E30 | The business's policy for cancellations made in time (DEC-058): a booking setting ("refund what they paid online automatically", or not; the default is refund), read by E8's cancel path instead of always refunding. A refund never goes beyond what was received. The cancel dialog and booking page state the policy. | 2b |
| D23 | Payment methods are the account's (DEC-059): remove Razorpay's UPI-and-card-only display block in `booking-flow/checkout.ts`, and replace "UPI or card" copy across the booking flow with neutral copy (or the methods the provider reports). | 2b |
| C15 | A per-storefront setting for same-email customers: link automatically, or leave for staff (the default; existing stores keep it). The incoming customer's storefront's setting applies. **It links only to a contact that was itself made from a store customer (DEC-055)**, never to a staff-entered contact or lead. Links go through C9's `resolveContact`. **Automatic linking never widens what a site account can see unless the contact's email is verified (DEC-049); otherwise it only suggests the pair.** Turning it on doesn't re-link existing pairs. | 6a |

## Release boundaries

1. **CP-1** takes B2c to production, one release before B2d. **CP-B2d**
   releases B2d alone, through the manual release-3 checklist.
2. **D21 is live (CP-1) before D5, D7, E14, E13 or E18 merge.** D5's writers
   and D7 are in different releases (CP-3). D7 moves the app off D5's
   temporary `PATCH :planId`; the route is removed at least one checkpoint
   later (follow-up Z6).
3. **D10** is a manual release (CP-2). The backfill is re-run after deploy,
   and the fallback is removed once no unset rows remain (follow-up Z1).
4. **The account area (A5–A8, A13)** ships behind an environment flag and
   switches on after wave 4. Releases between waves 3 and 4 stay safe.
5. **G11 and G12 stay hidden until G13 ships.**
6. **Messaging and payments switches.**
   - D17's thread channel and F4's Reply wait until A13 is live.
   - E22's Retry and reminder wait until D13 and D17 are live.
   - **`supportsMandates` stays false in production until D11 and D19 pass a
     Razorpay test-mode run.**
   - D13 charges only after D20 is live (CP-5).
7. **The API ships before the app** for B4, B15, E19, E20, G14, F20, D22,
   C15, E8, B12 and D5. The `saroh.app` renderer deploys after the API for
   E6 and F20.
8. **G15's renderer is live (CP-7) before G16 merges.**
9. **F10** changes `company` to `pvt`, which the previous API refuses. The
   API accepts `pvt` a release before the migration writes it, and `company`
   is accepted for one release after (follow-up Z4).
10. **E8 deposits.** Once a deposit has been taken, rolling back below CP-1
    means refunding deposits by hand (DEC-051). Before CP-1, check that the
    production renderer includes A9 (it has since #537), so no cached page
    still posts to the anonymous route that E8 closes.

## Deferred to follow-up work (the contract steps)

| ID | Step | When | Done |
|---|---|---|---|
| Z1 | Remove D10's allowance fallback, once a query finds no unset rows | After CP-2, wave 4 or later | |
| Z2 | Drop `ContactNoteAllergen` (two deploys after C1's rows) | Wave 4 or later | |
| Z3 | Remove the calendar's month-query alias | After E20 is live | |
| F10b | Store `pvt`: the API maps `company` → `pvt`, the app sends `pvt`, and an additive backfill rewrites `company` rows (F10 shipped readers only, boundary 9) | A release after F10 | [x] 2026-09-29 (backfill CLI `business-type-pvt.cli.ts`; rollout doc F10b) |
| Z4 | Remove the `company` business-type alias | A release after F10b | |
| Z5 | Remove Home's legacy fields served beside F5's new ones | With B2d, or a release after it | |
| Z6 | Remove D5's temporary `PATCH :planId` | A checkpoint after D7 | |

## Risks and open questions

- **D11 needs a Razorpay test account with UPI Autopay, and its webhook
  secret.** D11 gates D19, D20, D13, D12, D14 and F4's Retry. Until then
  these are built against the fake provider, and `supportsMandates` stays
  false in production (boundary 6).
- **D22 and E11 need Razorpay test keys** for a real checkout check.
- **A14 and F14 need production SMTP**, and WhatsApp credentials if alerts
  use WhatsApp.
- **Matrix Q2:** is `customer:sensitive` its own capability? It must be
  answered before wave 7 (C13). Proposed: yes.
- **B8:** build B7's "Share your storefront" button, or drop it? Proposed:
  build it, in B8.

## Payments and checkout polish (P1–P5), after autopay

Found in the live Razorpay test-mode walk-through on Northwind (2026-09-29).
The user set the order: after the autopay units (D12, D13, D14), with P1
and P2 first because both involve money.

| ID | Unit | Why | Scope |
|---|---|---|---|
| P1 | Confirm a payment on the checkout's signed return, with the webhook as a backup | A booking paid in Razorpay stayed "Awaiting payment" because its webhook never arrived; the hold then lapsed with the money taken | Checkout hands back `razorpay_payment_id`, `order_id` and `signature` to the page. The renderer posts them to the API, which verifies the signature with the key secret and settles the intent through the same idempotent path the webhook uses (bookings, shop orders, G20 joins, pack purchases, pay links). The webhook stays; whichever arrives first settles and the other is a no-op. Add a sweep that asks the provider about intents still pending after N minutes, so a hold never lapses on money already taken. Include a way to reconcile the stuck 15:00 test booking. |
| P2 | Take payment at the desk from the booking | A pay-at-the-desk booking shows "₹500 due at the visit", with no way to record the payment and no invoice | Booking detail and quick view get "Take ₹X": cash, UPI at the counter, card, or send a pay link. It makes (or finds) the booking's invoice, marks it paid with the method, and the booking shows "Paid at the desk · ‹method›". Respect `payment:manage`/`invoice:write`. Follow the Bookings and Invoice designs. |
| P3 | Order numbers are unique per business | Two orders in one Orders list are both #ORD-001 (each storefront counts from 1) | Decide the numbering (per-business series, or a storefront prefix) with the user, then an additive change plus display. Needs a DEC entry. |
| P4 | Shop setup tells the merchant what's missing | `/shop` is a 404 until the site's "Sells from" is answered, and nothing says so; the header has no Shop link; the order confirmation shows only inside the bag sheet | A Website checklist/flag "Choose which storefront your site sells from", a Shop link in the site header when the shop serves (G13's wiring), and an order confirmation page on the merchant's site after payment (same rule as D12: the customer lands on the merchant's site). |
| P5 | "Made by" on the product page | Shows the storefront's name ("Online") where a maker or brand belongs | Show the product's brand/maker when set; otherwise hide the row. |
