# 02 · Information Architecture — Saroh Canvas

> How the product is organised, navigated, and switched between.
> Companion docs: [01 Philosophy](./01_PRODUCT_DESIGN_PHILOSOPHY.md) · [06 Design Tokens](./06_DESIGN_TOKENS.md) · [07 Style Guide](./07_STYLE_GUIDE.md)

---

## 1. The problem with today's IA

`apps/app.saroh.in` ships a **flat, technical** nav. The single `AppHeader`
(`components/shared/app-header.tsx`) lists modules as engineers built them:

```
Stores · Sites · Contacts · Leads · Pipeline · Services · Bookings · Analytics
```

Two usability problems:

1. **It's a list of tables, not a list of goals.** A user who wants to "get more
   customers" has to know that means _Contacts + Leads + Pipeline_. The nav mirrors the
   database, not the job-to-be-done.
2. **It doesn't scale and doesn't orient.** Eight+ flat items grow unbounded as modules
   ship, the store section falls _outside_ this nav (it has its own mini-shell in
   `app/stores/[storeId]/layout.tsx`), and nothing tells the user _where they are_ — the
   header answers none of the "three questions" from [01 §4](./01_PRODUCT_DESIGN_PHILOSOPHY.md).

Saroh Canvas replaces this with a **goal-based IA**: nav labelled by what the user is
trying to achieve, so a newcomer finds the right area by intent, not by knowing our
schema.

---

## 2. The goal-based top-level IA

Ten goal areas. Each is a _destination a user has an intent for_, not a table name.

| #   | Goal area        | The user's intent                       | Backing routes (today)                                                                                    |
| --- | ---------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | **Home**         | "Show me what needs attention."         | `/`                                                                                                       |
| 2   | **Website**      | "Manage my online presence."            | `/sites`, `/sites/new`, `/sites/[siteId]`                                                                 |
| 3   | **Customers**    | "Manage the people I do business with." | `/contacts`, `/contacts/[contactId]`, `/leads`, `/leads/[leadId]`, `/pipeline`                            |
| 4   | **Appointments** | "Manage services and my calendar."      | `/services`, `/services/new`, `/services/[serviceId]`, `/bookings`                                        |
| 5   | **Commerce**     | "Run my store."                         | `/stores`, `/stores/new`, `/stores/[storeId]` (+ products, orders, customers, content, members, settings) |
| 6   | **Marketing**    | "Reach and message customers."          | _(partial)_ lead messaging / campaigns — backend partial, no dedicated route yet                          |
| 7   | **Insights**     | "Understand how the business is doing." | `/analytics`                                                                                              |
| 8   | **Automation**   | "Let the system do repetitive work."    | _(backend exists)_ automations — no route yet                                                             |
| 9   | **AI**           | "Ask Saroh to do it for me."            | _(deferred, Stage 8)_                                                                                     |
| 10  | **Settings**     | "Configure my org and stores."          | org settings, `/stores/[storeId]/settings`                                                                |

**Why goal-based.** It maps the nav to the user's mental model. "I want more customers"
→ _Customers_; "I want to sell online" → _Commerce_. Recognition beats recall
([01 §5 tactic 2](./01_PRODUCT_DESIGN_PHILOSOPHY.md)), discoverability rises, and the nav
stays stable as we add tables _behind_ each goal instead of adding new top-level items.

---

## 3. Every current route → its goal-based home

All **35** page routes under `apps/app.saroh.in/app` (verified by
`find … -name page.tsx`), each mapped to a goal area. `[…]` = dynamic segment.

