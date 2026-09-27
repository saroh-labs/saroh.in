---
title: "Round 2 — staff permissions: the capability model"
type: review
status: reworked 2026-09-27 around the user's answer; four product choices still open (§9)
date: 2026-09-26
revised: 2026-09-27
decisions: DEC-039 (this model), DEC-006, DEC-020, DEC-024 (superseded in part), DEC-032, DEC-040, DEC-048
source: saroh-fixtures.js (PRODUCT_PERMS, PRODUCT_VIEWERS, ROLE_RULES) and the round-2 .dc.html designs; apps/api.saroh.in/src/modules/organizations/{organization-actions,organization-policy,capability-catalogue}.ts
---

# Round 2 — staff permissions: the capability model

The first version of this page (2026-09-26) set every action against the four
built-in roles and proposed hiding money from Members screen by screen. The
user answered on 2026-09-27:

> The people who have access will be able to see them, so it depends on the
> type of permissions we have given to the users, and not just on the role —
> if a user has permission to read orders, he can view all details of that
> order.

So permissions are **capabilities granted to people**, and roles are only
**default bundles** of them. This page sets out the model, the capabilities
the round-2 screens need, the default bundles, the answers to the first
version's eleven questions, and the four product choices still open.

## 1. The model

1. **A capability is what the API checks** (an `OrgAction` in
   `organization-actions.ts`). A person holds a capability through their
   role (built-in or custom) or **directly, as an extra permission** (Team's
   "Extra permissions" column, F17).
2. **A capability shows everything within its scope.** `order:read` shows the
   whole order: items, customer, totals, payments, refunds and its pay link.
   **There is no separate money redaction by role.**
3. **A screen that gathers several scopes shows each part to whoever holds
   that part's read.** Customer Detail's Orders tab needs `order:read`; its
   Plan tab `subscription:read`; the Calendar's money cells and Home's
   takings `payment:read`. Nothing inside a part is hidden from someone who
   holds its read. A figure that sums two scopes (Customers' "Spent", orders
   plus invoices) shows to whoever holds both reads.
