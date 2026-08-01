# Information architecture

> Audit-only cycle. **Proposal requiring approval.** No navigation was changed.
> Current-state claims verified in-browser 2026-07-31 as an org owner with all
> eight modules enabled.

---

## 1. Current IA

**CONFIRMED.** `apps/app.saroh.in` sidebar:

```
Home
CUSTOMERS      Contacts · Leads · Pipeline
APPOINTMENTS   Appointments · Services · Bookings
COMMERCE       Commerce
WEBSITE        Sites
INSIGHTS       Analytics
               Notifications
SETTINGS       Organization · Modules · Providers
```

### 1.1 What is wrong with it

**It is the module registry rendered as navigation.** The group names are the
capability keys; the ordering is registry order. A merchant is asked to hold the
architecture in their head.

Concrete symptoms:

| Symptom                              | Evidence                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Three separate customer destinations | Contacts, Leads, Pipeline are three top-level items for what a merchant thinks of as "my customers"                                                    |
| Commerce is one flat link            | Products, orders, inventory and fulfilment all live _behind_ `/commerce` → a store, so the merchant's most frequent tasks are two-to-three clicks deep |
| Appointments has three siblings      | Appointments, Services, Bookings — the distinction is internal                                                                                         |
| No global search                     | No way to jump to an order or customer by name                                                                                                         |
| No container switcher in the sidebar | Org switcher is in the top bar; `Project`/`Store` is invisible                                                                                         |

### 1.2 What is already right

**The onboarding already speaks the target language.**
`app/onboarding/modules/page.tsx` asks _"What does your business need to do?"_:

> Show up online · Manage customers & leads · Take appointments · Sell products ·
> Take payments · Message customers · Automate follow-ups · See performance

**This vocabulary is abandoned at the end of onboarding.** The merchant answers
in outcomes and is then handed module names. Carrying it forward is the
single highest-leverage change in this document — and it is largely a renaming
and regrouping exercise, not new surface.

Also right: `Home` already leads with next-best-actions and setup state, which
is the correct foundation for a command centre.

---

## 2. Proposed IA

**RECOMMENDATION.** Commerce-led (per
[`product-north-star.md`](./product-north-star.md) §1), outcome-named, with the
merchant's most frequent work at the top level.

```
🏠  Home                    command centre — attention, then activity

💰  Sell                    [Commerce]
      Orders                ← default landing; the daily job
      Products
      Collections
      Inventory
      Discounts
      Fulfilment
      Returns

📅  Bookings                [Appointments]
      Calendar              ← default landing
      Services
      Availability

👥  Customers               [Customer Core]  ALWAYS PRESENT
      All customers         ← unified: buyers + contacts + bookers
      Segments
      Leads · Pipeline      ← only when Sales CRM is on

🌐  Website                 [Website]
      Pages
      Branding              ← new; see audit §7
      Navigation
      Domains
      Forms

💬  Engage                  [Communications]
      Conversations
      Campaigns
      Templates
      Consent

⚡  Automations             [Automations]
      Rules
      History

📊  Insights                [Insights]

⚙️  Settings
      Business · Team · Capabilities · Payments · Providers · Billing
```

### 2.1 Rules

| Rule                                                      | Why                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Group names are **outcomes**, not module keys             | Matches the onboarding language the merchant already answered in       |
| **Customers is always present**                           | It is Customer Core, not a capability. A merchant always has customers |
| Leads/Pipeline nest **under** Customers                   | They are a Sales-CRM view of a person, not a separate population       |
| Commerce's daily work is top-level                        | Orders is the job; it should not be behind a store picker              |
| Each group has a **default landing**                      | The most frequent task, not an index page                              |
| Inactive capabilities are **discoverable, not invisible** | See §3                                                                 |

### 2.2 Mapping from today

| Today                            | Proposed                                      | Note                                                 |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Contacts                         | Customers → All customers                     | Unified with commerce customers (blocked on SEC-005) |
| Leads, Pipeline                  | Customers → Leads · Pipeline                  | Nested; visible only with Sales CRM                  |
| Commerce                         | Sell → Orders (default) + siblings            | Promotes the daily task                              |
| Appointments, Services, Bookings | Bookings → Calendar · Services · Availability | Bookings/Appointments distinction removed            |
| Sites                            | Website → Pages · Branding · Domains          | Branding is new                                      |
| Analytics                        | Insights                                      | Rename only                                          |
| Settings → Modules               | Settings → Capabilities                       | "Modules" is engineering language                    |

