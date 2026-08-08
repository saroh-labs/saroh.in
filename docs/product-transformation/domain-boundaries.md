# Domain boundaries

> Audit-only cycle. **Proposal, not implementation.**
> Every "current" claim cites the repository; every "proposed" statement is a
> recommendation requiring approval.

---

## 1. Current boundaries — as built

**CONFIRMED** from `packages/database/prisma/schema.prisma` and
`apps/api.saroh.in/src/modules/`.

```
┌─ Platform Core ───────────────────────────────────────────────┐
│  Organization · Membership · Team · Project · ProjectModule   │
│  PlatformAdmin · PlatformAdminRoleAssignment · AdminAuditEvent│
│  AdminAccessSession · FeatureFlag(+Override,+Audit)           │
│  Plan · Subscription · BillingWebhookEvent · Job · WebhookEvent│
│  Domain · Media · WaitlistSignup                              │
└───────────────────────────────────────────────────────────────┘
             │
             ├── Store ──────────────────────────────────────────┐
             │     Product · Category · Variant · Inventory      │
             │     Cart · Order · OrderItem                      │
             │     Customer  ← storeId REQUIRED, orgId NULLABLE  │
             │     Post · PostCategory                           │
             │                                                   │
             └── (org-level, no Store) ─────────────────────────┤
                   Contact ← THE org-level person record        │
                     ├─ Lead ─ Pipeline        (Sales CRM)      │
                     ├─ Booking ─ Service      (Appointments)   │
                     ├─ Message ─ Delivery     (Communications) │
                     ├─ Consent                                 │
                     ├─ Submission ─ Form                       │
                     └─ CustomerIdentityLink ──▶ Customer  ⚠ MANUAL
                   Site · Page · PageVersion · Publication      │
                   Automation · AnalyticsEvent                  │
                                                                ┘
```

### 1.1 The two problems this diagram makes visible

**Problem 1 — two competing sub-organization containers.**
`Project` owns capability selection and access. `Store` owns commerce data.
Neither knows about the other. `Project` has no other business meaning:

```prisma
model Project {            // schema.prisma:1153
  organizationId String
  name String
  slug String
  access  ProjectAccess[]
  modules ProjectModule[]
}                          // ← that is the entire model
```

**Problem 2 — person identity is split, and the bridge is manual.**
`Contact` is the org-level person. `Customer` is a _store-level_ person. The
link between them (`CustomerIdentityLink`) is created by a human pressing a
button (`linkedByUserId`, `schema.prisma:1253`).

So a person who books an appointment and then buys a product is **two records**
unless someone reconciles them.

---

## 2. What "Customer Core" already is

**CONFIRMED.** The brief asks for a Customer Core containing identity, contact
points, consent, preferences, tags, notes and an activity timeline, independent
of Sales CRM.

Most of that already exists — under the name `Contact`:

| Customer Core concept     | Exists today?       | Where                                                    |
| ------------------------- | ------------------- | -------------------------------------------------------- |
| Customer identity         | **Yes**             | `Contact.email`, "the primary identity", deduped per org |
| Contact points            | Partial             | `email`, `phone` on `Contact`; no multi-point model      |
| Addresses                 | **No** at org level | address fields live on `Customer` (store-scoped)         |
| Consent                   | **Yes**             | `Consent` → `Contact`                                    |
| Communication preferences | Partial             | via `Consent`                                            |
| Tags                      | **No**              | —                                                        |
| Notes                     | **No**              | —                                                        |
| Segments                  | **No**              | `SavedView` provides saved filters, not segments         |
| Activity timeline         | Partial             | derivable from `bookings`, `messages`, `submissions`     |
| References to orders      | **Manual**          | via `CustomerIdentityLink`                               |

**Conclusion.** Customer Core is roughly 60–80 % built and mis-labelled as CRM.
The remaining genuinely-new pieces are tags, notes, segments and a unified
timeline.

---

## 3. Proposed boundaries

**RECOMMENDATION.** Three tiers. The change is mostly **naming, packaging and
dependency direction** — not new tables.