| #   | Route                                      | Goal area           | Screen role                           |
| --- | ------------------------------------------ | ------------------- | ------------------------------------- |
| 1   | `/`                                        | Home                | Dashboard / stores overview           |
| 2   | `/onboarding`                              | Home (funnel)       | Zero-org onboarding; create first org |
| 3   | `/notifications`                           | Home (top-bar)      | Notification centre                   |
| 4   | `/invitations/[token]`                     | Home (funnel)       | Accept an org/store invitation        |
| 5   | `/sites`                                   | Website             | Sites list                            |
| 6   | `/sites/new`                               | Website             | Create a site                         |
| 7   | `/sites/[siteId]`                          | Website             | Site detail / editor entry            |
| 8   | `/contacts`                                | Customers           | Contacts list                         |
| 9   | `/contacts/[contactId]`                    | Customers           | Contact detail                        |
| 10  | `/leads`                                   | Customers           | Leads list                            |
| 11  | `/leads/[leadId]`                          | Customers           | Lead detail                           |
| 12  | `/pipeline`                                | Customers           | Sales pipeline (kanban)               |
| 13  | `/services`                                | Appointments        | Services list                         |
| 14  | `/services/new`                            | Appointments        | Create a service                      |
| 15  | `/services/[serviceId]`                    | Appointments        | Service detail                        |
| 16  | `/bookings`                                | Appointments        | Bookings calendar/list                |
| 17  | `/stores`                                  | Commerce            | Stores list                           |
| 18  | `/stores/new`                              | Commerce            | Create a store                        |
| 19  | `/stores/[storeId]`                        | Commerce            | Store overview                        |
| 20  | `/stores/[storeId]/products`               | Commerce            | Products list                         |
| 21  | `/stores/[storeId]/products/new`           | Commerce            | Create a product                      |
| 22  | `/stores/[storeId]/products/[productId]`   | Commerce            | Product detail                        |
| 23  | `/stores/[storeId]/products/categories`    | Commerce            | Product categories                    |
| 24  | `/stores/[storeId]/orders`                 | Commerce            | Orders list                           |
| 25  | `/stores/[storeId]/orders/new`             | Commerce            | Create an order                       |
| 26  | `/stores/[storeId]/orders/[orderId]`       | Commerce            | Order detail                          |
| 27  | `/stores/[storeId]/customers`              | Commerce            | Store customers list                  |
| 28  | `/stores/[storeId]/customers/new`          | Commerce            | Create a store customer               |
| 29  | `/stores/[storeId]/customers/[customerId]` | Commerce            | Store customer detail                 |
| 30  | `/stores/[storeId]/content`                | Commerce            | Blog posts list                       |
| 31  | `/stores/[storeId]/content/new`            | Commerce            | Create a post                         |
| 32  | `/stores/[storeId]/content/[postId]`       | Commerce            | Post editor                           |
| 33  | `/stores/[storeId]/content/categories`     | Commerce            | Post categories                       |
| 34  | `/stores/[storeId]/members`                | Commerce            | Store team/members                    |
| 35  | `/stores/[storeId]/settings`               | Commerce → Settings | Store settings                        |

**Notes on the mapping.**

