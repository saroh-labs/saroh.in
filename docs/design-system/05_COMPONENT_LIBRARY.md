# 05 · Component Library

> **Design language:** Saroh Canvas — calm, content-first, single-product.
> One shared component system (`@saroh/ui`, `packages/ui/src/components/ui/`)
> across every app, one brand accent (`--brand`, blue-600), Inter, no heavy
> shadows/gradients/glass.
>
> **Docs-only.** Usage numbers below are from grepping `apps/` + `packages/` for
> `@saroh/ui/<name>` subpath imports. Every recommendation states _why_.

---

## 1. Two facts that frame the whole audit

1. **`@saroh/ui` is mostly latent.** Of the 45 component files in
   `packages/ui/src/components/ui/`, only a handful are actually imported by
   `app.saroh.in`. Repo-wide subpath-import counts:

    | Used a lot | count | Used a little    | count | **Unused (0 imports anywhere)**                                                                                                                                                                                                                                                                                                                                                               |
    | ---------- | ----- | ---------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `chart`    | 232   | `textarea`       | 10    | accordion, alert, alert-dialog, aspect-ratio, **avatar**, **breadcrumb**, calendar, carousel, checkbox, collapsible, **command**, context-menu, **dialog**, **drawer**, form, hover-card, menubar, **pagination**, popover, progress, radio-group, resizable, scroll-area, separator, **sheet**, **skeleton**, slider, **sonner**, switch, **table**, **tabs**, toggle, toggle-group, tooltip |
    | `card`     | 226   | `select`         | 10    |                                                                                                                                                                                                                                                                                                                                                                                               |
    | `button`   | 139   | `dropdown-menu`  | 10    |                                                                                                                                                                                                                                                                                                                                                                                               |
    | `input`    | 56    | `theme-provider` | 6     |                                                                                                                                                                                                                                                                                                                                                                                               |
    | `label`    | 54    | `lib`            | 4     |                                                                                                                                                                                                                                                                                                                                                                                               |
    | `badge`    | 38    |                  |       |                                                                                                                                                                                                                                                                                                                                                                                               |
    | `wordmark` | 35    |                  |       |                                                                                                                                                                                                                                                                                                                                                                                               |

    > In `app.saroh.in` alone the picture is even starker: `button` 39, `input`
    > 17, `label` 16, `badge` 16, `card` 10, `textarea` 5, `select` 2,
    > `dropdown-menu` 1, `wordmark` 1, `theme-provider` 1 — **and nothing else.**
    > Every primitive the shell redesign (`03`) needs — `command`, `sheet`,
    > `breadcrumb`, `avatar`, `tooltip`, `dialog` — is already built and sitting
    > at zero usage. The gap is adoption, not authoring.

    _(`chart`'s 232 is concentrated in `apps/ui.saroh.in`, the component gallery,
    not in the product.)_

2. **There are three overlapping component sources — a real duplication risk:**

    | Source                                  | What it is                                                                                                                                          | Problem                                                                                                                                                                                                |
    | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `@saroh/ui` (`packages/ui`)             | the intended shared library (45 files)                                                                                                              | correct home                                                                                                                                                                                           |
    | **`apps/app.saroh.in/components/ui/`**  | a **38-file local copy** of shadcn (button, dialog, table, tabs, command, sheet, skeleton, **toast**, **toaster**, **use-toast**, navigation-menu…) | duplicates `@saroh/ui`; the app imports from **both** — see `@/components/ui/button` (×3), `@/components/ui/dialog`, `@/components/ui/toast` (×2), `@/components/ui/use-toast` alongside `@saroh/ui/*` |
    | **`@saroh/charts`** (`packages/charts`) | a large gallery of chart _variants_ (area/bar/line/pie/radar/radial, dozens of files) built on top of chart primitives                              | overlaps `@saroh/ui/chart`; only referenced by `apps/ui.saroh.in`                                                                                                                                      |

    > **Why this matters.** Two `Button`s and two toast systems mean two behaviors,
    > two a11y baselines, two things to fix when the brand token changes. The
    > single-product principle requires **one** source of truth: `@saroh/ui`.

---

## 2. Full primitive audit (all 45 files)

