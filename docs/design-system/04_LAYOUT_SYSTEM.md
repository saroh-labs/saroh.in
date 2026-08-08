# 04 · Layout System (Page Templates)

> **Design language:** Saroh Canvas — calm, content-first, single-product.
> A small set of **reusable page templates** so every screen answers
> _Where am I / What can I do / What next_ the same way, and so pages stop
> re-inventing their own width, header, and spacing.
>
> **Docs-only.** Real routes are mapped below; every recommendation states _why_.

---

## 1. The problem we are fixing

Today **every page hand-rolls its own container and header**. There is no shared
layout primitive, so widths and heading markup drift page to page:

| Route                              | Container   | Source                                     |
| ---------------------------------- | ----------- | ------------------------------------------ |
| `app/page.tsx` (stores home)       | `max-w-4xl` | `<main className="mx-auto max-w-4xl p-8">` |
| `app/stores/[storeId]/layout.tsx`  | `max-w-5xl` | store shell                                |
| `app/leads/[leadId]/page.tsx`      | `max-w-3xl` | lead detail                                |
| `app/stores/new/page.tsx`          | `max-w-4xl` | create store                               |
| `app/onboarding/page.tsx`          | `max-w-lg`  | onboarding                                 |
| `app/analytics/page.tsx`           | `max-w-5xl` | analytics                                  |
| `app/notifications/page.tsx`       | `max-w-3xl` | notifications                              |
| `app/sites/[siteId]/page.tsx`      | `max-w-6xl` | site editor                                |
| `app/invitations/[token]/page.tsx` | `max-w-md`  | accept invite                              |
| `app-header.tsx`                   | `max-w-6xl` | the shell itself                           |

