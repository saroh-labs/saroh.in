---
title: "Round 2 — staff permission matrix, for review"
type: review
status: awaiting review
date: 2026-09-26
decisions: DEC-039 (this review), DEC-006, DEC-020, DEC-024, DEC-032, DEC-040, DEC-048
source: saroh-fixtures.js (PRODUCT_PERMS, PRODUCT_VIEWERS, ROLE_RULES) and the round-2 .dc.html designs; apps/api.saroh.in/src/modules/organizations/{organization-actions,organization-policy,capability-catalogue}.ts
---

# Round 2 — staff permission matrix

**This page is for the user's review** (DEC-039). It lists every action the
round-2 designs gate on and sets it against the built-in roles and custom
roles. It marks what exists today and what is proposed. Nothing here ships
until the review. The units marked **"blocked on the matrix review"** in the
round-2 plans wait on it:

- B16 in plan 002, the orders permission pass;
- C13 in plan 003, the customer permissions;
- E26 in plan 005, `booking:settings` and `pack:sell`;
- F11 in plan 006, staff landing.

## How to read it

- **Action** is the key the API checks. **Exists** means the key is in
  `organization-actions.ts` today; **new** means it is proposed.
- **Owner / Admin / Member / Reviewer** are the four built-in roles
  (`organization-policy.ts`). A Member cell reads **today → proposed**
  where the proposal changes it.
- **Custom** says whether the action can be given to a role a business
  invents. Custom roles are built (roles are rows, `resolveCapabilities`);
  `ownerOnly` actions cannot be granted.
- ✓ holds it · — does not · **P✓** proposed to hold it · **P—** proposed to
  lose it.
- **Design name** is the name in `saroh-fixtures.js` when it differs from the
  repo's key.
