# 00 · Final Report — Saroh Canvas Design-System Audit (Capstone)

> **Status:** Capstone synthesis of the 16-document Saroh Canvas audit. Docs-only —
> nothing here changes UI/app/config code. Every claim is grounded in a real
> route/file and traces to one of the source docs
> [01](./01_PRODUCT_DESIGN_PHILOSOPHY.md)–[16](./16_FIGMA_STRUCTURE.md).
> **Ground truth:** `apps/app.saroh.in` App Router (35 page routes) + `@saroh/ui`
> (46 shadcn/Radix primitives) as of 2026‑07‑20.
> **Anchor:** _Saroh Canvas_ — calm, content-first, single-product; one primary
> action per screen; progressive disclosure; every screen answers _Where am I /
> What can I do / What next_.

**How to read this report.** Sections 1–5 give the five headline scores. Sections
6–9 are the ranked improvement lists (100 UI · 50 UX · 30 inconsistencies · 20
components). Sections 10–13 cover what to leave alone, what becomes global, effort
per milestone, and the file-impact map. Every "why" states the _usability_ payoff,
not appearance.

---

## The one-line finding

Saroh is **not broken — it is unfinished at the composition layer.** The token and
primitive foundation is already good (Readability 6.5, Spacing 6.3), and this
session single-sourced the shell, tokens, font, theme, and wordmark (#91–#102,
#108). What drags the product to a **5.27/10 mean** is that the app _composes_ those
good parts inconsistently: three component sources, two toast systems, eight
container widths, hand-rolled forms, no mobile navigation, and a shell that answers
none of the three orientation questions. The redesign is mostly **assembly of
primitives that already ship unused** — not new authoring.

---

## 1. Overall UX Score — **5.3 / 10**

Product-wide arithmetic mean across all scored cells (from
[10_UX_AUDIT.md](./10_UX_AUDIT.md), 34 screen-groups × 14 categories): **5.27**,
rounded to **5.3**. A functional, coherent-at-the-token-level product that is
unfinished at the composition level.

| Category              | Score   | One-line justification (from [10](./10_UX_AUDIT.md))                                                                                    |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Readability           | **6.5** | Best. Inter, sensible scale, `text-muted-foreground` — the primitive layer carries it.                                                  |
| Spacing               | **6.3** | Consistent `p-8` gutters, `gap`-based rhythm; shadcn tokens do the work.                                                                |
| Empty states          | **5.8** | Good on top-level lists (dashed card + CTA); weak on detail pages / delegated inboxes.                                                  |
| Interaction quality   | **5.4** | Hover + optimistic server actions fine; nothing delightful, some dead-ends.                                                             |
| Information hierarchy | **5.4** | Undermined by mixed heading scales (lead detail) and header/content misalignment.                                                       |
| Error handling        | **5.3** | App-root fail-loud boundary is a strength; dragged by raw-error screens (invitations, `/apps`).                                         |
| Responsiveness        | **5.3** | Grids okay; **the shell has no mobile/tablet nav**, which caps the whole product.                                                       |
| Navigation clarity    | **5.2** | Flat 9-item top nav + a second store-level nav; no breadcrumbs; glyph-only back links.                                                  |
| Accessibility         | **5.2** | Semantic HTML in places (pipeline, `<dl>`); list-as-links, native `<select>`, missing `aria-current`/labels, no form-error association. |
| Visual consistency    | **5.1** | Eight container widths, three list idioms, header ≠ content width — the #1 target.                                                      |
| Discoverability       | **5.1** | Core objects (contacts, leads) can't be created from their own screens.                                                                 |
| User guidance         | **4.5** | Almost no inline "what is this / what next"; forms fail via toast, not guidance.                                                        |
| Forms                 | **4.1** | Lowest applicable. Hand-rolled `useState`, no inline validation, no `aria-invalid`, native `<select>`.                                  |
| Loading states        | **4.0** | Lowest overall. One generic app-root skeleton; zero per-segment loading.                                                                |

**Weakest four = the redesign's priority order:** Loading (4.0) → Forms (4.1) →
Guidance (4.5) → Visual consistency (5.1). Fixing these re-uses existing primitives
and moves the mean toward the 7+ the Saroh Canvas anchor implies.

---

## 2. Visual Consistency Score — **5.1 / 10**

**Justification.** The single biggest visual defect is width and idiom drift
([09_SCREEN_INVENTORY.md](./09_SCREEN_INVENTORY.md) container census;
[04_LAYOUT_SYSTEM.md](./04_LAYOUT_SYSTEM.md)):

- **Eight container widths** across sibling pages (`max-w-md` invitations · `max-w-lg`
  onboarding · `max-w-3xl` lead detail/notifications/bookings · `max-w-4xl` most
  lists · `max-w-5xl` analytics/store shell · `max-w-6xl` header/site editor ·
  `max-w-full` pipeline board). The header sits at `max-w-6xl` while content sits at
  `max-w-4xl`, so **brand and content don't share a left edge** on wide screens.
- **Three list idioms** for the same "list of records" job: dashboard `grid`
  (`app/page.tsx`), CRM `Card` grids (`app/leads`, `app/contacts`), and store
  `<ul className="divide-y">` rows (`products`, `orders`, `customers`, `content`).
- **Three component sources** ([05_COMPONENT_LIBRARY.md](./05_COMPONENT_LIBRARY.md)):
  `@saroh/ui` vs a 38-file shadow `apps/app.saroh.in/components/ui/` (the app imports
  both) vs `@saroh/charts` — two `Button`s, two `dialog`s in one app.
- **Two toast systems**: local Radix `toast`/`toaster`/`use-toast` **and** `sonner`.
- **`--primary` is slate, `--brand` (blue) is on nothing on-screen**
  ([06_DESIGN_TOKENS.md](./06_DESIGN_TOKENS.md) §1) — the accent is defined but
  carries no CTA.

Score is _above_ the 4.x band only because the token layer itself (color, radius,
type) is genuinely single-sourced and consistent — the inconsistency is entirely at
the composition layer, which is fixable with `PageHeader` + container tokens + one
component source. **≈5.1.**

---

## 3. Accessibility Score — **5.2 / 10**

**Justification** (from [13_ACCESSIBILITY_GUIDE.md](./13_ACCESSIBILITY_GUIDE.md),
WCAG 2.2 AA target). Radix gives 30+ primitives correct semantics for free (focus
trap, `aria-*`, roving tabindex), and `form.tsx` wires labels/errors correctly — so
the _component_ floor is high. Page-level and token-level gaps pull it down:

**Confirmed fails / gaps:**

- **`Button variant="destructive"` white text ≈ 3.8:1 — FAILS AA** for normal text
  (`--destructive` red-500). The single most concrete contrast fail.
- **No global `prefers-reduced-motion` override** in `globals.css`; the sheet's
  `slide-in-from-*` at 500ms and dialog `zoom-in-95` still play for motion-sensitive
  users.
- **No skip-to-content link** on the shells — keyboard users tab the whole header
  every page.
- **Card-as-link has no `focus-visible` ring** (`app/leads/page.tsx`) — keyboard
  users can't see which card is focused.
- **Native `<select>` in 10 form components** instead of the accessible shadcn
  `Select`; hand-rolled forms skip `aria-invalid`/`role="alert"`.
- **Touch targets 40px default** (`Button h-10`, `Input h-10`) below the 44px
  ergonomic bar for merchants on phones.
- Notification badge is a bare number (`aria-label` missing); no `<footer>` landmark;
  analytics range selector conveys active state by color only (no `aria-current`/
  `aria-pressed`).

**Passes:** `muted-foreground` on white ≈ 4.76:1 (marginal AA — do not dilute);
`--brand` blue ≈ 5.2:1; `form.tsx` label/error wiring; pipeline is the a11y
high-water mark. Net **≈5.2**, and the two most critical fixes (destructive contrast,
reduced-motion) are one-line token/CSS changes.

---

## 4. Modern UI Score — **5.0 / 10** (derived)

**Justification.** The _foundation_ is thoroughly modern: shadcn/Radix on Tailwind,
CSS-variable tokens with a `.dark` mode, self-hosted variable Inter, Recharts via
`@saroh/ui/chart`, and 46 current primitives. If scored on the stack alone this is a
7–8. But "modern UI" is what the user _sees_, and the app composes the modern kit in
dated ways:

- The modern primitives that define a 2026 app shell — `command` (⌘K), `sheet`,
  `breadcrumb`, `avatar`, `tooltip`, `pagination`, `skeleton`, `table` — are
  **built and sitting at 0 imports** in the product
  ([05_COMPONENT_LIBRARY.md](./05_COMPONENT_LIBRARY.md) §1).
- Instead the app hand-rolls: `animate-pulse` skeletons, `<ul divide-y>` fake
  tables, `useState`+`toast` forms, a flat top-nav that vanishes on mobile, and
  glyph-only `←` back links.
- The one accent (`--brand` blue) is applied to nothing; every button is neutral
  slate, so the UI reads flatter/greyer than a modern accented product.

So: modern parts, pre-modern composition. **≈5.0** — and it rises fast because the
modernization is _adoption_, not authoring (wire `command`, `sheet`, `DataTable`,
the `brand` Button variant).

---

## 5. Scalability Score — **6.5 / 10** (derived)

**Justification.** This is the strongest of the five, thanks to this session's M0
work ([12_IMPLEMENTATION_PLAN.md](./12_IMPLEMENTATION_PLAN.md)):

**Scales well (+):**

- Tokens are single-sourced (`packages/ui/src/globals.css` → Tailwind preset), so a
  brand/radius change reshapes every app at once (#91/#92).
- Shared `AppHeader`, `ThemeProvider`, single-source `Wordmark`, self-hosted Inter,
  and the `@saroh/ui` source-consumption contract (#93–#98) mean new pages inherit
  chrome for free.
- Route structure already models progressive disclosure (list → detail → `/new`);
  goal-based IA slots new tables _behind_ 10 stable goals rather than lengthening a
  flat bar.

**Drags (−):**

- **App-level three-source duplication** (`components/ui/` shadow copy) and **two
  toast systems** mean two of everything to fix when a token changes.
- Flat top-nav overflows at 8+ items and can't hold the 10-goal IA — a structural
  ceiling until the sidebar lands (D‑05).
- Lists fetch all rows (no `pagination`), and `<ul>` fake-tables won't scale past
  ~50 rows.

Foundations now single-sourced pulls this to **≈6.5**; retiring the duplicate
source and the second toast would push it toward 8.

---

## 6. Top 100 UI improvements (ranked by impact)

> Effort: **S** ≤1 day · **M** 2–4 days · **L** 1–2 weeks. Every item is grounded in
> the 16 docs (backlog IDs `D‑xx` from [11](./11_DESIGN_BACKLOG.md); token
> violations from [06 §12](./06_DESIGN_TOKENS.md); a11y from [13](./13_ACCESSIBILITY_GUIDE.md);
> responsive from [14](./14_RESPONSIVE_GUIDE.md); motion from [15](./15_MOTION_GUIDELINES.md)).
> 100 grounded items were produced.

| #   | Improvement                                                                               | Why (usability)                                                                                                                                    | Effort | Files / routes                                                        |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| 1   | **Mobile nav via `Sheet`** (D‑03)                                                         | Below `lg` the nav is `hidden` with no fallback — mobile users can't reach any section. Highest-impact fix; the accessible `Sheet` already exists. | M      | `components/shared/app-header.tsx`, new `mobile-nav.tsx`, `sheet.tsx` |
| 2   | **Retire the shadow `components/ui/` source** (05)                                        | App imports `Button`/`dialog` from two places — two behaviors, two a11y baselines. One source of truth.                                            | M      | `apps/app.saroh.in/components/ui/*` → `@saroh/ui`                     |
| 3   | **Kill the second toast system** (06 §12)                                                 | Local Radix `toast`+`use-toast` runs alongside `sonner` (raw red leak); one consistent feedback surface.                                           | S      | `components/ui/{toast,toaster,use-toast}`                             |
| 4   | **Add `brand` Button variant** (05, 06 §1)                                                | `--primary` is slate; nothing on-screen carries the accent. One blue CTA/screen makes "what next" obvious.                                         | S      | `packages/ui/.../button.tsx`                                          |
| 5   | **Goal-based `AppSidebar`** (D‑05, [03](./03_APPLICATION_SHELL.md))                       | Flat 8-item bar can't express structure or scale to 10 goals; a sidebar answers "where am I" and groups by job.                                    | L      | `app/layout.tsx`, `app-header.tsx`, new `sidebar.tsx`                 |
| 6   | **`PageHeader` component** (D‑29)                                                         | ~35 pages hand-roll `<h1>`+width; one component puts title + one primary CTA in the same place every screen.                                       | M      | new `components/shared/page-header.tsx`; all pages                    |
| 7   | **Container-width tokens** (D‑30)                                                         | Collapse 8 `max-w-*` values into content/wide/narrow so the content edge stops moving between screens.                                             | S      | Tailwind preset; layouts                                              |
| 8   | **Wire ⌘K command palette** (D‑04)                                                        | `command.tsx` ships at 0 imports; collapses navigate→find→act into one keystroke and becomes a discoverable index.                                 | M      | new `command-palette.tsx`, `command.tsx`                              |
| 9   | **Per-list skeleton loading** (D‑10)                                                      | `skeleton.tsx` unused; every route flashes the same 4-row `animate-pulse`. Structured skeletons = perceived speed, no layout shift.                | S      | all index routes; `skeleton.tsx`                                      |
| 10  | **`EmptyState` component + audit** (D‑08)                                                 | Empty is a feature's first impression; a consistent icon+title+one-CTA teaches value instead of dead-ending.                                       | M      | new `empty-state.tsx`; all index routes                               |
| 11  | **Fix destructive contrast to AA** (13 §4)                                                | `destructive` white text ≈3.8:1 fails AA. Darken to red-600 (~4.8:1) or enlarge text — legibility of the riskiest action.                          | S      | `globals.css` `--destructive`                                         |
| 12  | **Global `prefers-reduced-motion` override** (15 §4, D‑45)                                | Sheet 500ms slide + dialog zoom still play for motion-sensitive users; blanket cap prevents vestibular harm.                                       | S      | `packages/ui/src/globals.css`                                         |
| 13  | **Semantic status tokens** `success/warning/info` (D‑32, 06 §2)                           | Status color is improvised with raw palette classes; tokens make "same status = same color" and theme-able.                                        | S      | `globals.css`, Tailwind preset                                        |
| 14  | **Breadcrumbs on nested routes** (D‑18)                                                   | `breadcrumb.tsx` at 0 imports; store routes are 3–4 levels deep with only a single `← Dashboard` jump-to-root.                                     | S      | `app/stores/[storeId]/**`, `breadcrumb.tsx`                           |
| 15  | **Single org switcher** (D‑17)                                                            | `OrganizationSwitcher` renders in both `AppHeader` and the store layout — two switchers can disagree.                                              | S      | `app-header.tsx`, `stores/[storeId]/layout.tsx`                       |
| 16  | **`DataTable` (table + pagination + skeleton)** (D‑23)                                    | Tabular data renders as `<ul>`/card grids — no headers, no sort, unscannable at 100 rows.                                                          | M      | leads/products/orders lists; `table.tsx`, `pagination.tsx`            |
| 17  | **`StatusBadge` semantic variants** (06 §2, 07 §6)                                        | Lead status maps `default/destructive/outline` inline; a variant map makes badges meaningful not decorative.                                       | S      | `badge.tsx`; leads/orders                                             |
| 18  | **Skip-to-content link** (13 §1)                                                          | Keyboard users tab the whole header every page; a visually-hidden `<a href="#main">` on focus fixes it.                                            | S      | `app/layout.tsx`                                                      |
| 19  | **Responsive page padding** `p-4 sm:p-6 lg:p-8` (14 §3)                                   | Fixed `p-8` eats 17% of a 375px phone; responsive padding un-cramps mobile.                                                                        | S      | all page files                                                        |
| 20  | **Card-link `focus-visible` ring** (13 §1, D‑37)                                          | Whole-card `<Link>` has no focus style — keyboard users can't see focus.                                                                           | S      | `app/leads/page.tsx`, `app/sites/page.tsx`                            |
| 21  | **Touch targets ≥44px on mobile** (13 §7, D‑48)                                           | Default 40px controls (36px `sm`) raise mis-tap on phones; promote to `lg` on touch.                                                               | S      | `button.tsx`, nav, `store-nav.tsx`                                    |
| 22  | **Cap `Sheet` motion at ≤300ms** (15)                                                     | Sheet opens at 500ms — off-anchor sluggish for the mobile nav drawer.                                                                              | S      | `sheet.tsx`                                                           |
| 23  | **Quick-create `+` menu** (03 §4)                                                         | Create is the most frequent high-intent action; one top-bar `+` removes the "navigate to the right list first" tax.                                | S      | new top-bar `dropdown-menu`                                           |
| 24  | **Notification center slide-over** (D‑19, 03 §4)                                          | `/notifications` is a full page; a `sheet` preview lets users check alerts without losing their place.                                             | M      | `app-header.tsx`, `notifications-inbox.tsx`, `sheet.tsx`              |
| 25  | **User-menu avatar dropdown** (03 §4, D‑58)                                               | Bare `SignOutButton` today; an avatar menu consolidates profile/theme/sign-out.                                                                    | S      | `app-header.tsx`, `avatar.tsx`, `dropdown-menu.tsx`                   |
| 26  | **Type-scale tokens** (D‑31)                                                              | Headings are ad-hoc `text-2xl`/`text-lg` per file; a display/h1/h2/body/caption scale enforces hierarchy.                                          | M      | Tailwind preset; `@saroh/ui`                                          |
| 27  | **Adopt `form.tsx` (RHF+zod) everywhere** (D‑21, 13 §5)                                   | Hand-rolled forms skip `aria-invalid`/inline errors; `form.tsx` wires the label/error/`aria-describedby` triad for free.                           | M      | all form components; `form.tsx`                                       |
| 28  | **Replace native `<select>` with shadcn `Select`** (09)                                   | 10 components use unstyled native `<select>` — inconsistent control styling inside one form.                                                       | M      | product/order/service/member forms                                    |
| 29  | **Button loading state** (D‑46)                                                           | Forms set `disabled` but no spinner/label swap; a standard loading state prevents double-submit and confirms action.                               | S      | `button.tsx`; all forms                                               |
| 30  | **`StatCard` component** (04 §2.1)                                                        | No consistent metric tile for dashboards/analytics; a `card`+`badge` KPI tile is reused across Home/Insights.                                      | S      | new `stat-card.tsx`                                                   |
| 31  | **`ActivityFeed`/Timeline component** (05 §4)                                             | Record history is bespoke per screen; a shared timeline standardizes lead/order history.                                                           | M      | new `activity-feed.tsx`; lead/order detail                            |
| 32  | **Tokenise activity-timeline colors** (06 §12)                                            | Raw `border-amber-400/blue-400/emerald-400` don't theme; replace with `border-warning/info/success`.                                               | S      | `components/crm/activity-timeline.tsx`                                |
| 33  | **Tokenise order-payments color** (06 §12)                                                | `text-amber-700 dark:text-amber-400` → `text-warning` (drops the manual dark override).                                                            | S      | `components/stores/order-payments.tsx`                                |
| 34  | **`text-[10px]` → `text-xs`** (06 §12)                                                    | Arbitrary type size on the "Soon" badge; use the caption token.                                                                                    | S      | `components/stores/store-nav.tsx`                                     |
| 35  | **`min-w-[200px]` → spacing token** (06 §12)                                              | Arbitrary min-width; round to `min-w-48/52`.                                                                                                       | S      | `components/stores/members-manager.tsx`                               |
| 36  | **Retire `drawer`, standardize on `sheet`** (05 §3)                                       | Two overlapping slide-overs; one pattern is calmer and smaller.                                                                                    | S      | `drawer.tsx`                                                          |
| 37  | **Remove `menubar` from app surface** (05)                                                | No product use + prior DTS build regression.                                                                                                       | S      | `menubar.tsx`                                                         |
| 38  | **`--ring` = `--brand`** (13 §2)                                                          | Focus ring is near-black, easy to confuse with a border on dark controls; brand-blue (≈5.2:1) ties focus to the accent.                            | S      | `globals.css`                                                         |
| 39  | **`<footer>` landmark + `aria-label` on navs** (13 §3)                                    | No footer landmark; multiple navs undistinguished for screen readers.                                                                              | S      | `app/layout.tsx`, `app-header.tsx`                                    |
| 40  | **`aria-label` the notification badge** (13 §3)                                           | Bare count reads "Notifications 3" run-together; label the link, `aria-hidden` the number.                                                         | S      | `app-header.tsx`                                                      |
| 41  | **Site editor: server-render `h1`** (09, 10 bottom-10 #4)                                 | Title hydrates inside `SiteEditor`; SSR/SR/SEO get no heading and the skeleton flashes titleless.                                                  | S      | `app/sites/[siteId]/page.tsx`                                         |
| 42  | **Store overview → real KPIs; drop `hidden` coming-soon** (D‑24, D‑49)                    | Overview restates the header and shows an empty `hidden` grid; show orders/revenue/low-stock.                                                      | M      | `app/stores/[storeId]/page.tsx`, `packages/charts`                    |
| 43  | **Accounts `/apps`: dark-aware card, `<h1>`, remove `console.log`** (09, 10 bottom-10 #2) | The identity provider's front door is a white card on `bg-neutral-950`, title is a `<div>`, `console.log(session)` left in.                        | S      | `apps/accounts.saroh.in/app/apps/page.tsx`                            |
| 44  | **Admin stub: proper state or gate the route** (09, 10 bottom-10 #1)                      | Authorized view is literal scaffolding with clipping `<ul>` and no heading.                                                                        | S      | `apps/admin.saroh.in/app/page.tsx`                                    |
| 45  | **Marketing home: real `h1`/nav/footer, remove dead heroes** (09, 10 #7)                  | First impression answers "what is this?" only through motion; no copy hero, four commented-out experiments.                                        | M      | `apps/saroh.in/app/page.tsx`                                          |
| 46  | **Standardize icon system (lucide), drop `react-icons`** (07 §3, D‑33)                    | `react-icons` is a declared dep with 0 imports; two icon sets drift in weight/metrics.                                                             | M      | `package.json`; nav; empty states                                     |
| 47  | **Consistent avatars for people/stores** (D‑58)                                           | `avatar.tsx` unused; members/customers are text-only — avatars speed recognition.                                                                  | S      | members/customers; `avatar.tsx`                                       |
| 48  | **Pick one list idiom (DataTable) across store lists** (09 defect #2)                     | Three idioms force users to relearn scanning per list.                                                                                             | M      | products/orders/customers/content                                     |
| 49  | **Align Services grid to Sites (`sm:grid-cols-2`)** (10)                                  | Services is 1-col, its sibling Sites is 2-col — the inconsistency itself is the finding.                                                           | S      | `app/services/page.tsx`                                               |
| 50  | **Order detail: handle empty items list** (09, 10 bottom-10 #6)                           | Empty items not handled on the screen a merchant lives in during fulfilment.                                                                       | S      | `orders/[orderId]/page.tsx`                                           |
| 51  | **Customers list: fix ragged `city` column** (09)                                         | `city` renders only-if-present, so the right column is ragged and looks broken.                                                                    | S      | `stores/[storeId]/customers/page.tsx`                                 |
| 52  | **Lead detail: normalize section heading scale** (09, 10 bottom-10 #9)                    | Peer sections mix `text-sm font-medium` and `text-lg font-semibold` — structure can't be parsed.                                                   | S      | `leads/[leadId]/page.tsx`                                             |
| 53  | **Lead detail: establish one primary action** (10 #9)                                     | Seven co-equal bordered panels contradict "one primary action"; emphasize advance-stage.                                                           | S      | `leads/[leadId]/page.tsx`                                             |
| 54  | **Elevation/shadow + border tokens** (D‑52)                                               | Cards use default shadow/border with no scale; define flat/raised/overlay for consistent depth.                                                    | S      | tokens; `card.tsx`, overlays                                          |
| 55  | **Motion duration/easing tokens** (D‑44, 15 §1)                                           | Durations are implicit/scattered (120/200/500ms); name fast/base/slow so motion is intentional.                                                    | M      | tokens; `@saroh/ui` overlays                                          |
| 56  | **Wordmark size/clearspace tokens** (D‑50)                                                | Single-source Wordmark ships but sizing/clearspace unspecified — inconsistent brand presence.                                                      | S      | `wordmark.tsx`                                                        |
| 57  | **Central `Intl` formatters (currency/date)** (D‑54, 07 §5)                               | `formatValue` in `lib/crm/format` isn't shared; central formatters make "£1,200"/"2 days ago" identical everywhere.                                | S      | `packages/utils`; lists                                               |
| 58  | **Adopt `Alert` for page-level notices** (05)                                             | No inline page-level messaging; needed for form/section notices.                                                                                   | S      | `alert.tsx`; forms                                                    |
| 59  | **Destructive-action confirm via `alert-dialog`** (D‑22)                                  | No standard confirm for delete (members, products); prevents accidental data loss.                                                                 | S      | `alert-dialog.tsx`; delete flows                                      |
| 60  | **Progressive disclosure in product form** (D‑12)                                         | `product-form.tsx` shows variants+inventory upfront; collapse behind "Add options" so first-run is name+price.                                     | M      | `components/stores/product-form.tsx`                                  |
| 61  | **`SuccessState` component** (D‑43)                                                       | Success moments (published, created) are inconsistent/absent; a reused `title + next[]` makes "what's next" systematic.                            | M      | new component; create/publish flows                                   |
| 62  | **Publish success state ("You're live")** (D‑13)                                          | `site.subdomain` (live URL) exists but publish gives no payoff — the website journey's emotional peak is missing.                                  | M      | `app/sites/[siteId]/page.tsx`                                         |
| 63  | **API-failure vs empty sentinel** (D‑09)                                                  | Lists show "No leads yet" during an outage; a distinct retry state prevents "everything vanished" panic.                                           | M      | `leads/page.tsx`, `sites/page.tsx`, `lib/*/service.ts`                |
| 64  | **Error-boundary human copy + Retry** (D‑42)                                              | `error.tsx` exists but generic; human copy + retry + support reduces panic on failure.                                                             | S      | `app/error.tsx`                                                       |
| 65  | **Context-aware not-found recovery** (D‑41)                                               | Nested (bad storeId) 404s dead-end; "this store no longer exists — back to your stores".                                                           | S      | `app/not-found.tsx`; store routes                                     |
| 66  | **Toast helper with success/error/undo** (D‑20)                                           | `sonner` imported ad hoc with inconsistent messages; a helper standardizes and adds undo.                                                          | S      | `sonner.tsx`; forms                                                   |
| 67  | **In-list search/filter** (D‑57)                                                          | No filter on contacts/leads/products; a filter input finds one record fast.                                                                        | M      | index routes                                                          |
| 68  | **Multi-select + bulk actions** (D‑55)                                                    | No bulk ops (mark leads, fulfil orders); row selection lets owners act on many items at once.                                                      | M      | index routes; `DataTable`                                             |
| 69  | **Responsive tables → cards under `md`** (D‑47, 14 §4)                                    | A multi-column table on 375px forces horizontal scroll hiding columns; one card per row on mobile.                                                 | M      | list components                                                       |
| 70  | **StoreNav: scroll/collapse not `flex-wrap`; 44px targets** (09, D‑48)                    | 7 tabs wrap to 2–3 rows on narrow screens; `py-1.5` may be <44px.                                                                                  | S      | `components/stores/store-nav.tsx`                                     |
| 71  | **Analytics range: `aria-current`/`aria-pressed`** (09, 10)                               | Active range is color-only, invisible to assistive tech.                                                                                           | S      | `app/analytics/page.tsx`                                              |
| 72  | **Analytics → Insights with real charts** (D‑28)                                          | Analytics is thin; `@saroh/charts` underused — owners need to see what's working.                                                                  | L      | `app/analytics/page.tsx`, `packages/charts`                           |
| 73  | **Gallery: add empty/loading/error/disabled states** (D‑51)                               | `ui.saroh.in` likely shows default states only; documenting states drives correct reuse.                                                           | M      | `apps/ui.saroh.in/*`                                                  |
| 74  | **Dark-mode QA pass per screen** (D‑36)                                                   | Shared `ThemeProvider` ships but no per-screen dark QA (borders/shadows/charts).                                                                   | M      | all screens; `@saroh/charts`                                          |
| 75  | **Guard `muted-foreground` contrast** (D‑35, 13 §4)                                       | `muted-foreground` ≈4.76:1 barely passes AA and is everywhere; never dilute with opacity or <14px.                                                 | S      | tokens; global                                                        |
| 76  | **Decide one chart entry point** (05 §1)                                                  | `@saroh/charts` overlaps `@saroh/ui/chart`; the product should import one.                                                                         | S      | `packages/charts`, `chart.tsx`                                        |
| 77  | **Icons in nav + empty states** (D‑33)                                                    | Nav/empty states are text-only; lucide icons speed scanning and warm empty states.                                                                 | S      | nav; empty states                                                     |
| 78  | **Typed notification icons + copy** (D‑60)                                                | Untyped list rows; per-type icon + one-line action copy lets users scan "3 orders, 1 lead".                                                        | S      | `app/notifications/page.tsx`                                          |
| 79  | **Responsive onboarding/forms at 320/390** (D‑59, 14 §6)                                  | `max-w-lg p-8` unverified at 320px; reflow check + stacked fields so sign-up works on a phone.                                                     | S      | onboarding + forms                                                    |
| 80  | **Standard primary-action placement rule** (D‑11)                                         | "New X" label/placement varies; one rule (top-right "Add X", empty-state reuses label) = predictability.                                           | S      | all index routes                                                      |
| 81  | **`FormLayout` composed component** (05 §4)                                               | Consistent Create/Settings form skeleton (label position, error slot, submit feedback).                                                            | M      | new component; create forms                                           |
| 82  | **`tabular-nums` on all money/figure columns** (07 §5)                                    | Only order-payments uses it; align figures so the eye compares magnitudes.                                                                         | S      | lists with figures                                                    |
| 83  | **Store shell: remove nested mini-header** (09 §G, 03 §3)                                 | A second header + switcher + title stack under the global one — "where am I" answered twice.                                                       | M      | `stores/[storeId]/layout.tsx`                                         |
| 84  | **Adopt `MaxWidthWrapper` (or width token) app-wide** (09 §0)                             | `MaxWidthWrapper` is defined but unused; pages hand-roll widths — root cause of drift.                                                             | S      | `components/shared/max-width-wrapper.tsx`; pages                      |
| 85  | **Sticky bottom CTA on mobile forms** (14 §5)                                             | Top-only action bars are a thumb stretch on tall phones.                                                                                           | S      | form templates                                                        |
| 86  | **Remove hover-only affordances for touch** (14 §5)                                       | `hover:bg-muted/40`/`hover:underline` don't exist on touch — ensure state is reachable without hover.                                              | S      | leads, header                                                         |
| 87  | **`scroll-area` in sidebar + notification slide-over** (05)                               | Long nav/lists need calm scrolling containers, not native overflow.                                                                                | S      | sidebar, notifications                                                |
| 88  | **Replace hand-rolled `store-nav` with `Tabs`** (03 §6, 05)                               | Hand-rolled tab strip reimplements a11y from scratch; Radix `tabs` gives roving tabindex + `aria-selected` free.                                   | S      | `store-nav.tsx`, `tabs.tsx`                                           |
| 89  | **`Tooltip` on collapsed sidebar icons** (03 §3)                                          | An icon rail without labels forces guessing; tooltip keeps it usable.                                                                              | S      | sidebar; `tooltip.tsx`                                                |
| 90  | **Enforce real `FormLabel` (no placeholder-as-label)** (13 §5)                            | Placeholder is not a label (WCAG 3.3.2) and is borderline contrast.                                                                                | S      | all inputs                                                            |
| 91  | **`role="alert"` on async/submit form errors** (13 §5)                                    | `FormMessage` is in DOM but not a live region — SR users miss submit errors.                                                                       | S      | forms; `form.tsx`                                                     |
| 92  | **Enforce `DialogTitle` on every dialog/sheet** (13 §8)                                   | Radix has no accessible name without a title (visually-hidden allowed).                                                                            | S      | dialog/sheet usages                                                   |
| 93  | **`<TableCaption>` + `<th scope>` when tables land** (13 §8)                              | Without `scope` SRs can't announce row/column header associations.                                                                                 | S      | `DataTable`                                                           |
| 94  | **Migrate accounts auth to tokens (drop raw `stone-*`)** (13 §4)                          | Login buttons use raw `stone-*` not tokens — outside the token audit and drift-prone.                                                              | S      | `accounts.saroh.in` auth components                                   |
| 95  | **Store overview KPI charts via `@saroh/charts`** (D‑24)                                  | Landing on a store should inform, not show placeholders.                                                                                           | M      | `stores/[storeId]/page.tsx`, `packages/charts`                        |
| 96  | **Onboarding progress / setup checklist** (D‑56)                                          | No "you're 2/5 set up" guidance; a checklist nudges activation (goal-gradient).                                                                    | M      | `app/page.tsx`                                                        |
| 97  | **AI assist surface (⌘K + inline)** (D‑38)                                                | No AI anywhere despite "AI-powered Business OS" positioning; the differentiator + universal >2-click fallback.                                     | L      | new `app/ai`; forms                                                   |
| 98  | **Marketing surface (empty-state first)** (D‑39)                                          | No marketing route; ship `/marketing` teaching empty state + templates to close the capture→re-engage loop.                                        | L      | new `app/marketing`                                                   |
| 99  | **Automation surface (empty-state first)** (D‑40)                                         | No automation route; recipe cards signal the OS ambition (progressive disclosure of a coming capability).                                          | L      | new `app/automation`                                                  |
| 100 | **Cross-app Wordmark/logo consistency** (D‑50, 16)                                        | Consistent brand presence across accounts/admin/marketing/app via size + clearspace variants.                                                      | S      | `wordmark.tsx`; all apps                                              |

---

## 7. Top 50 UX improvements (ranked by user value)

> Flows, clicks, guidance, empty/success states. "Journey" = the numbered journey in
> [08_USER_JOURNEYS.md](./08_USER_JOURNEYS.md). 50 grounded items produced.

| #   | Improvement                                                                                                       | Why (user value)                                                                                                           | Journey affected |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | **"Add lead" button + `/leads/new`** (D‑01)                                                                       | Capturing a lead is ~5+ clicks through a contact workaround today; the single worst primary-action gap. Cuts to 2.         | J4 Capture lead  |
| 2   | **Goal-based IA** (Home·Website·Customers·Appointments·Commerce·Marketing·Insights·Automation·AI·Settings) (D‑02) | Nav mirrors DB tables not jobs; owners search for "website"/"appointments". Multiplies findability across all 11 journeys. | All              |
| 3   | **Mobile navigation** (D‑03)                                                                                      | A business owner on a phone literally cannot navigate the app today.                                                       | All (mobile)     |
| 4   | **Global ⌘K palette + search** (D‑04)                                                                             | Collapses navigate→find→act into one keystroke; direct object access replaces multi-click drilling.                        | All              |
| 5   | **Home dashboard (next-best-actions)** (D‑06)                                                                     | Post-onboarding lands on an empty "Your stores" — a dead end; replace with activity + next-step cards.                     | J1, J8           |
| 6   | **Onboarding = single field + goal picker** (D‑07)                                                                | A 6-field profile fieldset is asked before the user cares; end onboarding on momentum, not emptiness.                      | J1               |
| 7   | **Empty states that teach** (D‑08)                                                                                | Each empty screen should sell the feature + give one next action, not dead-end.                                            | J2, J4, J6, J9   |
| 8   | **Publish success "You're live"** (D‑13)                                                                          | The live URL exists (`site.subdomain`) but is never celebrated — the website journey's payoff.                             | J3               |
| 9   | **Unify Contacts + store Customers** (D‑14)                                                                       | Two customer concepts in two homes; one org-level `/customers` answers "who are my customers".                             | J5               |
| 10  | **Merge Services + Bookings → Appointments** (D‑15)                                                               | Object-language split; the recurring "book" act drops 6→2 clicks with setup done once.                                     | J6               |
| 11  | **Progressive disclosure in create forms** (D‑12)                                                                 | Variants/inventory shown upfront = decision fatigue on step one; name+price → Save first.                                  | J7               |
| 12  | **Contact detail: edit + "new lead from contact"** (09 §D)                                                        | Read-only profile is a dead-end; a CRM record you can't act on forces users back out.                                      | J4, J5           |
| 13  | **Add create affordance to Contacts** (09 §D)                                                                     | The primary CRM object can't be created from its own list.                                                                 | J5               |
| 14  | **Org-level Orders rollup** (D‑16)                                                                                | Orders live only inside a store; a multi-store owner has no "what sold today".                                             | J8               |
| 15  | **Order as a first-class Home moment + Fulfil** (08 J8)                                                           | An order is money arriving; it deserves a Home card, not a bare notification integer.                                      | J8               |
| 16  | **Notifications: real center, not a badge** (D‑19)                                                                | Orders/leads deserve an actionable moment; typed items with actions.                                                       | J8               |
| 17  | **Org-level Team in Settings** (D‑25)                                                                             | Invites are per-store; staffing 3 stores = 3 invites. One invite, scoped.                                                  | J10              |
| 18  | **Pending-invitation visibility** (D‑26)                                                                          | The invite flow is opaque to the inviter after sending; pending rows with resend/revoke.                                   | J10              |
| 19  | **Settings surface** (D‑27)                                                                                       | No top-level Settings; home for the profile/billing/domains config deferred out of onboarding.                             | J1, J10          |
| 20  | **Distinguish API-failure from empty** (D‑09)                                                                     | Users see "No leads yet" during an outage — trust damage; a retry state prevents panic.                                    | J4, J8           |
| 21  | **Standard primary-action placement** (D‑11)                                                                      | "New X" placement/label varies; one rule = one predictable primary action per screen.                                      | All create       |
| 22  | **`SuccessState` pattern (reused)** (D‑43)                                                                        | Success moments are inconsistent/absent; "explain what's next" made systematic.                                            | J1, J3, J5, J7   |
| 23  | **Skeleton loading, not spinners** (D‑10)                                                                         | Every route flashes one generic skeleton; structured skeletons feel faster and calmer.                                     | All              |
| 24  | **Onboarding setup checklist** (D‑56)                                                                             | No "you're 2/5 set up"; goal-gradient nudges activation.                                                                   | J1               |
| 25  | **In-list search/filter** (D‑57)                                                                                  | No way to find one record in a long list without scanning.                                                                 | J4, J5, J7       |
| 26  | **Quick-create from anywhere** (03 §4)                                                                            | Creation is the most frequent high-intent action; reachable from any screen removes the "navigate first" tax.              | All create       |
| 27  | **Store overview → real dashboard** (D‑24)                                                                        | Landing inside a store shows its own name + an empty coming-soon block — nothing actionable.                               | J7, J8           |
| 28  | **Website: rename Sites→Website + AI-drafted first site** (08 J2)                                                 | "Site" is object-language a non-technical owner may not map to "make a website"; blank editor = paralysis.                 | J2               |
| 29  | **Publish pre-lint ("3 sections still say Lorem ipsum")** (08 J3)                                                 | Prevents the #1 embarrassment — publishing placeholder text.                                                               | J3               |
| 30  | **Self-serve booking link as empty-state promise** (08 J6)                                                        | The self-book link is the point of the feature; surface it where owners land.                                              | J6               |
| 31  | **Create-customer next-step CTAs** (08 J5)                                                                        | Turns a bare new record into the start of a booking/order.                                                                 | J5               |
| 32  | **Breadcrumbs for orientation** (D‑18)                                                                            | 3–4-level store routes give no path context; one-click return to any ancestor.                                             | J7, J8           |
| 33  | **One line of "what is this / what next" per screen** (10 §guidance)                                              | Guidance is the weakest category (4.5); one sentence orients a novice.                                                     | All              |
| 34  | **Fix viewer "New post" misleading affordance** (09 §G, 10)                                                       | The button shows to `VIEWER` users the API rejects — a self-documented misleading action.                                  | J7 (content)     |
| 35  | **Order-new: guard zero products/customers** (09 §G)                                                              | The form renders even with nothing to add — a dead-end at the highest-stakes screen.                                       | J8               |
| 36  | **Bookings: date filter + past view** (09 §E)                                                                     | Read-only with no range/history; owners can't review past bookings.                                                        | J6               |
| 37  | **Pagination past ~50 rows** (D‑23a)                                                                              | Lists fetch all rows; performance + usability degrade at real volumes.                                                     | J7, J8           |
| 38  | **Multi-select + bulk actions** (D‑55)                                                                            | Owners act on many items at once (mark leads, fulfil orders).                                                              | J4, J8           |
| 39  | **Error-boundary human copy + Retry** (D‑42)                                                                      | Generic boundary; human copy + retry reduces panic on failure.                                                             | All              |
| 40  | **Context-aware not-found recovery** (D‑41)                                                                       | Bad storeId 404 dead-ends; recover, don't dead-end.                                                                        | J7, J8           |
| 41  | **Toast undo conventions** (D‑20)                                                                                 | Undo on reversible ops builds confidence to act.                                                                           | All mutations    |
| 42  | **Invitation accept: success interstitial + human error** (09 §B, 10)                                             | Success is a silent redirect; the only rendered state is a raw `result.error` string — a poor first touch.                 | J10              |
| 43  | **Onboarding "what happens next" expectation** (09 §B)                                                            | A first-run user isn't told what follows naming the org.                                                                   | J1               |
| 44  | **Marketing surface exists at all** (D‑39)                                                                        | The journey is impossible in-product today; closes the capture→re-engage loop.                                             | J9               |
| 45  | **AI assist surface + inline drafting** (D‑38)                                                                    | Zero AI touchpoints despite the positioning; the reason to choose Saroh over ten tools.                                    | J11              |
| 46  | **AI as universal >2-click fallback** (08 J11)                                                                    | Any task that's >2 clicks by hand should be doable by asking.                                                              | All              |
| 47  | **Automation surface (empty-state first)** (D‑40)                                                                 | Recipe cards (new lead → email) teach a coming capability.                                                                 | J9               |
| 48  | **Typed, actionable notifications** (D‑60)                                                                        | Scan "3 orders, 1 lead" instantly instead of an untyped list.                                                              | J8               |
| 49  | **Consolidate store overview to route to Products** (09 §G)                                                       | If no KPIs yet, route past the empty overview to the first useful screen.                                                  | J7               |
| 50  | **Product form: AI-drafted description + price suggestion** (08 J7)                                               | Owner types name+price and ships; removes blank-field labor.                                                               | J7               |

---

## 8. Top 30 design inconsistencies

> Evidence grounded in [09](./09_SCREEN_INVENTORY.md) inventory summary,
> [06 §12](./06_DESIGN_TOKENS.md) violations, and [10](./10_UX_AUDIT.md)/[13](./13_ACCESSIBILITY_GUIDE.md)/[14](./14_RESPONSIVE_GUIDE.md).

| #   | Inconsistency                                      | Evidence / files                                            | Fix                                                                                                       |
| --- | -------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Eight container widths across sibling pages        | `md`/`lg`/`3xl`/`4xl`/`5xl`/`6xl`/`full` census (09 §0)     | Four named width tokens applied by `PageHeader` (D‑30)                                                    |
| 2   | Header `max-w-6xl` ≠ content `max-w-4xl`           | `app-header.tsx` vs `app/page.tsx`                          | Align shell + content to one edge                                                                         |
| 3   | Three list idioms (grid / cards / `<ul>` rows)     | `app/page.tsx`, `app/leads`, `stores/**/products`           | One `DataTable` idiom (D‑23)                                                                              |
| 4   | Two toast systems                                  | `components/ui/{toast,use-toast}` + `sonner`                | Standardize on `sonner` (06 §12)                                                                          |
| 5   | Three component sources                            | `@saroh/ui` vs `app/components/ui/*` vs `@saroh/charts`     | Consolidate on `@saroh/ui` (05 §1)                                                                        |
| 6   | Native `<select>` vs shadcn `Select` (10 places)   | product/order/service/member forms (09)                     | Adopt `Select` everywhere                                                                                 |
| 7   | Hand-rolled forms vs `form.tsx`                    | 0 `@saroh/ui/form` imports in app (09)                      | Adopt `form.tsx` (D‑21)                                                                                   |
| 8   | Raw palette status colors vs tokens                | `activity-timeline.tsx`, `order-payments.tsx` (06 §12)      | Semantic `success/warning/info`                                                                           |
| 9   | `--primary` slate but `--brand` blue on nothing    | tokens vs on-screen (06 §1)                                 | `brand` Button variant                                                                                    |
| 10  | Arbitrary `text-[10px]`                            | `store-nav.tsx` Soon badge (06 §12)                         | `text-xs`                                                                                                 |
| 11  | Arbitrary `min-w-[200px]`                          | `members-manager.tsx` (06 §12)                              | `min-w-48/52`                                                                                             |
| 12  | Services 1-col vs Sites 2-col grid                 | `services/page.tsx` vs `sites/page.tsx` (10)                | Align grids                                                                                               |
| 13  | Leads `gap-3` 1-col vs Contacts `sm:grid-cols-2`   | 09 §D                                                       | One CRM list convention                                                                                   |
| 14  | Lead detail mixed heading scale                    | `text-sm font-medium` vs `text-lg font-semibold` peers (09) | Type-scale tokens (D‑31)                                                                                  |
| 15  | Two org switchers on store pages                   | `app-header.tsx` + `stores/[storeId]/layout.tsx` (D‑17)     | Render once in shell                                                                                      |
| 16  | Store shell nested double-header                   | `stores/[storeId]/layout.tsx` (09 §G)                       | Remove mini-shell                                                                                         |
| 17  | Glyph-only `←` back links, no breadcrumb           | detail/create routes (09)                                   | `breadcrumb.tsx` (D‑18)                                                                                   |
| 18  | Focus ring near-black, not brand                   | `--ring` = slate (13 §2)                                    | `--ring = --brand`                                                                                        |
| 19  | `drawer` and `sheet` overlap                       | `drawer.tsx` + `sheet.tsx` (05 §3)                          | Retire `drawer`                                                                                           |
| 20  | `menubar` unused + DTS regression                  | `menubar.tsx` (05)                                          | Remove from app surface                                                                                   |
| 21  | 40px default controls vs 44px touch bar            | `button.tsx h-10`, `input.tsx h-10` (13 §7)                 | Promote to `lg` on touch                                                                                  |
| 22  | Fixed `p-8` regardless of viewport                 | `leads`, `pipeline`, `onboarding` (14 §3)                   | `p-4 sm:p-6 lg:p-8`                                                                                       |
| 23  | Effectively single-breakpoint (almost no `sm/md`)  | only `sm:grid-cols-*` ×5, `lg:flex` (14 §1)                 | Mobile-first reflow                                                                                       |
| 24  | `Sheet` open 500ms vs ≤300ms cap                   | `sheet.tsx` (15)                                            | Cap at 300ms                                                                                              |
| 25  | Site editor `max-w-6xl` + no server `h1`           | `sites/[siteId]/page.tsx` (09, 10)                          | Reconcile width, SSR title                                                                                |
| 26  | Pipeline `max-w-full` board vs `max-w-6xl` empty   | `pipeline/page.tsx` (09)                                    | Unify width                                                                                               |
| 27  | Customers ragged `city` column                     | `customers/page.tsx` (09)                                   | Consistent columns/DataTable                                                                              |
| 28  | Analytics range: no `aria-current`/`aria-pressed`  | `analytics/page.tsx` (09)                                   | Add pressed/current state                                                                                 |
| 29  | Accounts `/apps` light-on-dark + raw `stone-*`     | `accounts/app/apps` + auth buttons (09, 13)                 | Dark-aware + tokens                                                                                       |
| 30  | `react-icons` declared but unused alongside lucide | `app/package.json` (07 §3)                                  | Remove `react-icons`; `MaxWidthWrapper` defined-but-unused (09) is the same drift class — adopt or delete |

---

## 9. Top 20 components to redesign or build first

> "Global?" = should live in `@saroh/ui` (`packages/ui/src/components/ui/`).
> Sourced from [05 §4](./05_COMPONENT_LIBRARY.md) missing components + specs.

| #   | Component                                                | Problem today                                                     | Global?           | Files                                                      |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| 1   | **AppSidebar** (build)                                   | Flat 8-link header nav, `hidden lg:flex`, can't scale to 10 goals | Yes               | new; `app-header.tsx`, `sheet`, `tooltip`, `separator`     |
| 2   | **PageHeader** (build)                                   | ~35 hand-rolled `<h1>`/width headers                              | Yes               | new; all pages; `tabs`, `button`                           |
| 3   | **Mobile nav (Sheet-based)** (build)                     | No nav below `lg` at all                                          | Yes (compose)     | new `mobile-nav.tsx`; `sheet.tsx`                          |
| 4   | **CommandPalette** (wire `command`)                      | `command.tsx` at 0 imports; no search/⌘K                          | Yes               | new; `command.tsx`, `dialog.tsx`                           |
| 5   | **EmptyState** (build)                                   | Only Stores has a real empty state; others bare                   | Yes               | new; `stores-empty-state.tsx`; all lists                   |
| 6   | **DataTable** (build)                                    | Tabular data as `<ul divide-y>` — no headers/sort/pagination      | Yes               | new; `table.tsx`, `pagination.tsx`, `checkbox`, `skeleton` |
| 7   | **Button** (redesign)                                    | No `brand` variant, no loading state, 40px < 44px                 | Yes               | `button.tsx`                                               |
| 8   | **Badge** (redesign)                                     | No semantic `success/warning/info`; status color inline           | Yes               | `badge.tsx`                                                |
| 9   | **Form / FormLayout** (adopt)                            | 0 `form.tsx` imports; hand-rolled `useState`+toast                | Yes               | `form.tsx`; all forms                                      |
| 10  | **StatCard** (build)                                     | No consistent metric tile for dashboards                          | Yes               | new; `card`, `badge`                                       |
| 11  | **ActivityFeed / Timeline** (build)                      | Record history bespoke, raw palette colors                        | Yes               | new; `avatar`, `separator`, `card`                         |
| 12  | **NotificationCenter** (compose)                         | `/notifications` full page only; no slide-over                    | Yes               | `sheet` + `notifications-inbox.tsx`                        |
| 13  | **Toast (sonner)** (consolidate)                         | Two toast systems running                                         | Yes               | retire `toast/toaster/use-toast`; `sonner.tsx`             |
| 14  | **Breadcrumb** (adopt)                                   | 0 imports; deep routes have no trail                              | Yes               | `breadcrumb.tsx`; store routes                             |
| 15  | **Container width utilities** (build)                    | 11-value `max-w-*` drift                                          | Yes (tokens)      | Tailwind preset                                            |
| 16  | **Retire `components/ui/` shadow set** (redesign/remove) | 38-file duplicate; app imports both                               | Yes (consolidate) | `apps/app.saroh.in/components/ui/*`                        |
| 17  | **StoreNav → Tabs** (redesign)                           | Hand-rolled tab strip reimplements a11y; wraps on mobile          | Yes               | `store-nav.tsx`, `tabs.tsx`                                |
| 18  | **OrganizationSwitcher** (redesign)                      | Renders twice on store pages                                      | Yes               | `organization-switcher.tsx`; store layout                  |
| 19  | **Select** (adopt)                                       | Native `<select>` in 10 components                                | Yes               | `select.tsx`; forms                                        |
| 20  | **SuccessState** (build)                                 | Success moments inconsistent/absent                               | Yes               | new; create/publish flows                                  |

---

## 10. Screens that should NOT be redesigned (already good UX)

These have solid bones worth _preserving_; they need small fixes, not a redesign.

| Screen                                              | Score | Why keep it (from [10](./10_UX_AUDIT.md)/[09](./09_SCREEN_INVENTORY.md))                                                                                                                                          |
| --------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stores home `/`** (`app/page.tsx`)                | 6.0   | The calm reference standard ([01 P1](./01_PRODUCT_DESIGN_PHILOSOPHY.md)): single `h1`, one primary CTA, plain `grid`. Evolve it into a Home _dashboard_ (D‑06) but keep the calm layout DNA.                      |
| **Pipeline board** (`app/pipeline`)                 | 5.9   | The app's **accessibility high-water mark** — `aria-label`ed stage sections, semantic `<article>`, real link titles, and the model responsive pattern (`overflow-x-auto`, `w-72 shrink-0`). Only unify its width. |
| **Auth pages** (login/signup/forgot/reset)          | 6.1   | The **highest-scoring group**: clean centered layout, responsive `sm:/lg:` padding, real form components. Only delete login dead code + add per-page metadata.                                                    |
| **Analytics page** (`app/analytics`)                | 5.3   | Clean structure, correct `content-wide` instinct, working range control. Keep the layout; only add `aria-current` and grow the charts (not a rebuild).                                                            |
| **Docs / Help (Nextra sites)**                      | —     | `docs.saroh.in`/`help.saroh.in` already collapse the sidebar to a drawer responsively ([14](./14_RESPONSIVE_GUIDE.md) template 12) — the responsive model to copy, not touch.                                     |
| **`ui.saroh.in` component gallery**                 | —     | Newly shipped (#97); the mirror of `@saroh/ui`. Extend with states (D‑51), don't redesign.                                                                                                                        |
| **Marketing home** (as an _intentional_ divergence) | 4.8   | Its dark, effects-first world is deliberately unlike the app; it needs _content_ (h1/nav/footer) added, not its identity redesigned.                                                                              |

---

## 11. Components that should become global design-system components

All live in **`@saroh/ui`** (`packages/ui/src/components/ui/`), the single shared
package every app consumes ([05 §4](./05_COMPONENT_LIBRARY.md), [16](./16_FIGMA_STRUCTURE.md)
code-first rule — a component lands in `@saroh/ui` first, then Figma):

| Component                   | Composed from                                                              | Why global                                                                     |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **PageHeader**              | `tabs` + `button` + `dropdown-menu`                                        | Title + one primary CTA in the same place on all 35 routes; kills header drift |
| **AppSidebar**              | `Link` + `tooltip` + `sheet` + `separator` + `scroll-area` + `collapsible` | The goal-nav shell shared by every authed app                                  |
| **StatCard**                | `card` + `badge`                                                           | Consistent KPI tile for Home + Insights                                        |
| **DataTable**               | `table` + `pagination` + `checkbox` + `skeleton` + `input`                 | Sortable/paginated/selectable lists replacing `<ul divide-y>`                  |
| **EmptyState**              | `card`/dashed + `button`                                                   | One teaching empty pattern across all lists                                    |
| **Timeline / ActivityFeed** | `avatar` + `separator` + `card`                                            | Record history on lead/order detail                                            |
| **CommandPalette**          | `command` + `dialog`                                                       | ⌘K navigate/create/search/act, reused by every app                             |
| **NotificationCenter**      | `sheet` + `notifications-inbox`                                            | Glance at alerts without leaving the task                                      |
| **FormField / FormLayout**  | `form` + fields + `sonner`                                                 | Consistent accessible Create/Settings forms                                    |

> These molecules are the highest-value section: Saroh already owns nearly every
> **atom**; what it lacks are the composed **molecules** that make those atoms
> consistent. Building them + retiring the duplicate source converts a pile of
> unused primitives into the single calm product Saroh Canvas describes.

---

## 12. Estimated implementation effort per milestone

From [12_IMPLEMENTATION_PLAN.md](./12_IMPLEMENTATION_PLAN.md). M0 (shell, tokens,
boundaries, font, theme, wordmark, gallery) is **already shipped this session**.

| Milestone | Theme                                                 | Backlog items                                             | Effort (person-days) |
| --------- | ----------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| **M1**    | Tokens · type · spacing · buttons · forms · icons     | D‑12, D‑21, D‑29–D‑33, D‑46, D‑50, D‑52, D‑54             | **14–19 pd**         |
| **M2**    | App-shell · sidebar · topbar · search · goal-based IA | D‑02–D‑05, D‑17, D‑18, D‑48, D‑59                         | **18–24 pd**         |
| **M3**    | Home · CRM · Website (empty/loading/error quality)    | D‑01, D‑06–D‑11, D‑13, D‑14, D‑43, D‑56, D‑57             | **22–30 pd**         |
| **M4**    | Commerce · Appointments · Marketing · Insights        | D‑15, D‑16, D‑23, D‑23a, D‑24–D‑28, D‑39, D‑47, D‑55      | **26–34 pd**         |
| **M5**    | a11y · animations · dark-mode · performance · AI      | D‑34–D‑38, D‑40, D‑42, D‑44, D‑45, D‑51, D‑53, D‑58, D‑60 | **20–28 pd**         |
|           |                                                       | **Total**                                                 | **≈100–135 pd**      |

Milestones are largely sequential (each builds on the prior's foundations); M4
sub-tracks (Commerce / Appointments / Marketing) fan out in parallel once M2+M3
land. AI (D‑38) is a backend-gated parallel track — it must never gate the a11y work.

---

## 13. File/component impact map (summary)

The redesign concentrates on a small set of high-leverage files. Full per-item paths
are in Sections 6–9; the mapping below shows where the effort lands.

| Redesign area                                                      | Primary files/components affected                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell** (sidebar, topbar, ⌘K, mobile, breadcrumbs, one switcher) | `app/layout.tsx`, `components/shared/app-header.tsx` → `sidebar.tsx` + `topbar.tsx`, new `mobile-nav.tsx` + `command-palette.tsx`, `stores/[storeId]/layout.tsx`, `packages/ui/.../{command,sheet,breadcrumb,tooltip,avatar}.tsx` |
| **Tokens** (widths, type, status, ring, elevation, motion)         | `packages/ui/src/globals.css`, `tooling/tailwind-config/tailwind.config.ts`, app `globals.css`                                                                                                                                    |
| **Component library** (retire dup + build molecules)               | `apps/app.saroh.in/components/ui/*` (retire), `packages/ui/.../{button,badge,form,select,sonner,table,pagination,skeleton}.tsx`, new `page-header/stat-card/data-table/empty-state/activity-feed/success-state`                   |
| **Forms** (RHF+zod, Select, validation, loading)                   | all `components/**/*-form.tsx` (create-organization, product, order, service, customer, post), `store-settings`, `members-manager`                                                                                                |
| **Lists / loading / empty / error**                                | all index routes under `app/**`, `app/{loading,error,not-found}.tsx`, per-segment `loading.tsx`, `lib/*/service.ts` (error sentinels)                                                                                             |
| **Per-screen fixes**                                               | `sites/[siteId]/page.tsx` (h1), `stores/[storeId]/page.tsx` (overview), `leads/[leadId]/page.tsx` (hierarchy), `analytics/page.tsx` (aria), `accounts/app/apps/page.tsx`, `admin/app/page.tsx`, `saroh.in/app/page.tsx`           |
| **a11y / responsive / motion**                                     | `globals.css` (reduced-motion, skip-link), `sheet.tsx` (300ms), all pages (responsive padding, 44px targets), card-links, dialogs (titles)                                                                                        |
| **Net-new surfaces**                                               | new `app/{ai,marketing,automation,settings,commerce,appointments}/*` (empty-state-first)                                                                                                                                          |

---

## Executive summary

Saroh is a **coherent, modern-stacked product that is unfinished at the composition
layer.** Its foundation is genuinely good — self-hosted Inter, CSS-variable tokens
with dark mode, 46 current shadcn/Radix primitives, and (as of this session) a
single-sourced shell, theme, wordmark, and Tailwind preset — which is why
Readability (6.5) and Spacing (6.3) lead the scorecard and Scalability sits at 6.5.
But the app composes that good kit inconsistently: **three component sources, two
toast systems, eight container widths, three list idioms, hand-rolled forms with no
inline validation, a slate accent while the blue `--brand` token lights nothing, and
a shell with no search, no breadcrumbs, and — critically — no mobile navigation at
all.** The result is a **5.3/10 overall**, dragged by Loading (4.0), Forms (4.1), and
Guidance (4.5). The reassuring finding is that nearly every fix is **adoption, not
authoring** — `command`, `sheet`, `breadcrumb`, `table`, `skeleton`, `avatar`,
`pagination`, and `form` already ship at zero usage, so the redesign is mostly
assembly of primitives the product already owns, sequenced across ~100–135 person-days
in five milestones.

**Single most important next action:** ship **mobile navigation via the existing
`Sheet` primitive** (the `hidden lg:flex` header leaves phones with no way to reach
any section — a launch-blocking defect for merchants who live on their phones) and,
in the same shell pass, **retire the duplicate `apps/app.saroh.in/components/ui/`
component source** so there is one `Button`, one `dialog`, and one toast system to
build the rest of the redesign on. Everything in Sections 6–9 composes cleanly once
those two are done.