---

## 3. Capability visibility

The brief warns against navigation that changes under the user. Proposal:

1. **Active** — group shown, fully navigable.
2. **Available but off** — shown **dimmed** with a small "Add" affordance. The
   merchant learns the product has it without it being noise.
3. **Unavailable** (flag off / plan excludes) — hidden entirely; discovery
   happens in Settings → Capabilities.

Turning something on never rearranges existing items — the group ungreys in
place. This is what prevents the "my content disappeared" reaction.

---

## 4. Home as command centre

**Extend, do not replace.** Today's Home already has "Do this next" plus a
next-action list with `Setup`/`Overdue` badges.

Proposed structure — **attention first, vanity never**:

```
┌ Needs attention ─────────────────────────────┐   only renders if non-empty
│  3 orders awaiting fulfilment                │
│  1 payment failed                            │
│  2 products out of stock                     │
│  1 unanswered customer message               │
└──────────────────────────────────────────────┘
┌ Finish setup ────────────────────────────────┐   until Activated
│  ▓▓▓▓▓░░░  5 of 8                            │
│  → Connect a payment provider     Quick      │
└──────────────────────────────────────────────┘
┌ Today ───────────────────────────────────────┐
│  Orders · Revenue · Upcoming bookings        │
└──────────────────────────────────────────────┘
┌ Recent activity ─────────────────────────────┐
└──────────────────────────────────────────────┘
```

Adapts to the business model: a bookings-only merchant sees no fulfilment card;
a shop with no Appointments sees no calendar.

---

## 5. Customer record — the differentiating screen

The one screen that proves the positioning. Requires SEC-005 (auto-linking).

```
Priya Sharma                      priya@example.com · +91 …
─────────────────────────────────────────────────────────
Orders 4 · ₹12,400      Bookings 2      Messages 6

[ Timeline ] [ Orders ] [ Bookings ] [ Messages ] [ Notes ]

  12 Jul  Order #1043 delivered              ₹3,200
  08 Jul  Booking — Consultation             completed
  02 Jul  Replied to campaign "Monsoon"
```

**Today this screen cannot be built**: `Customer` (store-scoped) and `Contact`
(org-scoped) are separate records linked only by a manual action.

---

## 6. Empty states

Every empty state should carry: what this is · why it matters · one primary
action · an import or sample-data path where one exists · a visual of the
populated state.

Current `Commerce` empty state does the first three and none of the last two.

**Blocked:** the dev DB has 0 contacts, 0 services, 0 bookings — so every screen
under review _is_ an empty state. Populated-state UX work needs seed data first
(backlog `DATA-001`).

---

## 7. Cross-app IA

| App                  | Role            | Change                                                                          |
| -------------------- | --------------- | ------------------------------------------------------------------------------- |
| `saroh.in`           | Acquisition     | Commerce-led; separate paths per merchant type                                  |
| `accounts.saroh.in`  | Identity only   | Org creation moves into onboarding                                              |
| `app.saroh.in`       | The workspace   | This document                                                                   |
| `sites.saroh.in`     | Merchant's site | Merchant's IA, never Saroh's                                                    |
| `admin.saroh.in`     | Staff           | Deliberately different — an operator must never mistake it for a tenant surface |
| `templates.saroh.in` | Templates       | Organise by outcome/industry; start onboarding from a template                  |
| `docs`/`help`        | Docs            | Split developer docs from merchant help; deep-link from product                 |

---

## 8. Sequencing

1. **Rename and regroup** — no new screens. Carries onboarding vocabulary into
   the shell. Highest value per unit of work.
2. **Promote commerce tasks** — Orders top-level; Sell group.
3. **Capability visibility states** — dimmed-but-discoverable.
4. **Command centre** — extend Home.
5. **Unified customer record** — blocked on SEC-005.
6. **Empty-state system** — blocked on DATA-001.
7. **Global search / command palette.**

---

## 9. Open questions

1. **Container in the sidebar?** Depends on the `Project`/`Store` decision —
   [`domain-boundaries.md`](./domain-boundaries.md) §4.
2. **"Sell" or "Commerce"?** Outcome vs recognised category. Worth testing.
3. **Do Leads/Pipeline nest under Customers, or stay top-level for CRM-heavy
   merchants?**
4. **Does Website move under Sell for commerce-only merchants,** or stay
   top-level for site-first businesses?