Category legend — **Reusable** (keep as-is), **Adopt** (good, but unused in the
product; wire it into the shell/templates), **Needs-redesign** (exists but should
change), **Duplicate** (collides with another source), **Deprecated** (remove).

| #   | Primitive        | Category        | Used in app.saroh.in?          | Notes / why                                                                                                                              |
| --- | ---------------- | --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `accordion`      | Reusable        | no                             | FAQ/settings disclosure; fits progressive disclosure                                                                                     |
| 2   | `alert`          | Adopt           | no                             | Inline page-level messaging; needed for form/section notices                                                                             |
| 3   | `alert-dialog`   | Adopt           | no                             | **Destructive confirms** (delete store/product) — currently no confirm pattern exists                                                    |
| 4   | `aspect-ratio`   | Reusable        | no                             | Media/thumbnails in Builder & templates                                                                                                  |
| 5   | `avatar`         | Adopt           | no                             | Needed for user menu (§03) + members/customers lists                                                                                     |
| 6   | `badge`          | Reusable        | **yes (16)**                   | Status pills; keep, standardize variants (§3)                                                                                            |
| 7   | `breadcrumb`     | **Adopt (key)** | no                             | Deep-route trail (§03 §5); 0 imports repo-wide                                                                                           |
| 8   | `button`         | Reusable        | **yes (39)**                   | Most-used; anchor of the system (§3)                                                                                                     |
| 9   | `calendar`       | Adopt           | no                             | Bookings/appointments date picking                                                                                                       |
| 10  | `card`           | Reusable        | **yes (10)**                   | Core surface; keep                                                                                                                       |
| 11  | `carousel`       | Reusable        | no                             | Marketing/template previews; low product need                                                                                            |
| 12  | `chart`          | Reusable        | no (232 elsewhere)             | Analytics; **see `@saroh/charts` duplication** (§1)                                                                                      |
| 13  | `checkbox`       | Reusable        | no                             | Forms, bulk-select in `DataTable`                                                                                                        |
| 14  | `collapsible`    | Reusable        | no                             | Sidebar groups, filters                                                                                                                  |
| 15  | `command`        | **Adopt (key)** | no                             | ⌘K palette (§03 §4); highest-leverage unused primitive                                                                                   |
| 16  | `context-menu`   | Reusable        | no                             | Row right-click actions (optional)                                                                                                       |
| 17  | `dialog`         | **Adopt (key)** | no                             | Modals; also wraps `command`; **local dup exists**                                                                                       |
| 18  | `drawer`         | Needs-redesign  | no                             | Overlaps `sheet`; pick **one** slide-over (§3)                                                                                           |
| 19  | `dropdown-menu`  | Reusable        | **yes (1)**                    | Org switcher, user menu, quick-create                                                                                                    |
| 20  | `form`           | **Adopt (key)** | no                             | RHF+zod wrapper; forms today skip it (§04 §2.7)                                                                                          |
| 21  | `hover-card`     | Reusable        | no                             | Rich hover previews; nice-to-have                                                                                                        |
| 22  | `input`          | Reusable        | **yes (17)**                   | Core form field                                                                                                                          |
| 23  | `label`          | Reusable        | **yes (16)**                   | Pairs with input; keep                                                                                                                   |
| 24  | `menubar`        | Deprecated      | no                             | Desktop-app menubar; no product use; also the source of a prior DTS build regression (see repo memory) — **remove from the app surface** |
| 25  | `pagination`     | **Adopt (key)** | no                             | No list paginates today (§04 §2.2)                                                                                                       |
| 26  | `popover`        | Reusable        | no                             | Filters, date pickers, inline pickers                                                                                                    |
| 27  | `progress`       | Reusable        | no                             | Upload/onboarding progress                                                                                                               |
| 28  | `radio-group`    | Reusable        | no                             | Single-choice forms                                                                                                                      |
| 29  | `resizable`      | Adopt           | no                             | Builder panels (§04 §2.11)                                                                                                               |
| 30  | `scroll-area`    | Adopt           | no                             | Sidebar, notification slide-over, long lists                                                                                             |
| 31  | `select`         | Reusable        | **yes (2)**                    | Native-ish select; keep                                                                                                                  |
| 32  | `separator`      | Reusable        | no                             | Sidebar sections, header dividers                                                                                                        |
| 33  | `sheet`          | **Adopt (key)** | no                             | Mobile nav + notification center (§03)                                                                                                   |
| 34  | `skeleton`       | **Adopt (key)** | no                             | Loading states; `app/loading.tsx` hand-rolls `animate-pulse` instead                                                                     |
| 35  | `slider`         | Reusable        | no                             | Range inputs (pricing/filters)                                                                                                           |
| 36  | `sonner`         | **Adopt (key)** | no (imports `sonner` directly) | Toast; app uses raw `sonner` + old `use-toast` — consolidate here (§3)                                                                   |
| 37  | `switch`         | Reusable        | no                             | Boolean settings                                                                                                                         |
| 38  | `table`          | **Adopt (key)** | no                             | Lists use `<ul divide-y>`; wrap into `DataTable` (§4)                                                                                    |
| 39  | `tabs`           | **Adopt (key)** | no                             | `store-nav.tsx` hand-rolls tabs (§03 §6)                                                                                                 |
| 40  | `textarea`       | Reusable        | **yes (5)**                    | Multiline field                                                                                                                          |
| 41  | `theme-provider` | Reusable        | **yes (1)**                    | Custom (not shadcn); dark mode                                                                                                           |
| 42  | `toggle`         | Reusable        | no                             | Toolbar toggles (Builder)                                                                                                                |
| 43  | `toggle-group`   | Reusable        | no                             | Segmented controls                                                                                                                       |
| 44  | `tooltip`        | Adopt           | no                             | Collapsed-sidebar labels, icon buttons                                                                                                   |
| 45  | `wordmark`       | Reusable        | **yes (1)**                    | Custom brand mark; keep                                                                                                                  |