A repo grep for `max-w-` in `app.saroh.in` returns **eleven different values**
(`max-w-md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, `5xl`, `6xl`, `sm`, `screen`,
`full`). Every page also writes its own `<main className="mx-auto max-w-… p-8">`
wrapper and its own `<h1 className="text-2xl font-semibold">`. There is exactly
**one** `loading.tsx` (`app/loading.tsx`) and its skeleton is hand-rolled with
`animate-pulse` divs rather than the `skeleton.tsx` primitive.

> **Why this hurts.** Inconsistent width and header placement means users
> re-orient on every screen — the primary action, the title, and the content
> edge all move. A shared template system makes the layout _predictable_, which
> is the whole point of "calm, content-first." It also removes ~35 copies of
> bespoke wrapper markup.

### Standard container scale (proposed)

Collapse eleven ad-hoc widths into **four named content widths**, applied by the
template, never hand-picked per page:

| Token             | Width                 | Use                                      |
| ----------------- | --------------------- | ---------------------------------------- |
| `content-narrow`  | `max-w-md`–`max-w-lg` | Auth, single-column forms, wizards       |
| `content-form`    | `max-w-2xl`           | Settings, create/edit forms              |
| `content-default` | `max-w-5xl`           | List + Detail + Dashboard (most screens) |
| `content-wide`    | `max-w-7xl` / fluid   | Analytics grids, Builder, tables         |

Standard page padding: `p-6` mobile → `p-8` desktop (matches today's `p-8`).

---

## 2. Template catalogue

Every template assumes the shell from `03_APPLICATION_SHELL.md` (sidebar + top
bar + breadcrumbs + `PageHeader`). Templates describe only the **content
region**.

### 2.1 Dashboard

- **Grid:** `PageHeader` → responsive stat row (`grid gap-4 md:grid-cols-3/4`
  of `StatCard`) → one or two content bands (recent activity, shortcuts).
- **Width:** `content-default`.
- **Responsive:** stat cards stack 1-col on mobile, 3–4-col on desktop.
- **Routes:** `app/page.tsx` (stores home), the future goal landing pages.
- **Why:** answers "What next" first — the primary CTA and a glanceable status
  summary, not a wall of data.

### 2.2 List / Index

- **Regions:** `PageHeader` (title + primary "New …" CTA) → optional filter/
  search bar → **`DataTable`** (rows) _or_ card grid → `pagination.tsx`.
- **Width:** `content-default` (tables) / `content-wide` for dense data.
- **Responsive:** table → stacked cards under `md`; filters collapse into a
  `sheet`.
- **Routes:** `app/stores/[storeId]/products/page.tsx` (today a hand-rolled
  `<ul className="divide-y rounded-lg border">`), `orders`, `customers`,
  `content`, `members`, `contacts`, `leads`, `services`, `sites`, `bookings`,
  `notifications`.
- **Why:** lists are the most repeated screen in the app; one template with a
  consistent header, empty state, and pagination means users learn the pattern
  once. Today each list renders differently (some `<ul>`, some card grid, no
  pagination anywhere) — the `pagination.tsx` and `table.tsx` primitives are
  **unused**.

### 2.3 Detail / Record

- **Regions:** breadcrumbs → `PageHeader` (record title + status `Badge` +
  actions) → **two columns**: main content (left, ~2/3) + metadata/side panel
  (right, ~1/3, e.g. an `ActivityFeed`).
- **Width:** `content-default`.
- **Responsive:** side panel drops below main content under `lg`.
- **Routes:** `app/leads/[leadId]`, `app/contacts/[contactId]`,
  `app/stores/[storeId]/orders/[orderId]`, `products/[productId]`,
  `customers/[customerId]`, `content/[postId]`, `services/[serviceId]`.
- **Why:** the lead detail today stacks everything in one `max-w-3xl` column of
  bordered `<div>` blocks. A stable main/side split keeps "the record" and "its
  metadata/history" spatially separated so the eye knows where to look.

### 2.4 Create / Wizard

- **Regions:** minimal header (title only, no competing nav) → single-column
  `Form` → optional stepper for multi-step → sticky footer (Back / Continue).
- **Width:** `content-form` (single step) / `content-narrow` (wizard).
- **Routes:** `app/stores/new`, `app/sites/new`, `app/services/new`,
  `app/stores/[storeId]/products/new`, `orders/new`, `customers/new`,
  `content/new`, `app/onboarding` (the canonical wizard).
- **Why:** creation is a focused task — the template deliberately strips
  distractions (one column, one action) to honour "one primary action per
  screen." Today `stores/new` (`max-w-4xl`) and `onboarding` (`max-w-lg`) use
  different widths for the same _kind_ of task.

### 2.5 Analytics

- **Regions:** `PageHeader` (+ date-range control) → KPI stat row → chart grid
  (`chart.tsx`) → optional data table.
- **Width:** `content-wide`.
- **Responsive:** charts reflow 2-col → 1-col; charts scroll-x inside their own
  container, never the page.
- **Routes:** `app/analytics/page.tsx` (today `max-w-5xl`).
- **Why:** analytics is the one screen that legitimately wants width; giving it
  a named `content-wide` template stops it from borrowing an arbitrary size and
  keeps charts from forcing horizontal body scroll.

### 2.6 Settings

- **Regions:** `PageHeader` → optional left sub-nav (sections) → stacked
  `Card`-grouped forms with per-section save.
- **Width:** `content-form`.
- **Routes:** `app/stores/[storeId]/settings`, future org/account settings.
- **Why:** settings are read-rarely, changed-carefully; a narrow single column
  with grouped cards reduces the chance of the user losing their place among
  many fields.

### 2.7 Form (embedded)

- The single-column form body shared by Create, Settings, and inline edits.
- **Primitives:** `form.tsx` + `input`/`textarea`/`select`/`checkbox`/`switch` +
  `label`, validation messages inline, `sonner` toast on submit.
- **Why:** one form skeleton = consistent label position, error placement, and
  submit feedback everywhere. Today forms are assembled ad hoc from
  `input`/`label`/`button` without the `form.tsx` wrapper (0 `@saroh/ui/form`
  imports in the app).

### 2.8 Empty state

- **Regions:** centered `EmptyState` (icon + heading + one-line explainer +
  single primary CTA) inside a dashed border.
- **Routes:** already exists ad hoc as `components/stores/stores-empty-state.tsx`
  and the inline "no products" block in `products/page.tsx`.
- **Why:** empty is a user's _first_ impression of a feature — a consistent,
  encouraging template with one clear next action (not a dead end) drives
  activation. Today only Stores has a real empty state; other lists show a bare
  bordered box or nothing.

### 2.9 Auth

- **Regions:** centered card, brand wordmark, single form, no shell chrome.
- **Width:** `content-narrow`, vertically centered (`min-h-[60vh]` pattern
  already used in `app/invitations/[token]/page.tsx`).
- **Routes:** `app/invitations/[token]` (accept invite); sign-in/up live in
  `accounts.saroh.in` (central identity) — same template.
- **Why:** auth screens must feel calm and trustworthy — no nav, no sidebar,
  one thing to do.

### 2.10 Public / Marketing

- **Regions:** marketing top nav + hero + sections + footer; not part of the
  app shell.
- **Routes:** `saroh.in`, `templates.saroh.in`, `docs.saroh.in`,
  `help.saroh.in` (separate apps).
- **Why:** noted for completeness — the app templates deliberately do **not**
  bleed marketing chrome into the product.

### 2.11 Builder (website / store editor)

- **Regions:** full-bleed, **no content max-width**; left tool/section panel +
  center canvas/preview + right inspector; own top bar (Save / Preview /
  Publish).
- **Width:** fluid, full viewport.
- **Responsive:** editing is desktop-first; mobile shows preview + a note.
- **Routes:** `app/sites/[siteId]/page.tsx` (today `max-w-6xl` — too narrow for
  a builder), future store storefront editor.
- **Primitives:** `resizable.tsx` (panels), `tabs`, `scroll-area`, `sheet`.
- **Why:** builders are the one place the standard container is _wrong_; they
  need edge-to-edge canvas. Calling it out as its own template prevents it from
  being crammed into `content-default`.

### 2.12 AI workspace

- **Regions:** conversation/stream column (`content-form` width, centered) +
  optional right context panel; sticky composer at the bottom.
- **Width:** `content-form` for readability of generated text.
- **Routes:** none yet (the **AI** goal in the target IA).
- **Why:** AI output is prose-like — a reading-measure column (not full width)
  keeps it legible, consistent with the Inter/no-clutter typography principle.

---

## 3. Route → template map (all current app.saroh.in routes)

| Route (`app/…/page.tsx`)                  | Template             | Today's width |
| ----------------------------------------- | -------------------- | ------------- |
| `page.tsx` (home)                         | Dashboard            | `max-w-4xl`   |
| `onboarding`                              | Create/Wizard        | `max-w-lg`    |
| `invitations/[token]`                     | Auth                 | `max-w-md`    |
| `stores/new`                              | Create               | `max-w-4xl`   |
| `stores/[storeId]` (layout+overview)      | Dashboard (section)  | `max-w-5xl`   |
| `stores/[storeId]/products`               | List                 | —             |
| `stores/[storeId]/products/new`           | Create               | —             |
| `stores/[storeId]/products/[productId]`   | Detail               | —             |
| `stores/[storeId]/products/categories`    | List                 | —             |
| `stores/[storeId]/orders`                 | List                 | —             |
| `stores/[storeId]/orders/new`             | Create               | —             |
| `stores/[storeId]/orders/[orderId]`       | Detail               | —             |
| `stores/[storeId]/customers`              | List                 | —             |
| `stores/[storeId]/customers/new`          | Create               | —             |
| `stores/[storeId]/customers/[customerId]` | Detail               | —             |
| `stores/[storeId]/content`                | List                 | —             |
| `stores/[storeId]/content/new`            | Create               | —             |
| `stores/[storeId]/content/[postId]`       | Detail               | —             |
| `stores/[storeId]/content/categories`     | List                 | —             |
| `stores/[storeId]/members`                | List                 | —             |
| `stores/[storeId]/settings`               | Settings             | —             |
| `sites`                                   | List                 | —             |
| `sites/new`                               | Create               | —             |
| `sites/[siteId]`                          | Builder              | `max-w-6xl`   |
| `contacts`                                | List                 | —             |
| `contacts/[contactId]`                    | Detail               | —             |
| `leads`                                   | List                 | —             |
| `leads/[leadId]`                          | Detail               | `max-w-3xl`   |
| `pipeline`                                | List (board variant) | —             |
| `services`                                | List                 | —             |
| `services/new`                            | Create               | —             |
| `services/[serviceId]`                    | Detail               | —             |
| `bookings`                                | List                 | —             |
| `analytics`                               | Analytics            | `max-w-5xl`   |
| `notifications`                           | List                 | `max-w-3xl`   |

**Coverage:** 35 route files collapse into **8 distinct content templates**
(Dashboard, List, Detail, Create/Wizard, Settings, Analytics, Auth, Builder),
plus Form/Empty as embedded sub-templates. Marketing and AI-workspace round out
the full set for the target IA.

> **Why 8 templates, not 35 layouts.** If the same eight shapes cover every
> route, a user who learns one List page can use every List page; the team
> builds new screens by choosing a template, not designing a layout. That is the
> mechanism that turns "consistent" from an aspiration into the default.

---

## 4. Responsive rules (all templates)

| Breakpoint      | Behavior                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `< md` (mobile) | Single column; sidebar → `sheet` drawer; tables → stacked cards; filters → `sheet`; content padding `p-6`                         |
| `md–lg`         | Two-column detail collapses to stacked; stat rows 2-col                                                                           |
| `≥ lg`          | Full shell: sidebar visible, detail main/side split, stat rows 3–4-col                                                            |
| Any             | Wide content (tables, charts, code) scrolls inside its own `overflow-x-auto` container — the page body never scrolls horizontally |

---

## 5. What to build (feeds `05_COMPONENT_LIBRARY.md`)

The templates depend on a few **missing** composed components:
`PageHeader`, `StatCard`, `DataTable` (wraps `table` + `pagination`),
`EmptyState`, `ActivityFeed`, `AppSidebar`, plus the four named container
widths as Tailwind utilities. Everything else (`card`, `tabs`, `form`,
`chart`, `skeleton`, `sheet`, `resizable`) already exists in `@saroh/ui`.