```
┌─ PLATFORM CORE ───────────────────────────────────────────────┐
│  Tenancy      Organization · Membership · Team                 │
│  Containers   Project/Store  ← see §4, unresolved              │
│  AuthZ        roles · permissions · PlatformAdmin · audit      │
│  Delivery     FeatureFlag · entitlements · Plan · Subscription │
│  Infra        Job queue · WebhookEvent · Media · Domain        │
│  Ops          AdminAuditEvent · AdminAccessSession             │
└───────────────────────────────────────────────────────────────┘
                              │  always on, never user-selectable
┌─ CUSTOMER CORE ───────────────────────────────────────────────┐
│  Person identity (today: Contact)                              │
│  Contact points · addresses · consent · preferences            │
│  Tags · notes · segments                    ← new              │
│  Unified activity timeline                  ← new              │
│  Commerce-customer reconciliation           ← automate         │
└───────────────────────────────────────────────────────────────┘
         ▲          ▲            ▲            ▲          ▲
         │          │            │            │          │
┌────────┴──┐ ┌─────┴─────┐ ┌────┴─────┐ ┌────┴────┐ ┌───┴──────┐
│ COMMERCE  │ │APPOINTMENTS│ │ENGAGEMENT│ │SALES CRM│ │  WEBSITE │
│ catalog   │ │ services   │ │ messages │ │ leads   │ │ sites    │
│ inventory │ │ availability│ │ campaigns│ │ pipeline│ │ pages    │
│ cart/order│ │ bookings   │ │ consent  │ │ stages  │ │ forms    │
└─────┬─────┘ └─────┬──────┘ └──────────┘ └─────────┘ └────┬─────┘
      │             │                                       │
      └──────┬──────┘                                       │
             ▼                                              │
      ┌─────────────┐                                       │
      │  PAYMENTS   │  references orders or bookings        │
      └─────────────┘  — never the reverse                  │
                                                            │
┌─ CROSS-CUTTING (consume events; depend on no capability) ─┴───┐
│  AUTOMATIONS  ← domain events + job queue                      │
│  INSIGHTS     ← events + projections                           │
└────────────────────────────────────────────────────────────────┘
```

### 3.1 Dependency rules

| Rule                                                                              | Rationale                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------- |
| Customer Core depends on nothing but Platform Core                                | It is the shared foundation                     |
| Appointments → Customer Core (**not** Sales CRM)                                  | `Booking.contactId` already points at `Contact` |
| Engagement → Customer Core + consent                                              | `Message` already points at `Contact`           |
| Sales CRM → Customer Core                                                         | `Lead.contactId`                                |
| Commerce → Customer Core                                                          | via reconciliation, once automated              |
| Payments → Commerce **or** Appointments                                           | one direction only; no cycle                    |
| Automations → domain events + job queue                                           | never reaches into a capability                 |
| Insights → events + projections                                                   | read-only consumer                              |
| Website → integrates with Commerce/Appointments/forms, but is not coupled to them | a site can exist with neither                   |

### 3.2 What actually changes in code

**Small.** The dependency edges to retarget are three lines in
`apps/api.saroh.in/src/modules/capabilities/module-registry.ts`:

```ts
{ key: "APPOINTMENTS",   dependencies: ["CRM"] },   // → ["CUSTOMERS"]
{ key: "COMMUNICATIONS", dependencies: ["CRM"] },   // → ["CUSTOMERS"]
{ key: "AUTOMATIONS",    dependencies: ["CRM"] },   // → [] (events only)
```

Plus a new always-on `CUSTOMERS` capability that is not user-selectable, and
scoping the `CRM` module to `Lead`/`Pipeline` surfaces only.

**No data migration.** No table rename in this step — naming is §4.

---

## 4. Organization vs Project vs Store — DECIDED

> **Decision (2026-08-02, product owner): Option B.**
> An Organization may hold multiple Projects; a Project may hold Stores,
> depending on the business type. `Project` stays the container that owns module
> selection and access; `Store` becomes a child of the Commerce capability.
>
> Consequences captured in §4.1 below. ARCH-003 is unblocked.

Three options were considered:

### Option A — `Store` becomes the merchant-facing container; `Project` retires

Module selection moves from `Project` to `Store`. One container, one mental
model ("your shop", "your second location").