**Duplicate/deprecated flags (cross-source):**

| Item                                                       | Verdict                 | Why                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app.saroh.in/components/ui/*` (38 files)             | **Duplicate — retire**  | Shadow copy of `@saroh/ui`; the app imports from both, so `Button`/`dialog` exist twice                                                                                                                               |
| `components/ui/toast.tsx` + `toaster.tsx` + `use-toast.ts` | **Deprecated**          | Old shadcn toast; the product already standardizes on `sonner` (see `app/providers.tsx`) — two toast systems is a bug surface                                                                                         |
| `@saroh/charts` (package)                                  | **Duplicate — clarify** | Chart-variant gallery overlapping `@saroh/ui/chart`; only used by `ui.saroh.in`. Keep as a _showcase/recipes_ package or fold recipes into `@saroh/ui/chart`, but the product should import **one** chart entry point |
| `menubar`                                                  | **Deprecated**          | No product surface + past DTS build regression                                                                                                                                                                        |

---

## 3. Key component specs

For each: **Purpose · Variants · States · Accessibility · Spacing · Usage rules
· Anti-patterns.** These are the components the product touches daily.

### Button — `button.tsx`

- **Purpose:** all clickable actions.
- **Variants:** `default` (= `--primary`, slate-900 — the neutral solid),
  `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `sm/default/lg/
icon`. **Add a `brand` variant** using `bg-brand text-brand-foreground` so the
  _one_ accent action per screen is visibly the primary CTA — today `--primary`
  is near-black, not the blue brand, so nothing on screen carries the accent.
- **States:** hover, focus-visible ring (`--ring`), active, `disabled`, loading
  (spinner + `aria-busy`).
- **A11y:** real `<button>`/`asChild` `<a>`; focus ring never removed; icon-only
  buttons require `aria-label` + `tooltip`.
- **Spacing:** `h-9 px-4` default; `gap-2` icon+label.
- **Rules:** exactly **one** primary/brand button per view (Saroh Canvas);
  secondary = `outline`/`ghost`.
- **Anti-patterns:** two solid buttons side by side; color alone signalling
  destructive without label; disabled with no explanation.

### Input / Form — `input.tsx`, `textarea.tsx`, `select.tsx`, `label.tsx`, `form.tsx`

- **Purpose:** data entry; `form.tsx` = RHF + zod + accessible error wiring.
- **States:** default, focus, `disabled`, `invalid` (`aria-invalid` + message),
  read-only.
- **A11y:** every field a `<label htmlFor>`; errors via `aria-describedby`;
  never placeholder-as-label.
- **Spacing:** `h-9`, label→field `gap-1.5`, field→field `gap-4`.
- **Rules:** always compose via `form.tsx` (validation + error slots for free).
- **Anti-patterns:** the current pattern of raw `input`+`label`+`button` without
  `form.tsx` (0 `@saroh/ui/form` imports) — inconsistent error handling.

### Card — `card.tsx`

- **Purpose:** grouping surface (StatCard, form sections, list items).
- **Anatomy:** `CardHeader`/`Title`/`Description` · `CardContent` · `CardFooter`.
- **A11y:** clickable cards wrap a single anchor; don't nest interactive controls
  inside a card-wide link.
- **Spacing:** `p-6`, `gap-6` between cards.
- **Rules:** `border` + `bg-card`, **no drop shadows** (Saroh Canvas: flat).
- **Anti-patterns:** shadow stacks, gradients, nested cards-in-cards.

### Table / DataTable — `table.tsx` (+ missing `DataTable`)

- **Purpose:** dense records (products, orders, customers, members).
- **States:** loading (`skeleton` rows), empty (`EmptyState`), row hover, sort,
  selected.
- **A11y:** semantic `<table>` with `<th scope>`; sortable headers are buttons.
- **Rules:** wrap in `overflow-x-auto`; collapse to cards under `md` (§04 §4).
- **Anti-patterns:** today's `<ul className="divide-y">` fake tables — no
  headers, no sort, no pagination.

### Tabs — `tabs.tsx`

- **Purpose:** switch views within one record/section (store Overview/Products/…).
- **A11y:** roving tabindex + `aria-selected` come free with the Radix primitive.
- **Rules:** use inside `PageHeader`; ≤ 6 tabs, else overflow.
- **Anti-patterns:** the hand-rolled `store-nav.tsx` link strip that reimplements
  tab semantics and a11y from scratch.

### Dialog / Drawer / Sheet — `dialog.tsx`, `drawer.tsx`, `sheet.tsx`

- **Purpose:** `dialog` = centered modal (confirm, short form); `sheet` = edge
  slide-over (mobile nav, notifications, filters).
- **Decision:** **standardize on `sheet` for slide-overs and retire `drawer`**
  (they overlap; one pattern is calmer and smaller).
- **A11y:** focus trap, `Esc` to close, restore focus, labelled title, scrim.
- **Rules:** modal only for a single focused task; never stack modals.
- **Anti-patterns:** using both `drawer` and `sheet` in the same app; modals for
  content that deserves its own route.

### Badge — `badge.tsx`

- **Purpose:** status/labels (order status, "Soon", counts).
- **Variants:** `default`, `secondary`, `destructive`, `outline`; **add
  semantic `success`/`warning`** so status colour is meaningful, not decorative.
- **A11y:** colour + text (never colour alone).
- **Anti-patterns:** badge as a button; more than 2 badges per row.

### Chart — `chart.tsx` (+ `@saroh/charts`)

- **Purpose:** analytics viz (Recharts wrapper + theming).
- **Rules:** single accent + neutral series; chart scrolls inside its container.
- **Duplication:** pick one entry point for the product (see §1/§2).
- **Anti-patterns:** rainbow palettes; 3-D; charts wider than their container.

### Avatar — `avatar.tsx`

- **Purpose:** user/member identity (user menu, members, comments).
- **States:** image, initials fallback, loading.
- **A11y:** `alt` = person's name.

### Command palette — `command.tsx`

- **Purpose:** ⌘K navigate/create/search/act (§03 §4).
- **A11y:** combobox semantics from CMDK; arrow-key nav; `Esc` closes.
- **Rules:** grouped (Navigate/Create/Search/Actions); global keydown.
- **Anti-patterns:** shipping it hidden behind no trigger (its current state).

### Toast — `sonner.tsx`

- **Purpose:** transient, non-blocking feedback after an action.
- **Rules:** **one** toast system — `sonner`; success/error/info; auto-dismiss;
  actions ("Undo") for reversible ops.
- **A11y:** `aria-live` polite (already in `sonner`).
- **Anti-patterns:** the current dual setup (`sonner` **and** old `use-toast`);
  toasts for validation errors (use inline field errors).

### Empty state — (missing `EmptyState`; ad-hoc `stores-empty-state.tsx`)

- **Purpose:** first-run / no-data with one encouraging next action.
- **Anatomy:** icon → heading → one-line explainer → single primary CTA, dashed
  border, centered.
- **Rules:** every List/Detail/Dashboard has one; exactly one CTA.
- **Anti-patterns:** blank screens (some lists today); dead-end empties.

### Skeleton — `skeleton.tsx`

- **Purpose:** loading placeholders matching final layout.
- **Rules:** shape mirrors content; use for route + data suspense.
- **Anti-patterns:** `app/loading.tsx`'s hand-rolled `animate-pulse` divs
  instead of the primitive; spinners for full-page loads.

### Breadcrumb — `breadcrumb.tsx`

- **Purpose:** ancestor trail on deep routes (§03 §5).
- **A11y:** `<nav aria-label="Breadcrumb">`, current = `aria-current="page"`.
- **Anti-patterns:** breadcrumbs on top-level pages (redundant with sidebar).

### Pagination — `pagination.tsx`

- **Purpose:** page through long lists.
- **A11y:** `<nav aria-label>`, `aria-current` on active page.
- **Rules:** pair with `DataTable`; show total/range.
- **Anti-patterns:** rendering all rows unbounded (today's lists).

### Notification center — (compose `sheet` + existing `notifications-inbox.tsx`)

- **Purpose:** glance at alerts without leaving the page (§03 §4).
- **States:** unread badge (from `unreadNotificationCount()`), read, empty,
  loading.
- **A11y:** slide-over is a labelled `sheet`; "mark read" are buttons.
- **Anti-patterns:** forcing a full-page navigation to `/notifications` to read
  a single alert.

---

## 4. Missing components the product needs

Composed from existing primitives — this is where the design system pays off.

| Component                       | Composed from                                                              | Why the product needs it                                                               |
| ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **PageHeader**                  | `tabs` + `button` + `dropdown-menu`                                        | Kills ~35 hand-rolled `<h1>`/width headers (§04 §1); one place for title + primary CTA |
| **AppSidebar**                  | `Link` + `tooltip` + `sheet` + `separator` + `scroll-area` + `collapsible` | The goal-nav shell (§03 §3); replaces the flat header nav                              |
| **StatCard**                    | `card` + `badge`                                                           | Dashboard/Analytics KPIs (§04 §2.1/2.5) — no consistent metric tile exists             |
| **DataTable**                   | `table` + `pagination` + `checkbox` + `skeleton` + `input`                 | Sortable/paginated/selectable lists (§04 §2.2); replaces `<ul divide-y>`               |
| **EmptyState**                  | `card`/dashed + `button`                                                   | Standardize the one-off `stores-empty-state.tsx` across all lists                      |
| **Timeline / ActivityFeed**     | `avatar` + `separator` + `card`                                            | Record history in Detail pages (leads, orders) — none today                            |
| **FormLayout**                  | `form` + fields + `sonner`                                                 | Consistent Create/Settings forms (§04 §2.7)                                            |
| **Container / width utilities** | Tailwind                                                                   | The 4 named widths (§04 §1) to end the 11-value `max-w-` drift                         |

> **Why "missing" is the highest-value section.** The audit shows Saroh already
> owns nearly every atom it needs; what it lacks are the **molecules** that make
> those atoms consistent (`PageHeader`, `AppSidebar`, `DataTable`, `EmptyState`).
> Building these six or seven composed components — plus retiring the duplicate
> local `components/ui` and the second toast system — is what converts a pile of
> unused primitives into the single, calm, content-first product the Saroh Canvas
> language describes.

---

## 5. Adoption priority (why this order)

1. **Retire duplicates** (`app.saroh.in/components/ui`, old `use-toast`) — stop
   two-of-everything before adding more. _Why: prevents new code picking the
   wrong copy._
2. **PageHeader + Container widths** — instant consistency across all 35 routes.
   _Why: highest visible calm-payoff, lowest risk._
3. **AppSidebar + Command palette (`command`) + `sheet`** — the shell (§03).
   _Why: biggest navigation-cost reduction._
4. **DataTable (`table`+`pagination`) + EmptyState + `skeleton`** — the List
   template (§04), the app's most repeated screen.
5. **`form` adoption + `sonner` consolidation** — consistent input & feedback.
6. **`chart` entry-point decision** vs `@saroh/charts` — before Analytics grows.
