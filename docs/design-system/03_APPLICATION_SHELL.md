# 03 · Application Shell

> **Design language:** Saroh Canvas — calm, content-first, single-product.
> One primary action per screen, progressive disclosure, and every screen must
> answer **Where am I / What can I do / What next**. This document redesigns the
> chrome that wraps every authenticated page in `apps/app.saroh.in`.
>
> **Docs-only.** Nothing here changes code. Every path is real; every
> recommendation states _why_ it lowers navigation cost.

---

## 1. Where we are today

The entire authenticated shell is a **single flat top bar**, rendered once in
the root layout:

- `apps/app.saroh.in/app/layout.tsx` mounts `<AppHeader />` above `{children}`.
- `apps/app.saroh.in/components/shared/app-header.tsx` renders: `<Wordmark>` →
  `OrganizationSwitcher` → a horizontal `<nav>` of 8 links
  (`Stores · Sites · Contacts · Leads · Pipeline · Services · Bookings ·
Analytics`) → a `Notifications` link with an unread pill → `SignOutButton`.
- The nav is `hidden lg:flex` — **there is no mobile navigation at all** below
  `lg`; the links simply vanish.
- The store section (`app/stores/[storeId]/layout.tsx`) re-implements _its own_
  mini-chrome: a `← Dashboard` link, a **second** `OrganizationSwitcher`, a
  hand-rolled `<h1>`, and `StoreNav` (`components/stores/store-nav.tsx`) — a
  hand-rolled horizontal tab strip.

### What the flat header cannot do

| Missing capability      | Consequence for the user                                                                                 | Primitive that already exists, unused            |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Sidebar / goal grouping | 8+ peer links compete for attention; no "Where am I" anchor; nav does not scale to the target 10-goal IA | `sheet.tsx` (mobile), plan a new `AppSidebar`    |
| Global search           | No way to jump to a store/contact/order by name — user must drill by hand                                | — (needs Search input)                           |
| Command palette (⌘K)    | Power users cannot navigate or act by keyboard; every action costs a mouse traversal                     | `command.tsx` (CMDK) — **0 imports repo-wide**   |
| Quick-create ("+")      | "New store / New contact / New order" are scattered per-page CTAs; no single create affordance           | `dropdown-menu.tsx`                              |
| Breadcrumbs             | Deep routes (`/stores/[id]/products/[id]`) give no trail back up                                         | `breadcrumb.tsx` — **0 imports repo-wide**       |
| Notification center     | `/notifications` is a full-page route; checking messages means leaving the current task                  | `sheet.tsx` + `notifications-inbox.tsx` (exists) |
| Consistent page header  | Every page hand-rolls `<main class="max-w-…"> <h1>` (see §04)                                            | plan a new `PageHeader`                          |

> **Root cause:** the primitives for a modern shell — `command`, `sheet`,
> `breadcrumb`, `dropdown-menu`, `avatar`, `tooltip`, `sonner` — **all ship in
> `@saroh/ui`** (`packages/ui/src/components/ui/`) but are almost entirely
> unused in `app.saroh.in`. The redesign is mostly _assembly_, not new
> primitives.

---