4. **The fixed roles are default bundles.** Owner holds everything; Admin
   everything but `org:delete`; Member a day-to-day bundle (§4, Q1);
   Reviewer the website only, enumerated and never derived from a floor
   (DEC-006, #276). A business can change a built-in role's bundle or make its
   own role (built: roles are rows, `resolveCapabilities`).
5. **A capability is split only where a business would plausibly grant one
   without the other**, and each split says why (§3). A write implies the
   read of its scope (`order:stage` → `order:read`). An old umbrella implies
   its new parts (`withImplied`), so a role saved before the split keeps what
   it could do.

Rules that hold whatever is chosen in §9:

- the API decides; screens only mirror it (`backend-auth-and-access.md`);
- sensitive Needs attention entries are left out by the API for anyone
  without the sensitive capability (DEC-040), which is a scope, not a role
  rule;
- `ownerOnly` actions (`org:delete`) can't be granted to another role or
  person;
- a business's customers are not staff and hold no capability (§8).

## 2. Capabilities for the round-2 screens

**Status:** exists · new · relabel (same key, new label) · removed.
**Design name** is the name in `saroh-fixtures.js` where it differs.

### Customers (one Contact backs Customers and Contacts, DEC-041)

| Capability | Scope: what it shows or lets you do | Status | Implies | Used by |
|---|---|---|---|---|
| `contact:read` | See customers and contacts: the Customers list, Customer Detail, name, phone, email, address, notes, non-sensitive Needs attention, "Signs in on your website"; search by phone or email | exists; relabel "See customers and contacts" (design `customer:read`) | — | Customers, Customer Detail, Contacts, Orders and Bookings customer cards |
| `contact:write` | Edit a person: details, notes, email and address, Needs attention, confirm a booking-page note, "This isn't them"; the hard delete of a contact with no orders or invoices (DEC-042) | exists; relabel "Edit customers and contacts" (design `customer:write`) | `contact:read` | Customer Detail edit sheet, Needs attention |
| `customer:sensitive` | See Medical and other sensitive Needs attention entries and booking-page intake notes | new (Q2) | — | everywhere Needs attention shows |
| `customer:merge` | Merge two customers | new | — | Customer Detail ⋯, duplicates |
| `customer:remove` | Remove a customer's details for privacy (anonymise) | new | — | Customer Detail ⋯ |

### Orders

| Capability | Scope | Status | Implies | Used by |
|---|---|---|---|---|
| `order:read` | Orders list, quick view, Order Detail and a customer's Orders tab — the whole order, money included | exists | — | Orders, Order Detail, Customer Detail |
| `order:stage` | Move an order through its steps, undo the last step, print the ticket, bulk moves, record the courier and tracking number | exists; relabel "Move orders through their steps and print" (design `order:fulfil`) | `order:read` (F18) | Orders, Order Detail, Home Today |
| `order:create` | Take a new order (New order, walk-in), and its pay link | new; today `order:write` | `order:read` | New order v2 |
| `order:edit` | Change items, address or how it's fulfilled until handover; replace a pay link | new; today `order:write` | `order:read` | Order Detail Edit, Change how it's fulfilled |
| `order:refund` | Refund and cancel (a cancel is a full refund) | new; today `payment:manage` | `order:read` | Order Detail refund and cancel, row menu |
| `order:export` | Export orders to CSV | new; today `order:read` | `order:read` | Orders Export |
| `order:write` | Kept for roles saved before the split; the role editor shows its parts | exists | `order:create`, `order:edit`, `order:export` | saved custom roles |

### Bookings, services and class packs

| Capability | Scope | Status | Implies | Used by |
|---|---|---|---|---|
| `booking:read` | Bookings and the diary: who, when, the service, its price, deposit and how it was paid | exists | — | Bookings, Calendar, Home Today |
| `booking:write` | Book, check in, mark no-show, move, cancel | exists | `booking:read` | New booking, peek, Home Today |
| `service:read` | See services | exists | — | Services |
| `service:write` | Change services, working hours, time off, closures, booking rules; "Also sell" | exists; relabel "Change services, hours, time off and booking rules" (design `booking:settings`) | `service:read` | Service Editor, Availability, time off |
| `pack:read` | Class packs, who holds one, balances, sales and prices | exists | — | Packs, Pack Detail |
| `pack:sell` | Sell a pack at the desk | new; today `pack:write` | `pack:read` | Sell dialog |
| `pack:write` | Create and edit packs, publish, extend, archive | exists | `pack:sell` | Pack Editor, Extend |
| `course:*` | Courses (paused this round, DEC-044) | exists | — | unchanged |

### Money, subscriptions, plans and invoices

| Capability | Scope | Status | Implies | Used by |
|---|---|---|---|---|
| `payment:read` | Money in and out: takings, fees, refunds paid, the Calendar's in, out and due, Home's This week takings (design `payments:read`) | exists | — | Calendar money, Home This week, Payments |
| `payment:manage` | Connect providers, refund invoices, mandates | exists | `order:refund` | Providers, autopay |
| `subscription:read` / `subscription:write` | Subscriptions, renewals, plans and their figures / subscribe, pause, cancel; create, edit and publish plans | exists | write → read | Subscriptions, Plan Detail, Plan Editor |
| `invoice:read` / `invoice:write` | Invoices and their amounts / issue, send, credit and void | exists | write → read | Invoices, Invoice Detail |

### Products and stock (settled in round 1)

| Capability | Design name | Status | Implies |
|---|---|---|---|
| `store:read` | `product:read` | exists | — |
| `store:write` | `product:write` | exists | `inventory:write` (DEC-032) |
| `inventory:write` | same | exists | — |
| `product-review:read` / `product-review:write` | — / `review:reply` | exists | write → read |

### Website, team and settings (unchanged)

| Capability | What it lets you do |
|---|---|
| `site:read` | See the site (a Reviewer only the sites they were invited to) |
| `section:write` | Edit pages |
| `site:update` | Site settings and the brand (`PUT sites/:id/style`) |
| `site:publish` | Publish (also during review, DEC-047) |
| `site:comment` / `site:approve` | Review |
| `member:read` / `member:invite` / `member:role:update` / `member:remove` | Team; `member:role:update` also sets a person's extra permissions (F17) |
| `org:update` | Business settings |
| `module:manage` | Turn modules on and off, Class packs included |
| `message:read` / `message:write` | Read and answer customer messages (plan A) |

A storefront role (Admin, Manager, Editor, Viewer; DEC-048) is a default
bundle narrowed to one storefront. The bundles stay what they grant today;
F16 lists them on this page when it reads `StoreMembers` in detail.

## 3. Why each split exists, and the splits dropped

**Kept, because a business would plausibly grant one without the other:**

| Split | Why |
|---|---|
| `customer:sensitive` apart from `contact:read` | A front desk books a clinic's patients but should not read their medical notes (DEC-040). Open as Q2. |
| `customer:merge` and `customer:remove` apart from `contact:write` | Both are irreversible. A business lets staff fix a phone number long before it lets them merge two people or erase one. Merge and removal are apart from each other because merging duplicates is routine housekeeping and removal is a legal step. |
| `order:stage` apart from `order:read` | An accountant or a partner reads orders and never moves them. |
| `order:create` apart from `order:edit` | Counter staff take new orders but should not change someone else's after it is placed. |
| `order:refund` apart from the other order writes | Money leaves the business; the power most often kept by the owner. |
| `order:export` apart from `order:read` | A file of every order and customer leaves Saroh; reading on screen is not taking it away. |
| `booking:write` apart from `booking:read` | A practitioner sees their diary; the front desk changes it. |
| `service:write` apart from `booking:write` | Setting hours and rules is set-up, not the day's bookings. |
| `pack:sell` apart from `pack:write` | A trainer sells a pack at the desk but doesn't set its price or validity. |

**Dropped, because their only purpose was hiding money or contact details
from Members:**

| Dropped | Instead |
|---|---|
| `customer:contact` (phone and email apart from the customer) | Phone and email are part of the person; `contact:read` shows them. |
| `customer:read` / `customer:write` as new keys | `contact:read` / `contact:write`, relabelled: one record, one scope (DEC-041). |
| The money-free kitchen view for `order:stage` (DEC-024) | `order:stage` implies `order:read`; the kitchen view is a layout, not a permission (F18). |
| A money-free `pack:read` (Pack Detail without prices) | `pack:read` shows prices and sales. |
| The per-screen "money read" rule (first version M-2) | §1 rule 3: each part of a screen follows its own read. |
| `booking:settings` as a new key | `service:write`, relabelled: the same power. |

## 4. Default bundles

✓ holds it · — does not · **P✓** proposed for the Member default (Q1).
Implied holds are shown.

| Capability | Owner | Admin | Member today | Member proposed | Reviewer |
|---|---|---|---|---|---|
| `org:read`, `member:read`, `module:read`, `media:read` | ✓ | ✓ | ✓ | ✓ | — |
| `site:read` | ✓ | ✓ | ✓ | ✓ | ✓ (invited sites) |
| `site:comment`, `site:approve` | ✓ | ✓ | — | — | ✓ |
| `section:write`, `site:update`, `site:publish` | ✓ | ✓ | — | — | — |
| `store:read`, `product-review:read` | ✓ | ✓ | ✓ | ✓ | — |
| `store:write`, `inventory:write`, `product-review:write` | ✓ | ✓ | — | — | — |
| `contact:read` | ✓ | ✓ | ✓ | ✓ | — |
| `contact:write` | ✓ | ✓ | — | — | — |
| `customer:sensitive` | ✓ | ✓ | — | — | — |
| `customer:merge`, `customer:remove` | ✓ | ✓ | — | — | — |
| `order:read` | ✓ | ✓ | — (kitchen view without money, DEC-024) | **P✓** | — |
| `order:stage` | ✓ | ✓ | ✓ | ✓ | — |
| `order:create` | ✓ | ✓ | — | **P✓** | — |
| `order:edit`, `order:refund`, `order:export` | ✓ | ✓ | — | — | — |
| `booking:read`, `service:read` | ✓ | ✓ | ✓ | ✓ | — |
| `booking:write` | ✓ | ✓ | — | **P✓** | — |
| `service:write` | ✓ | ✓ | — | — | — |
| `pack:read`, `pack:sell` | ✓ | ✓ | — | **P✓** | — |
| `pack:write`, `course:*` writes | ✓ | ✓ | — | — | — |
| `payment:read`, `payment:manage` | ✓ | ✓ | — | — | — |
| `subscription:read`, `subscription:write` | ✓ | ✓ | — | — | — |
| `invoice:read`, `invoice:write` | ✓ | ✓ | — | — | — |
| `message:read`, `message:write` | ✓ | ✓ | — | — | — |
| `member:invite`, `member:role:update`, `member:remove` | ✓ | ✓ | — | — | — |
| `org:update`, `module:manage` | ✓ | ✓ | — | — | — |
| `org:delete` | ✓ | — | — | — | — |

The proposed Member is the design's: someone who works the floor. They take
and move orders and see them whole, book and check people in, and sell a
pack. They don't refund, edit a placed order, export, see takings,
subscriptions or invoices, read sensitive notes, or change set-up.

**Role templates** (not built-in roles; Q3). A template pre-fills "New role"
in Team:

| Template | Holds (the reads they imply follow) |
|---|---|
| Counter | `order:stage`, `order:create`, `contact:read`, `store:read`, `inventory:write` |
| Front desk | `booking:write`, `order:stage`, `order:create`, `contact:write`, `pack:sell` |
| Practitioner (Dentist) | `booking:read`, `service:read`, `contact:read`, `customer:sensitive` |
| Packer | `store:read`, `inventory:write`, `order:stage` |

## 5. Per-person grants

A person can hold capabilities beyond their role: **extra permissions**
(F17). Their capabilities are their role's bundle plus their own grants,
with implied holds added. `member:role:update` sets them, the change is
audited, and Team's "Extra permissions" column shows them (it stays hidden
while nobody has any, F15). An `ownerOnly` action can't be granted this way.