- `/` doubles as **Home** and the **stores** landing (its `page.tsx` renders "Your
  stores"). Under Saroh Canvas, Home becomes a genuine attention-dashboard and the raw
  stores list moves fully under Commerce, removing the current double duty.
- **Store customers** (rows 27–29) are the store's buyers; **Customers** (rows 8–12) is
  the org-level CRM. They are deliberately different areas — same word, different scope —
  so the nav must label the store one as "Customers" _inside_ the Commerce store context,
  never at top level, to avoid confusion.
- `/stores/[storeId]/settings` lives physically under Commerce but conceptually belongs
  to **Settings**; surface it in both the store's own tabs and the global Settings area.

---

## 4. Second-level navigation (inside a goal area)

Goal areas that back onto several tables use a **section nav** — the pattern the store
section already ships as `StoreNav` (`components/stores/store-nav.tsx`):
`Overview · Products · Orders · Customers · Content · Members · Settings`, with
`aria-current="page"` on the active tab and a "Soon" `Badge` mechanism for not-yet-built
sections. That component is the reference for every goal area's sub-nav.

| Goal area            | Section nav (target)                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Customers            | Contacts · Leads · Pipeline                                                               |
| Appointments         | Services · Bookings                                                                       |
| Commerce (per store) | Overview · Products · Orders · Customers · Content · Members · Settings _(already built)_ |
| Website              | Sites · (per-site: Pages · Settings)                                                      |
| Insights             | Overview · (future report tabs)                                                           |

**Why a section nav rather than deeper top-level items.** It keeps the top level at ten
stable goals (recognition, [01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)) while giving each
area room to grow. The user drills from goal → section → item, a predictable three-step
depth that matches the route structure already on disk.

---

## 5. Responsive nav models

| Breakpoint                    | Primary nav                                                                                                                                                             | Rationale                                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop (≥1024px, `lg`)**   | **Left collapsible sidebar** with the ten goal areas + icons; collapses to an icon rail. Top bar carries switcher, search, quick-create, notifications, user menu.      | Vertical space is the scarce resource on content-heavy admin screens; a sidebar scales to 10+ items without crowding, and the collapse gives power users maximum canvas. Today's flat top nav (`AppHeader`) can't grow past ~8 items — this is the primary structural change. |
| **Tablet (768–1023px, `md`)** | Sidebar **collapsed to an icon rail** by default, expandable on tap; full top bar retained.                                                                             | Preserves the goal-based mental model while reclaiming horizontal space for content.                                                                                                                                                                                          |
| **Mobile (<768px, `sm`)**     | Top bar with a hamburger opening the goal nav in a `Sheet`; a **bottom tab bar** for the 4–5 highest-frequency goals (Home, Customers, Commerce, Appointments, + more). | Thumb-reachable, matches native app expectations, and keeps the most-used destinations one tap away. The `Sheet` primitive already exists in `@saroh/ui`.                                                                                                                     |

All three inherit the **same** goal-based structure — only the presentation changes, so
the mental model is identical across devices ([01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).

---

## 6. Workspace / organization switching

**Today.** Saroh is org-scoped. The active org is stored in an `active_org` cookie,
resolved into an `x-organization-id` header on every API call
(`lib/organizations/service.ts`, `lib/api/http.ts`). The `OrganizationSwitcher`
(`components/organizations/organization-switcher.tsx`) is a `DropdownMenu` of the user's
orgs; selecting one calls the `setActiveOrganization` server action (guarded — picking an
org you don't belong to is rejected, not silently 403'd downstream) and `router.refresh()`
so every server component re-fetches under the new tenant. It's rendered in both
`AppHeader` and the per-store layout.

**Target under Saroh Canvas.**

| Aspect            | Recommendation                                                                                                    | Why                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Placement**     | Fixed top-left of the top bar, immediately right of the wordmark.                                                 | Org is the highest-level context ("which business am I in?"); it must be the first thing read and never move ([01](./01_PRODUCT_DESIGN_PHILOSOPHY.md) consistent placement). |
| **One switcher**  | Render it **once** in the shell, not per-layout.                                                                  | The store layout currently duplicates it; a single instance removes drift and the risk of two switchers disagreeing.                                                         |
| **Feedback**      | Keep the guarded action + toast on failure; show a subtle pending state during `router.refresh()`.                | The user must trust that a switch fully re-scoped their data; silent failure would leak the wrong tenant's context.                                                          |
| **Store context** | When inside `/stores/[storeId]`, show the store as a second-level chip next to the org, not a competing switcher. | Preserves the single "where am I" hierarchy: org → store → section.                                                                                                          |

---

## 7. Search, command palette, recent, pinned, quick actions

These five features are the backbone of "recognition over recall"
([01 §5](./01_PRODUCT_DESIGN_PHILOSOPHY.md)). The `command` primitive
(`packages/ui/src/components/ui/command.tsx`, cmdk-based) already ships in `@saroh/ui`
but is **not yet wired into the app** — no `CommandDialog` usage exists in app source.
Wiring it is the single highest-leverage IA improvement.

| Feature                              | What it does                                                                                                                                        | Why it improves usability                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Global search**                    | Persistent search input in the top bar; queries across orgs' entities (contacts, leads, products, orders, sites, bookings).                         | A flat, table-based product forces navigation-then-scan to find one record. Search collapses that to one step — the fastest path from intent to record.                                                                        |
| **Command palette (⌘K / Ctrl-K)**    | Keyboard-first overlay (built on the existing `command` primitive) mixing navigation ("Go to Orders"), actions ("New product"), and search results. | Power users run the whole app without the mouse; it also becomes a _discoverable index_ of everything the app can do, teaching capabilities as a side effect.                                                                  |
| **Recent**                           | Palette section listing recently-visited records/screens.                                                                                           | Users return to the same handful of records; "recent" removes re-navigation and re-searching — the goal-gradient shortcut for repeat work.                                                                                     |
| **Pinned**                           | User-pinned records/screens surfaced in the palette and optionally the sidebar.                                                                     | Lets each user bias the IA toward _their_ highest-frequency destinations without us guessing.                                                                                                                                  |
| **Quick actions (Quick-create "+")** | A top-bar "+" and palette actions to create the common entities (new store, product, order, contact, lead, service, booking, site) from anywhere.   | Creation is the most frequent high-intent action; making it reachable from any screen removes the "navigate to the right list first" tax. Maps directly to the existing `…/new` routes (rows 6, 14, 18, 21, 25, 28, 31 in §3). |

**Sequencing.** Command palette + global search first (they reuse the existing `command`
primitive and the `…/new` routes), then recent/pinned once usage data exists.

---

## 8. Target app shell (summary)

```
┌───────────────────────────────────────────────────────────────────┐
│ Wordmark │ OrgSwitcher ▾ │   [ Search … ⌘K ]   │ + │ 🔔 │ User ▾  │  ← Top bar
├───────────┬───────────────────────────────────────────────────────┤
│ ▸ Home    │  Home › Commerce › Orders                              │  ← Breadcrumb
│ ▸ Website │ ┌───────────────────────────────────────────────────┐ │
│ ▸ Customers│ │ Orders                        [ + New order ]     │ │  ← Page header
│ ▸ Appts   │ │ 42 open · 3 need attention                        │ │     (title, desc,
│ ▸ Commerce│ ├───────────────────────────────────────────────────┤ │      primary CTA)
│ ▸ Marketing│ │  Overview  Products  [Orders]  Customers  …       │ │  ← Section tabs
│ ▸ Insights│ │                                                   │ │
│ ▸ Automat.│ │            content …                              │ │
│ ▸ AI      │ │                                                   │ │
│ ▸ Settings│ └───────────────────────────────────────────────────┘ │
└───────────┴───────────────────────────────────────────────────────┘
   Sidebar (goal nav, collapsible)          Content
```

Every route in §3 renders into this one shell. That is the physical expression of
"one product, one shell" ([01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)) and the answer to
all three orientation questions ([01 §4](./01_PRODUCT_DESIGN_PHILOSOPHY.md)) on every
screen.