## 2. Target shell anatomy

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOP BAR (h-14, border-b, sticky)                                      │
│  [☰] Wordmark  │ OrgSwitcher ▾ │  🔍 Search (⌘K) …  │ [+] 🔔 (3) [Avatar▾]│
├───────────────┬──────────────────────────────────────────────────────┤
│  SIDEBAR      │  Home › Website › … ← Breadcrumbs (h-10)               │
│  (w-60, collap-│──────────────────────────────────────────────────────│
│   sible w-14) │  PAGE HEADER                                          │
│               │   Title · description         [Secondary] [Primary CTA]│
│  ▸ Home       │   ── tabs ─────────────────────────────                │
│  ▸ Website    │──────────────────────────────────────────────────────│
│  ▸ Customers  │                                                       │
│  ▸ Appoint…   │   CONTENT (single max-width container — see §04)      │
│  ▸ Commerce   │                                                       │
│  ▸ Marketing  │                                                       │
│  ▸ Insights   │                                                       │
│  ▸ Automation │                                                       │
│  ▸ AI         │                                                       │
│  ──────────── │                                                       │
│  ▸ Settings   │                                                       │
└───────────────┴──────────────────────────────────────────────────────┘
```

Three fixed regions + one scrolling region:

1. **Sidebar** — goal navigation (persistent, "Where am I / What can I do").
2. **Top bar** — identity + global actions (org, search, create, alerts, you).
3. **Breadcrumbs + Page header** — local context ("What next", primary action).
4. **Content** — the page (governed by `04_LAYOUT_SYSTEM.md`).

---

## 3. Sidebar (goal navigation)

**Replaces:** the flat 8-link `<nav>` in `app-header.tsx`.

### Structure

| Group  | Item             | Icon (lucide)     | Maps to today's route(s)                   |
| ------ | ---------------- | ----------------- | ------------------------------------------ |
| —      | **Home**         | `LayoutDashboard` | `/`                                        |
| —      | **Website**      | `Globe`           | `/sites`, `/sites/[siteId]`                |
| —      | **Customers**    | `Users`           | `/contacts`, `/leads`, `/pipeline`         |
| —      | **Appointments** | `Calendar`        | `/services`, `/bookings`                   |
| —      | **Commerce**     | `ShoppingBag`     | `/stores`, `/stores/[storeId]/*`           |
| —      | **Marketing**    | `Megaphone`       | _(future)_                                 |
| —      | **Insights**     | `BarChart3`       | `/analytics`                               |
| —      | **Automation**   | `Workflow`        | _(future)_                                 |
| —      | **AI**           | `Sparkles`        | _(future AI workspace)_                    |
| footer | **Settings**     | `Settings`        | `/stores/[storeId]/settings`, org settings |

> **Why grouping beats a flat list.** Today Contacts, Leads, and Pipeline are
> three sibling links even though they are one job ("manage customers"). Under a
> single **Customers** goal, the user makes _one_ decision ("I want to work on
> customers") instead of scanning eight peers. Hick's Law: fewer top-level
> choices = faster selection. It also future-proofs the IA — new sub-features
> (e.g. Segments) slot under a goal instead of lengthening a flat bar that
> already breaks at `lg`.

### Behavior & states

| Concern          | Spec                                                                                                                                                                      | Why                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Collapsible      | Toggle between `w-60` (labels) and `w-14` (icons only); persist choice in a cookie (mirror the existing `active_org` cookie pattern in `lib/organizations`)               | Returns horizontal space to content on laptops; a persistent preference respects the calm, low-friction principle |
| Active state     | Match by route prefix (reuse the `usePathname` + `startsWith` logic already in `store-nav.tsx`); active item = `bg-accent text-accent-foreground` + `aria-current="page"` | "Where am I" answered without reading; consistent with the one styling pattern already in the repo                |
| Collapsed labels | Wrap each icon in `tooltip.tsx` showing the label on hover                                                                                                                | Keeps the icon rail usable — no guessing what a glyph means                                                       |
| Mobile (`< lg`)  | Sidebar becomes an off-canvas drawer via `sheet.tsx`, opened by the `☰` button in the top bar                                                                            | Fixes today's total loss of nav below `lg`                                                                        |
| Sub-nav          | Section landing pages (e.g. a store) keep **local tabs** in the Page Header (§7), not nested sidebar trees                                                                | Progressive disclosure — the global rail stays shallow; depth appears only when you enter a goal                  |

**Build from:** a new `AppSidebar` component composed of `Link` + `cn` +
`tooltip.tsx` + `sheet.tsx` + `separator.tsx`. All primitives exist in
`@saroh/ui`; only the composition is new. Flagged as **Missing** in
`05_COMPONENT_LIBRARY.md`.

---

## 4. Top bar

**Replaces:** the right-hand cluster of `app-header.tsx`.

| Slot          | Component                                                                        | Today                                           | Target                                                                          | Why                                                                                                               |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Menu toggle   | `Button` (icon)                                                                  | —                                               | `☰` collapses sidebar / opens mobile `sheet`                                   | Single control for the primary nav on every breakpoint                                                            |
| Brand         | `wordmark.tsx`                                                                   | present                                         | keep, links to `/`                                                              | Stable anchor                                                                                                     |
| Org switcher  | `OrganizationSwitcher` (`dropdown-menu.tsx` + `active_org` cookie server action) | present, but **duplicated** in the store layout | keep **one** instance in the top bar only                                       | Removes the second switcher in `stores/[storeId]/layout.tsx`; one tenant control, one mental model                |
| Search        | `Input` + `command.tsx`                                                          | **absent**                                      | inline search field that opens the ⌘K palette                                   | Direct object access ("go to _Acme_ order #1042") replaces multi-click drilling — the single biggest nav-cost cut |
| Quick-create  | `dropdown-menu.tsx`                                                              | **absent** (per-page CTAs only)                 | `+` → New store / site / contact / lead / service / order                       | One consistent "create anything" affordance; users stop hunting for the right page's button                       |
| Notifications | `sheet.tsx` + existing `unreadNotificationCount()` + `notifications-inbox.tsx`   | full-page `/notifications` link + unread pill   | bell icon → slide-over inbox; `/notifications` stays as the "see all" deep link | Check alerts **without losing your place** — reduces context-switch cost                                          |
| User menu     | `dropdown-menu.tsx` + `avatar.tsx`                                               | just a `SignOutButton`                          | avatar → profile, theme toggle (`components/common/ThemeToggle.tsx`), sign out  | Consolidates identity actions; frees the bar of a bare sign-out button                                            |

### Command palette (⌘K) — the centerpiece

- **Primitive:** `packages/ui/src/components/ui/command.tsx` (CMDK, wrapped in
  `dialog.tsx`). Currently **0 imports across the whole monorepo** — pure
  latent value.
- **Groups:** _Navigate_ (every sidebar goal + recent routes) · _Create_ (mirror
  the `+` menu) · _Search_ (stores, contacts, leads, orders by name) · _Actions_
  (switch org, toggle theme, sign out).
- **Trigger:** global `⌘K` / `Ctrl-K` keydown; also the top-bar Search field.
- **Why:** collapses _navigate → find → act_ into one keystroke-driven surface.
  For a content-first product where the same user returns daily, keyboard
  navigation is the difference between "a tool I fight" and "a tool I fly." It
  also gives search a home before per-entity search backends exist — start with
  client-side route + recent-item matching, add server search later behind the
  same UI.

---

## 5. Breadcrumbs

**Primitive:** `breadcrumb.tsx` (**0 imports repo-wide**). Render in a thin bar
between the top bar and page header, on **detail/nested routes only** (skip on
top-level goal pages, where the sidebar already answers "Where am I").

| Route                                    | Breadcrumb                                |
| ---------------------------------------- | ----------------------------------------- |
| `/stores/[storeId]/products/[productId]` | Commerce › _Store_ › Products › _Product_ |
| `/stores/[storeId]/orders/[orderId]`     | Commerce › _Store_ › Orders › #1042       |
| `/contacts/[contactId]`                  | Customers › Contacts › _Name_             |

> **Why.** The store section is 3–4 levels deep. Today the only way up is a
> single `← Dashboard` link that jumps all the way to root, skipping every
> intermediate level. Breadcrumbs give a one-click return to _any_ ancestor and
> continuously reinforce location — essential once Commerce nests products,
> variants, categories, and orders.

---

## 6. Page header pattern

**Replaces:** the per-page hand-rolled `<main class="max-w-…"><h1>` seen in
`app/page.tsx`, `app/stores/new/page.tsx`, `app/analytics/page.tsx`,
`app/notifications/page.tsx`, `app/leads/[leadId]/page.tsx`, etc. (each picks
its own width and heading markup — catalogued in `04_LAYOUT_SYSTEM.md`).

A single `PageHeader` component (**Missing** — see `05`) with slots:

```
Title (h1, text-2xl font-semibold)      [Secondary btn] [PRIMARY CTA]
Description (text-sm text-muted-foreground)
──────── optional Tabs (tabs.tsx) ────────
```

Rules:

- **Exactly one** primary CTA (`Button` default variant) per header — enforces
  the "one primary action per screen" principle.
- Secondary actions use `variant="outline"`/`"ghost"`, or collapse into a
  `dropdown-menu` "⋯" when there are 3+.
- Local section navigation (the store's Overview/Products/Orders/…) becomes
  `tabs.tsx` inside the header, replacing the hand-rolled `store-nav.tsx`.

> **Why one component.** A shared `PageHeader` makes "What can I do here" appear
> in the _same place, same style, every screen_. Users stop re-learning each
> page's layout; the primary action is always top-right. It also removes ~35
> copies of bespoke header markup, killing the width/heading drift documented in
> §04.

---

## 7. Primary / secondary action placement

| Location                       | Use                                                              | Example                                        |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------- |
| Page header, top-right         | The screen's single primary action                               | "New store" (`app/page.tsx`), "Create a store" |
| Top-bar `+`                    | Cross-cutting create, from anywhere                              | New contact while viewing a store              |
| Command palette _Create_ group | Keyboard-first create                                            | ⌘K → "New order"                               |
| Row / card inline              | Item-scoped actions                                              | Edit / archive a product row                   |
| Destructive                    | `Button variant="destructive"` inside `alert-dialog.tsx` confirm | Delete store                                   |

> **Why the redundancy is intentional.** The same create action is reachable
> from header, `+`, and ⌘K — three costs for three user modes (deliberate,
> opportunistic, keyboard). Consistent _placement_ (primary always top-right)
> plus consistent _entry points_ means the user never searches for how to act.

---

## 8. Today → Target summary

| Element         | Today (`app-header.tsx`)                           | Target                        | Primitive(s)                                       |
| --------------- | -------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| Primary nav     | flat 8-link bar, `hidden lg:flex`                  | collapsible goal **Sidebar**  | new `AppSidebar` + `sheet`, `tooltip`, `separator` |
| Org switch      | `OrganizationSwitcher`, duplicated in store layout | one instance, top bar         | `dropdown-menu` + `active_org` cookie              |
| Search          | none                                               | inline field + ⌘K             | `input` + `command`                                |
| Command palette | none                                               | ⌘K global                     | `command` + `dialog`                               |
| Quick-create    | per-page CTAs                                      | top-bar `+`                   | `dropdown-menu`                                    |
| Notifications   | `/notifications` page + pill                       | bell → slide-over + "see all" | `sheet` + `notifications-inbox`                    |
| User menu       | bare `SignOutButton`                               | avatar dropdown               | `dropdown-menu` + `avatar`                         |
| Breadcrumbs     | none (single `← Dashboard`)                        | ancestor trail on deep routes | `breadcrumb`                                       |
| Page header     | hand-rolled per page                               | shared `PageHeader` + `tabs`  | new `PageHeader` + `tabs`                          |
| Mobile nav      | disappears `< lg`                                  | `sheet` drawer                | `sheet`                                            |

**Net:** the shell redesign needs **two** new composed components (`AppSidebar`,
`PageHeader`) and otherwise assembles primitives that already ship in
`@saroh/ui` and are sitting unused.