## 6. The first version's eleven questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | C-1: do Members keep phone and email? | **Decided by the capability model.** Phone and email are part of the person; `contact:read` shows them. `customer:contact` is dropped, and Members keep them. |
| 2 | C-3: reuse `contact:write`? | **Decided by the capability model.** Yes, and `contact:read` serves the Customers list too. No `customer:read` or `customer:write` key. |
| 3 | O-1: the Member and orders, (a), (b) or (c)? | **(b) is gone** under the model: nobody reads an order without its money. Whether a Member holds `order:read` and `order:create` by default is **Q1**. |
| 4 | O-3 and O-4: split `order:write`, add `order:refund`, with implied holds? | **Decided by the capability model.** `order:create`, `order:edit`, `order:export` and `order:refund`, each with its reason (§3). `order:write` implies the first three and `payment:manage` implies `order:refund`. |
| 5 | B-1: templates, or `booking:write` for every Member? | The split stands. Whether the Member default holds `booking:write` is **Q1**; the Front desk template is **Q3**. |
| 6 | B-2: relabel `service:write`? | **Decided by the capability model.** Yes; no `booking:settings` key (one power, one key). |
| 7 | B-3: may Members sell packs? | **Decided by the capability model** for the split: `pack:sell`, implied by `pack:write`, and `pack:read` shows prices. Whether the Member default holds them is **Q1**. |
| 8 | M-1 and P-1: no change? | Whether the Member default reads subscriptions or replies to reviews is **Q1**. Proposed: neither. |
| 9 | W-1: gate Sell rows on their own reads? | **Decided by the capability model.** Each Sell row shows with its own read (`order:read`, `store:read`, `contact:read`); a Reviewer holds none, so Sell disappears for them. |
| 10 | W-2: storefront role sets | **Decided by the capability model.** A storefront role is a default bundle narrowed to one storefront; each keeps what it grants today. |
| 11 | §8: which templates ship? | **Q3.** |