- Rules that hold whatever is decided:
  - the API decides; screens only mirror it (`backend-auth-and-access.md`);
  - a role without a money read gets no money figures from the API
    (DEC-024);
  - a Reviewer is enumerated, never derived from the floor (DEC-006, #276).

## 1. Customers

| Action | What it lets you do | Today | Owner | Admin | Member | Reviewer | Custom | Used by |
|---|---|---|---|---|---|---|---|---|
| `customer:read` | See customers and their orders (the Customers list and Customer Detail, without phone or email) | new; today `contact:read` + `order:read` | ✓ | ✓ | P✓ (has `contact:read` today) | — | ✓ | Customers, Customer Detail, Home |
| `customer:contact` | See phone numbers and email; search by them | new; today part of `contact:read` | ✓ | ✓ | **P—** (sees them today through `contact:read`) | — | ✓ | Customers, Customer Detail, Orders, Order Detail, Bookings |
| `customer:write` | Edit a customer's details, notes and Needs attention | new; today `contact:write` | ✓ | ✓ | — | — | ✓ | Customer Detail edit sheet, Needs attention |
| `customer:sensitive` | See Medical and other sensitive Needs attention entries | new | ✓ | ✓ | — | — | ✓ | everywhere Needs attention shows (DEC-040) |
| `customer:merge` | Merge two customers | new; design folds it into `customer:remove` | ✓ | ✓ | — | — | ✓ | Customer Detail ⋯, duplicates |
| `customer:remove` | Remove a customer's details for privacy (anonymise) | new; today a hard delete under `contact:write` | ✓ | ✓ | — | — | ✓ | Customer Detail ⋯ |
| `contact:read` / `contact:write` | CRM contacts (Contacts screen) | exists | ✓ | ✓ | ✓ / — | — | ✓ | Contacts; unchanged (DEC-041) |

**For review:**
- **C-1.** Splitting `customer:contact` out means a Member stops seeing phone
  numbers and email they see today (DEC-020 gave them `contact:read`, which
  includes both). Options: (a) the split, and Members lose them, as the
  design shows; (b) Members keep `customer:contact` by default, and a
  business takes it away with a custom role.
  **Proposed: (b)**, since it changes nothing for existing businesses. A
  front-desk custom role in the design holds it anyway.
- **C-2.** Should `customer:merge` be its own action or part of
  `customer:remove`? **Proposed: its own action.** Merging is routine
  housekeeping; removal is irreversible.
- **C-3.** `customer:write` could be `contact:write` under a new label, since
  one Contact backs both screens. **Proposed: reuse `contact:write`** and
  relabel it "Edit customer and contact details". That is one action fewer,
  and nothing to migrate.
- **C-4.** Before the review, sensitive entries go to Owner and Admin only.
  C1 in plan 003 gates them on `contact:write` as a stand-in.

## 2. Orders

| Action | What it lets you do | Today | Owner | Admin | Member | Reviewer | Custom | Used by |
|---|---|---|---|---|---|---|---|---|
| `order:read` | See orders **with money** (totals, payments, refunds) | exists | ✓ | ✓ | — (DEC-024) | — | ✓ | Orders, Order Detail, Customer Detail orders tab |
| `order:stage` (design `order:fulfil`) | See the kitchen view without money; move an order through its steps; undo the last step; print the ticket; bulk kitchen actions | exists | ✓ | ✓ | ✓ | — | ✓ | Orders list and quick view, Order Detail, bulk actions |
| `order:create` | Take a new order (New order, walk-in) | new; today `order:write` | ✓ | ✓ | P? (see O-1) | — | ✓ | New order v2 |
| `order:edit` | Change items, address or how an order is fulfilled (until handover) | new; today `order:write` | ✓ | ✓ | — | — | ✓ | Order Detail Edit, Change how it's fulfilled |
| `order:refund` | Refund and cancel (a cancel is a full refund) | new; today `payment:manage` | ✓ | ✓ | — | — | ✓ | Order Detail refund and cancel, row menu |
| `order:export` | Export orders to CSV | new; today `order:read` | ✓ | ✓ | — | — | ✓ | Orders Export |
| `order:write` | (today) everything above except the stage and refunds | exists | ✓ | ✓ | — | — | ✓ | kept as the umbrella (O-3) |

**For review:**
- **O-1. The design's Member reads orders with money and takes new ones**
  (`order:read`, `order:create`). DEC-024 gave a Member the kitchen view with
  no money. Options:
  - (a) keep DEC-024: a Member has `order:stage` only, and the design's
    Member becomes a "Counter" custom role;
  - (b) Members gain `order:create` but still see no money, so New order
    hides totals and takes payment "at the counter";
  - (c) Members gain `order:read` and see money, reversing DEC-024.

  **Proposed: (a)**, with a shipped "Counter" role template holding
  `order:stage` + `order:create` + `customer:contact`. It keeps every
  existing business as it is.
- **O-2. `order:fulfil` vs `order:stage`.** They are the same power.
  **Proposed:** keep the key `order:stage` and relabel it "Move orders
  through their steps and print".
- **O-3. Split `order:write`.** **Proposed:** add `order:create`, `order:edit`
  and `order:export`, and have `order:write` imply all three (like
  `store:write` → `inventory:write`, `withImplied`), so existing custom roles
  keep what they had.
- **O-4. `order:refund` vs `payment:manage`.** **Proposed:** `order:refund`
  for an order's refunds and cancel. `payment:manage` keeps provider set-up
  and invoice refunds, and implies `order:refund`.

## 3. Bookings, services and class packs

| Action | What it lets you do | Today | Owner | Admin | Member | Reviewer | Custom | Used by |
|---|---|---|---|---|---|---|---|---|
| `booking:read` | See bookings and the diary | exists | ✓ | ✓ | ✓ | — | ✓ | Bookings, Calendar, Home Today |
| `booking:write` | Book, check in, mark no-show, move, cancel | exists | ✓ | ✓ | — → P? (B-1) | — | ✓ | New booking, peek, Home Today |
| `booking:settings` | Change services, working hours, time off, booking rules; "Also sell" | new; today `service:write` | ✓ | ✓ | — | — | ✓ | Service Editor, Availability, time off |
| `service:read` | See services | exists | ✓ | ✓ | ✓ | — | ✓ | Services |
| `pack:read` | See class packs and who holds one (money figures only with a money read) | exists | ✓ | ✓ | — → P✓ without money (B-3) | — | ✓ | Packs, Pack Detail |
| `pack:sell` | Sell a pack at the desk | new; today `pack:write` | ✓ | ✓ | — → P? (B-3) | — | ✓ | Sell dialog |
| `pack:write` | Create and edit packs, publish, extend, archive | exists | ✓ | ✓ | — | — | ✓ | Pack Editor, Extend |
| `course:*` | Courses (paused this round, DEC-044) | exists | ✓ | ✓ | — | — | ✓ | unchanged |

**For review:**
- **B-1.** The design's front desk books, checks in and moves bookings. A
  Member today only reads the diary. Options: give every Member
  `booking:write`, or ship a "Front desk" role template.
  **Proposed: the template.** Every Member gaining a write changes every
  business.
- **B-2. `booking:settings` as a new key, or a relabel of `service:write`?**
  **Proposed: relabel `service:write`** to "Change services, hours, time off
  and booking rules". It already guards staff, hours, time off and booking
  rules (ADR-008), so a new key would duplicate it.
- **B-3.** The design's Member (a trainer) sells packs, enrols and marks
  attendance, with no money figures. **Proposed:** Members gain `pack:read`
  (the API serves it without money) and `pack:sell`. The sell dialog then
  shows the price being charged, so it states a price a Member otherwise
  can't see. Decide whether that is acceptable, or whether selling stays with
  Owner and Admin.

## 4. Money, subscriptions, plans and invoices

| Action | What it lets you do | Today | Owner | Admin | Member | Reviewer | Custom | Used by |
|---|---|---|---|---|---|---|---|---|
| `payment:read` (design `payments:read`) | See money in and out: takings, fees, the calendar's money, Home's This week | exists | ✓ | ✓ | — | — | ✓ | Calendar money, Home This week, every money figure |
| `payment:manage` | Connect providers, refunds on invoices, mandates | exists | ✓ | ✓ | — | — | ✓ | Providers, autopay |
| `subscription:read` | See subscriptions and renewals | exists | ✓ | ✓ | — (design ✓) | — | ✓ | Subscriptions, Plan Detail, Calendar |
| `subscription:write` | Subscribe, pause, cancel; create, edit and publish plans | exists | ✓ | ✓ | — | — | ✓ | Plan Editor, Subscription Detail |
| `invoice:read` / `invoice:write` | See invoices / issue, send, credit and void them | exists | ✓ | ✓ | — | — | ✓ | Invoices, Invoice Detail |

**For review:**
- **M-1. The design's Member reads subscriptions** (`subscription:read`).
  DEC-020 keeps Members away from money. **Proposed: no change.** A gym that
  wants trainers to see who is a member gives them a custom role; the diary
  already shows "Paid with membership" on a booking.
- **M-2. The money redaction rule**, restated for the new screens: Customers
  "Spent", Orders totals, the Calendar's in, out and due, Home's This week,
  and Pack and Plan Detail sales are all left out by the API unless the
  caller holds the matching money read. The matching read is `payment:read`
  for takings and fees, `order:read` for order totals, `invoice:read` for
  invoices and `subscription:read` for renewals. **Proposed:** Customers
  "Spent" needs `order:read` or `invoice:read`.

## 5. Products and stock (settled in round 1, listed for completeness)

| Action | Design name | Today | Owner | Admin | Member | Reviewer | Custom |
|---|---|---|---|---|---|---|---|
| `store:read` | `product:read` | exists | ✓ | ✓ | ✓ | — | ✓ |
| `store:write` | `product:write` | exists | ✓ | ✓ | — | — | ✓ |
| `inventory:write` | same | exists (DEC-032) | ✓ | ✓ | — | — | ✓ |
| `product-review:write` | `review:reply` | exists | ✓ | ✓ | — (design ✓) | — | ✓ |

- **P-1.** The design's Member replies to and hides reviews.
  **Proposed: no change.** A reply is public and speaks for the business.

## 6. Website, team and settings

| Action | What it lets you do | Today | Owner | Admin | Member | Reviewer | Custom |
|---|---|---|---|---|---|---|---|
| `site:read` | See the site (a Reviewer only the sites they were invited to) | exists | ✓ | ✓ | ✓ | ✓ (narrowed) | ✓ |
| `section:write` | Edit pages | exists | ✓ | ✓ | — | — | ✓ |
| `site:update` | Site settings and the brand (`PUT sites/:id/style`) | exists | ✓ | ✓ | — | — | ✓ |
| `site:publish` | Publish (also during review, DEC-047) | exists | ✓ | ✓ | — | — | ✓ |
| `site:comment` / `site:approve` | Review | exists | ✓ | ✓ | — | ✓ | ✓ |
| `member:read` / `member:invite` / `member:role:update` / `member:remove` | Team | exists | ✓ | ✓ | ✓ / — / — / — | — | ✓ |
| `store:write` + `member:invite` | Add someone to a storefront, which also adds them to the team (DEC-048) | exists | ✓ | ✓ | — | — | ✓ |
| `org:update` | Business settings | exists | ✓ | ✓ | — | — | ✓ |
| `module:manage` | Turn modules on and off, Class packs included | exists | ✓ | ✓ | — | — | ✓ |
| `message:read` / `message:write` | Read and answer customer messages (plan A) | exists | ✓ | ✓ | — | — | ✓ |

- **W-1. "commerce:read" (Team design note).** The rail shows Sell to a
  Reviewer because Sell gates on the module alone. **Proposed:** gate each
  Sell row on its own read action (`order:read` or `order:stage`,
  `store:read`, `customer:read`), not a new key. A Reviewer holds none of
  these, so Sell disappears for them.
- **W-2. Storefront roles on top of the team** (DEC-048). The storefront
  roles are Admin, Manager, Editor and Viewer. **Proposed:** keep what each
  grants today. The team membership they create is Member, and the storefront
  role only widens it for that storefront. Needs the user to confirm the
  Manager and Editor sets once `StoreMembers` is read in detail.

## 7. A business's customers on its site (not staff)

Customer accounts (ADR-011) are not roles. A signed-in customer reads only
their own bookings, orders, plan, packs, invoices and messages, through an
allow-list serializer. They never see staff notes or another customer. Staff
reach a customer's account only through Customer Detail, under the actions
above.

## 8. Role templates proposed (not built-in roles)

| Template | Holds |
|---|---|
| Counter | `order:stage`, `order:create`, `customer:read`, `customer:contact`, `store:read`, `inventory:write` |
| Front desk | `booking:read`, `booking:write`, `order:stage`, `order:create`, `customer:read`, `customer:contact`, `customer:write`, `pack:sell` |
| Practitioner (Dentist) | `booking:read`, `order:stage`, `customer:read`, `customer:sensitive` |
| Packer | `store:read`, `inventory:write`, `order:stage` |

A template pre-fills "New role" in Team. It is not a fifth built-in role.

## 9. Decisions the review should return

1. C-1: do Members keep phone and email?
2. C-3: reuse `contact:write`?
3. O-1: the Member and orders: (a), (b) or (c)?
4. O-3 and O-4: split `order:write` and add `order:refund`, with implied
   holds?
5. B-1: templates, or `booking:write` for every Member?
6. B-2: relabel `service:write`?
7. B-3: may Members sell packs?
8. M-1 and P-1: no change?
9. W-1: gate Sell rows on their own reads?
10. W-2: storefront role sets.
11. §8: which templates ship?