- **For.** Simplest merchant model. Commerce data already hangs off `Store`.
- **Against.** Largest migration — `ProjectModule` → `StoreModule`,
  `ProjectAccess` → `StoreAccess`. Awkward for a merchant who has a website and
  no shop: they would own a "Store" that sells nothing.

### Option B — `Project` is the container; `Store` becomes a Commerce child

`Project` is renamed in the UI (Business / Brand / Location) and keeps module
selection. `Store` becomes an implementation detail of the Commerce capability.

- **For.** Smallest migration; the module/access model already works this way.
- **Against.** `Customer.storeId` stays store-scoped, so §1.1 Problem 2 is
  unresolved by this alone.

### Option C — single-container merchants skip both

Most SMBs have exactly one. Organization _is_ the container; Project/Store are
an advanced concept surfaced only for multi-location merchants.

- **For.** Best default UX — no one is asked to name a "Project" on day one.
- **Against.** Two code paths, or a hidden default container.

### 4.1 What Option B commits us to

**Chosen.** The resulting shape:

```
Organization              the business / the account
   └── Project            a brand, business unit or location
         ├── modules      capability selection + access   (already true)
         └── Store        a Commerce child — only exists if Commerce is on
               └── Product · Order · Customer
```

**Follows from the decision:**

1. **`Store` stops being a peer of `Project`.** Today they are siblings under
   Organization with no relation between them. `Store` gains a `projectId`.
   _Migration: backfill from each Store's Organization → its default Project._
2. **A merchant with no shop never sees a Store.** Website-only and
   bookings-only businesses have a Project and no Store — which is the awkwardness
   Option A could not avoid.
3. **The word "Project" should not appear in the merchant UI.** It is an internal
   container name. Surface a concrete label per business type (Brand, Location,
   Business) and hide the picker entirely until a second one exists. This part of
   the earlier Option-C recommendation still applies and costs nothing.
4. **`Customer.storeId` remains store-scoped**, so this decision does **not**
   resolve the identity split on its own — that is SEC-005 / ARCH-002, which
   stays a separate and still-required piece of work.

**Open sub-question for the ADR.** Should `Customer` move from `storeId` to
`projectId` (or to `organizationId`) as part of ARCH-002? Option B makes
org-scoping the natural target, since a person who buys from two of a merchant's
stores is one customer of that business. Recommended, but it is a data migration
and belongs in the ARCH-002 staging, not here.

---

## 5. Domain events

**RECOMMENDATION.** Automations currently has no stable contract to consume.
The infrastructure to fix that already exists — `prisma-job-queue.ts` and
`JobHandlerRegistry` are durable and typed.

Proposed initial event set, all emitted transactionally with their mutation
(outbox-style, so an event cannot exist without its write, or vice versa):

```
customer.created · customer.merged
product.created · product.inventory_low
cart.abandoned
order.created · order.paid · order.fulfilment_required · order.fulfilled
payment.failed · payment.succeeded
booking.created · booking.cancelled
message.delivered · message.failed
site.published
```

**Dependency rule.** Automations subscribes to events. It must not import from
Commerce, Appointments or Engagement.

---

## 6. Boundaries to hold

Carried from the brief; all currently true and worth not breaking.

1. `api.saroh.in` is the only DB-facing service. No second backend, no frontend
   reaching Postgres.
2. Public surfaces derive the owning organization **server-side** from the
   target resource, never from client input. Verified in
   `enquiry.controller.ts`, `public-payments.controller.ts`,
   `waitlist.controller.ts`.
3. Merchant sites never inherit Saroh's brand — the `--site-*` layer stays
   separate from Saroh tokens.
4. Disabling a capability stops new activity and **never** deletes history.
5. `AdminAuditEvent` is relation-free on purpose, so deleting a business record
   cannot cascade into the ledger.

---

## 7. Open questions

1. **Organization / Project / Store** — Option A, B or C? (§4) Blocks the ADR.
2. **Does Customer Core own addresses?** They currently live on the
   store-scoped `Customer`. Moving them is a larger migration than the rest.
3. **Is `CUSTOMERS` billable?** If it is always on and not selectable, it
   probably belongs in the base platform fee, which affects the pricing model.
4. **Do segments belong to Customer Core or Insights?** They need event data but
   are authored against customer attributes.