## 7. Units that carry this

| Unit | What | Phase |
|---|---|---|
| C13 (plan 003) | Relabel `contact:*`; add `customer:merge`, `customer:remove` and, per Q2, `customer:sensitive`, replacing C1's stand-in | 2 |
| B16 (plan 002) | `order:create`, `order:edit`, `order:export`, `order:refund` with implied holds; Sell rows on their own reads | 2 |
| E26 (plan 005) | Relabel `service:write`; add `pack:sell` implied by `pack:write`; `pack:read` serves prices | 2 |
| F11 (plan 006) | Staff landing: rows follow each person's capabilities | 2 |
| F17 (plan 006) | Extra permissions per person | 2 |
| F18 (plan 006) | The Member default bundle, `order:stage` → `order:read`, the money-free kitchen view dropped, role templates | 3 — waits on Q1, Q3 and Q4 |

Until F18 ships, the shipped Member stands: it moves orders through the
kitchen view without money (DEC-024), and screens built before then serve it
that view.

## 8. A business's customers on its site (not staff)

Customer accounts (ADR-011) are not roles. A signed-in customer reads only
their own bookings, orders, plan, packs, invoices and messages, through an
allow-list serializer. They never see staff notes or another customer. Staff
reach a customer's account only through Customer Detail, under the
capabilities above.

## 9. Still open — product choices for the user

- **Q1. The Member default bundle.** Proposed (§4): today's reads plus
  `order:read` (so Members see whole orders, money included), `order:create`,
  `booking:write`, `pack:read` and `pack:sell`. Not subscriptions, invoices,
  takings, refunds, order edits, export, review replies, sensitive notes or
  set-up. Alternatives: (a) as proposed; (b) today's Member made consistent
  with the model — orders read and moved, no new writes; (c) no orders at
  all by default, with kitchen staff given a template or extra permissions.
- **Q2. Are sensitive notes their own capability?** Proposed: yes,
  `customer:sensitive`, held by Owner and Admin by default and grantable to a
  practitioner. The alternative is that anyone who sees a customer
  (`contact:read`) sees their medical notes. Until it is answered, sensitive
  entries go to `contact:write` holders only (C1's stand-in).
- **Q3. Which role templates ship.** Proposed: all four in §4 (Counter,
  Front desk, Practitioner, Packer).
- **Q4. Does a new Member bundle reach existing businesses?** Proposed: a
  business that never changed its Member role gets the new default, with a
  release note that says in plain words what Members can now see (order
  totals and payments) and do. A business that saved its own Member keeps
  its list, plus implied holds — which means its Members who move orders
  also start seeing order money, since `order:stage` implies `order:read`.
  The alternative is to freeze today's Member for every existing business as
  a saved row, so only new businesses get the new default.
