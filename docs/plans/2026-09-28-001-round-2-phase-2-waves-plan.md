---
title: "Round 2, phase 2: build waves"
type: feat
status: active
date: 2026-09-28
origin: docs/plans/2026-09-26-000-round-2-overview.md
---

# Round 2, phase 2: build waves

## Overview

Phase 1 (48 units) is in production; B2c and B10 are in #693. This plan
orders phase 2's 88 units, plus 4 new units for the 2026-09-28 decisions
(DEC-053–056), into 9 waves. Each wave runs as parallel worktree agents, one
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
| Policy (`organization-policy.ts`, `organization-roles.service.ts`) | F19 → B16 → C13 → E26 → F17 |
| Customer workspace | C9 → C12 → C8 → C10 → C11 → C15 → C13 → C6 → C7 |
| Booking flow (`packages/site-blocks/src/booking-flow/**`) | E8 → E6 → A10 → E10 |
| `home.service` | F9 → F7 → F2 → F4 → F11 |
| Calendar grid | E21 → E28 → E22 → E23 → E24 → E25 → E27 |
| Section contract | G7 → G9 → G10 → G12 → G14 → G20 |
| Order module | B12 → B2d → B9 → B13 → B6 |
| `subscriptions.service` | D21 → D10 → D5 → D20 → D13 |
| Communications | D17 → A14 |

Two changes from the overview's order:
- **B12 runs ahead of B2d.** B12 only writes the new values; B2d only drops
  the old ones.
- **F7 runs ahead of F2.** F7 has no dependency on F2.

## Implementation Units (by wave)

### Wave 1
- F19 #662: the security fix, and the head of the policy chain.
- F20 (new): the public business phone (DEC-053).
- D22 (new): the Razorpay public key id (DEC-054).
- D21 (new): the DRAFT readers, split out of D5.
- C9 #586: owns `resolveContact`. It finishes A2's `linkOrCreate` and moves
  C3's `notRetired`.
- E8 #621: deposits. It also turns the anonymous booking route to 410, since
  A9 is in production.
- G11 #674: hidden until G13 ships.
- B12 #571
- E12 #625
- G7 #670: also passes `siteId` to `PageSections` (the G1–G4 follow-up).
- E21 #634
- F9 #652

### Wave 2
- B2d #561: only after B2c's release is in production.
- B11 #570
- B4 #563
- B8 #567: also takes DEC-056's Reviewer locked card and B10's free-text
  "Other" courier.
- C12 #589
- E9 #622
- E6 #619: shows F20's phone, and calls through the signed relay header.
- D6 #598
- D17 #610
- E28 #641
- D10 #602: the allowance fallback, and the fix for "Paused until" a day
  that has passed.
- E19 #632

### Wave 3
- B9 #568
- B5 #564
- C8 #585
- A10 #551
- A5 #546: off until A6–A8 and A13 land.
- D5 #597: the draft writers, after D21 is in production.
- G9 #672
- E20 #633
- G13 #676: must not add `placedOnline` again.
- D11 #603: blocked on credentials.
- F7 #650
- F16 #659

### Wave 4
- B13 #572
- B15 #574
- C10 #587
- E10 #623: also fixes the `/contacts/:id` link on booking detail.
- A6 #547
- A7 #548
- A8 #549: accepts weeks only.
- A13 #554
- E14 #627
- D7 #599
- D19 #604
- G10 #673

### Wave 5
- B6 #565: merges after A14.
- C11 #588: merges after D20.
- A14 #555
- D20 #612
- E22 #635
- G12 #675
- E13 #626
- A11 #552
- B14 #573
- F10 #653
- D15 #608

### Wave 6
- B16 #575
- C15 (new): the per-storefront same-email setting (DEC-055).
- D13 #606
- E23 #636
- G14 #677
- F2 #645
- E15 #628
- E16 #629
- E18 #631
- D16 #609
- F13 #656
- A12 #553

### Wave 7
- C13 #590: "Returning" counts only what the viewer can read (DEC-056).
- E24 #637
- G15 #678
- F4 #647
- D12 #605
- E17 #630
- D18 #611
- F12 #655: also brings back the Settings checklist nudges (DEC-056).

### Wave 8
- E26 #639
- C6 #583
- E25 #638
- G20 #683
- G16 #679
- F11 #654
- D14 #607
- F14 #657

### Wave 9
- F17 #660
- C7 #584
- C14 #591: also makes "Add customer" create a contact only (DEC-056), and
  makes Spent net of partial refunds.
- E27 #640
- G19 #682

## New units

| ID | Scope | Wave |
|---|---|---|
| F20 | An optional `publicPhone` on the business profile (additive), a field for it in Settings → Business, and `businessPublicPhone(site)` in `site-host.ts` filled in. It lets G8's Call button and A2/A9's "call ‹Business›" copy work. Hidden when unset. | 1 |
| D22 | Settings › Providers asks for the Razorpay public key id, and the API returns it for E11's checkout. A connection without it reads as needing attention. | 1 |
| D21 | The readers that refuse DRAFT (subscribe, the site's plan reads, "Sell again"). They reach production before any draft writer. | 1 |
| C15 | A per-storefront setting for same-email customers: link automatically, or leave for staff (the default). It drives C2's backfill and suggestions and C10's merge. | 6 |

## Release boundaries

1. B2c (#693) is in production before B2d merges. B2d ships as its own
   release, and it also removes the Orders list's old shape.
2. D21 is in production before D5, D7, E14, E13 or E18 merges.
3. D10: for one release, a subscription with no allowance reads the plan's
   value. Re-run the backfill after that deploy. A follow-up removes the
   fallback once no unset rows remain.
4. The account area (A5–A8, A13) goes live together at the end of wave 4.
5. G11 and G12 stay hidden until G13 ships.
6. D17's thread channel and F4's Reply wait until A13 is in production.
   E22's Retry and reminder wait until D13 and D17 are. Autopay shows only
   where `supportsMandates` is true.
7. The API ships before the app for B4, B15, E19, E20 and G14.
8. G15's renderer is in production before G16 lets merchants create module
   pages.

## Risks and open questions

- **D11 needs a Razorpay test account with UPI Autopay, and its webhook
  secret.** D11 gates D19, D20, D13, D12, D14 and F4's Retry. Until then
  they are built against the fake provider.
- **D22 and E11 need Razorpay test keys** for a real checkout check.
- **A14 and F14 need production SMTP**, and WhatsApp credentials if alerts
  use WhatsApp.
- **Matrix Q2:** is `customer:sensitive` its own capability? It must be
  answered before wave 7 (C13). Proposed: yes.
- **C15:** what do existing stores default to (proposed: leave for staff)?
  Does automatic linking also need a verified email (DEC-049)?
- **F20:** is the phone shown by default once set, and is it checked as
  `+91…`?
- **B8:** build B7's "Share your storefront" button, or drop it?
