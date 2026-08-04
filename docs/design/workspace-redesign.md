# Workspace redesign — plan

> Decided 2026-08-04. Skin: **Panel**. Mode: **Operate**, dashboard-first.
> Product truth: [`PRODUCT.md`](../../PRODUCT.md). Visual worlds:
> `packages/ui/src/globals.css` (`[data-skin]` scopes).
>
> **Status: steps 1–6 built and verified (2026-08-04).** What each step actually
> shipped, and what it deliberately did not, is recorded under it. The open
> items that survived are collected at the foot of the file.

## The problem this fixes

Changing the theme did not help, and the reason is structural rather than
visual. **Every screen in the app is the same shape**: `PageHeader` → one card
or one table → done. Home, Contacts, Leads, Services, Commerce and Sites are the
same scaffold with different nouns in it. Repainting a building whose rooms are
all identical does not make the rooms better.

Four specific failures, all visible against the seeded Northwind Supply data:

| What the merchant sees                                | What they needed                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contacts: 24 rows of name + email                     | Ananya Rao has an open ₹45,000 lead, two past orders, and a booking Thursday |
| Home: "Fulfil 5 open orders"                          | _Which_ five — oldest? largest? whose?                                       |
| Sidebar: 15 destinations by where data lives          | The work: what is due, what is waiting, who is asking                        |
| A booking today and one in three weeks look identical | Time is the primary axis of most of this data                                |

## Principles

1. **Density is a feature, not a compromise.** These users run a business from
   this screen. Show the data; do not protect them from it.
2. **The row must answer the question.** If a merchant has to click to learn
   something the list already knew, the list is under-built.
3. **Time is an axis, not a column.** Overdue, today, this week and later are
   different states, not different date strings.
4. **One primitive, every screen.** Tables, grids and lists are the same data in
   three densities — not three components maintained separately.
5. **Mobile is a different density, not a different product.** The same columns,
   collapsed by priority; never a feature-poor fallback.

## The core primitive: `DataView`

Everything below depends on this, so it is built first.

One component, three renderings of the same rows and columns:

- **Table** — the desktop default. Sortable, dense, tabular numerals, sticky
  header. This is the dashboard register.
- **Grid** — cards for visual/entity data (products with images, sites, services).
- **List** — the mobile default and the low-density option. Each row collapses to
  a primary line, a secondary line, and one action.

Rules that make it one primitive rather than three components:

- Columns declare a `priority` (`primary` | `secondary` | `detail`). The list
  rendering shows primary and secondary; the table shows everything; the grid
  chooses by card slot. **Adding a column adds it everywhere.**
- The toggle is **user preference, persisted per view**, defaulting to table on
  `lg+` and list below. A merchant who prefers list on desktop keeps it.
- Sort, filter, empty, loading and error states live in the primitive, so no
  screen re-implements them and none of them get forgotten.
- Numeric columns are tabular-figure and right-aligned by default; money carries
  its currency once in the header, not on every cell.

## Build order

Each step ships working and is judged before the next starts.

### 1. `DataView` primitive — table / grid / list + toggle

`components/shared/data-view/`. No screen changes yet; built against Contacts as
the first consumer.

**Done when:** a column added once appears in all three renderings; the toggle
persists; empty, loading and error render without the caller writing them.

### 2. Contacts — the pattern screen ✅

The most data-heavy list with real seeded volume (24 rows). Columns: name,
company, **open pipeline** (value + count), **next booking**, source, added.

`ContactsService.list` gained the rollup: three `groupBy` aggregates for the
whole page, not one query per contact, each gated on the actor's own permission
for the data it reads (`lead:read`, `booking:read`) rather than riding on
`contact:read`.

**There is no "last order", on purpose.** Orders hang off a commerce `Customer`,
joined to a CRM `Contact` only through a hand-made `CustomerIdentityLink` (#120).
Matching the two by email instead IS the auto-linking SEC-005 / ARCH-001 have not
approved, and rendering the column from today's sparse links would print "no
orders" against customers who have ordered. A wrong fact drawn confidently is
worse than an absent one.

**Done when:** a merchant can answer "who is worth calling today" without
leaving the screen. ✅

### 3. Home — a real dashboard ✅

Not restyled: rebuilt. The ranked action list stays as the spine, but each row
carries its own evidence.

- **Needs you** — the ranked ladder, each row naming what it is about. The API
  now returns up to five `HomeEvidence` rows per action (oldest first) plus the
  true `count`, so "5 of 23" is stated rather than implied.
- **Coming up** — the schedule, grouped by day, each booking in **its own**
  timezone. Not "Today": an Organization has no single zone to fold bookings
  into, so the client groups by each booking's own day and the API never guesses.
- **Numbers** — counts that are _links into filtered views_. "Open leads" lands
  on `/leads?view=open`, not on an unfiltered list.

Numbers sit **last**, against dashboard convention. A merchant opening this page
asks "what needs me?", and answering with a wall of counts puts the least
actionable thing in the most valuable space.

Two gating rules the read model now distinguishes:

- **Actions** require `ACTIVE` — pointing someone at a module that is not ready
  is sending them at a door that does not open.
- **Read-only bands** (schedule, numbers) require only _available_ (`!== DISABLED`),
  which is the rule the sidebar already filtered on. Appointments with no
  availability windows is `SETUP_REQUIRED` — it cannot take a _new_ booking, but
  the bookings already on the books are real appointments someone must turn up
  for. Gating the schedule on `ACTIVE` hid them from Home while the sidebar still
  linked to them: the workspace contradicting itself.

**Done when:** the primary action is obvious in one glance and every number on
screen is clickable to the thing it counts. ✅

### 4. Sidebar — from filing cabinet to workspace ✅

Two changes, both about work rather than places:

- **Counts on the rail.** "Leads" names a place; "Leads 4" names a job. The
  numbers come from the same Home read model that ranks the actions, so the rail
  and Home cannot disagree. Only `OVERDUE` actions earn a badge — badging "Add a
  product to your catalog" would train merchants to ignore badges within a week.
- **`/appointments` dropped from the rail.** It was a hub page of link cards
  pointing at Schedule, Services and "Availability" — every one already a line
  beneath it, and two of the three linked to the _same_ route, so "Availability"
  landed somewhere that never mentions the word. Its counts moved to Home. The
  URL redirects to `/bookings`, so no bookmark breaks.

### 5. The remaining list screens ✅

Leads, Services, Bookings, Orders and Products all render through `DataView`.
Each gained the column that makes its row self-sufficient — age on Leads and
Orders, price and duration as sortable columns on Services, the booker's linked
contact on Bookings — plus filter chips and the density toggle.

`DataView` grew `rowActions` for this: Bookings needs an inline Cancel, and
dropping it below `lg` would have made the phone a feature-poor fallback rather
than a different density. Actions render as a _sibling_ of the row link, never
inside it, so a cancel tap does not also navigate.

Two status-colour bugs fell out of the conversion. `variant="default"` resolves
to `--primary`, the luminous action colour in Panel and Instrument — so UNPAID
and PENDING were drawn in the same register as DELIVERED. Money owed is amber
now; money received is brand.

### 6. Light-register review ✅

Measured, not eyeballed: 78 foreground/background pairs across three skins × two
registers, compositing every ancestor's alpha down to the page base. Everything
now clears 4.5:1. Three defects found:

1. **`bg-warning/15 text-warning` measured 2.3:1 in every light skin.** `--warning`
   is a FILL and cannot double as text on a pale tint. Added the
   `--warning-subtle` / `--warning-subtle-foreground` pair that `brand` and
   `highlight` already had, in all eight scopes.
2. **`--highlight-foreground` and `--warning-foreground` were `0 0% 100%` in
   every skin** — white on mid amber is 2.7:1, white on hazard orange 3.1–3.7:1.
   They now carry a near-black of the fill's own hue. **Except** Instrument's
   light red, where white measures 5.25:1 and near-black only 3.47:1: the rule is
   _measure against the fill_, not _use dark text_.
3. The base `:root` / `.dark` identity was already correct, which is why this
   only ever affected the workspace — nothing else sets `data-skin`.

## Constraints carried from the audit

- Capability gating is unchanged: a merchant with Commerce off never sees Sell.
- No route changes; URLs are stable and `pnpm check:routes` enforces it.
- No claim may imply the unified customer record before auto-linking ships
  (SEC-005 / ARCH-001). Contacts stays "Contacts".
- `--accent` is a shadcn neutral with 32 usages, not a brand accent.
- Merchant sites (`sites.saroh.in`) never inherit Saroh's brand.

## Bugs this work surfaced and fixed

Recording these because each was invisible until something forced it into view,
and each would come straight back if the reasoning is lost.

- **Hydration failed on every list screen.** `useViewMode` read `localStorage` in
  a `useState` lazy initialiser, so the client's first render disagreed with the
  server's HTML the moment a preference existed, and React 19 discarded the tree.
  Resolving in an effect fixes hydration but trips
  `react-hooks/set-state-in-effect`. `useSyncExternalStore` satisfies both: its
  `getServerSnapshot` is used for SSR **and** the hydration render, so the two
  agree by construction.
- **`Intl` with `undefined` locale.** Node and the browser resolve different
  defaults, so "3 Aug 2026" hydrated as "Aug 3, 2026". Every formatter now pins
  `DISPLAY_LOCALE` (`lib/format/locale.ts`). `hour12: true` is stated explicitly
  because `en-GB` is a 24-hour locale and a bug fix must not silently change what
  the merchant reads.
- **Dates without an explicit `timeZone`.** Production servers run UTC; merchants
  do not. `suppressHydrationWarning` is a trap here — it silences the warning by
  _keeping the server's text_, leaving the viewer reading the UTC date forever.
  `<ViewerDate>` renders UTC for the agreed first paint and corrects to the
  viewer's zone via a client snapshot.
- **A raw `<script>` between `<html>` and `<body>`.** The browser hoists it into
  `<head>`, so React's tree no longer matched the DOM. `suppressHydrationWarning`
  on `<html>` does not cover it — that flag applies to the element's own
  attributes, not a child that moved. The skin pre-paint script is now the first
  child of `<body>`.
- **Bookings said "Unknown booker" for people the CRM knew.** The list endpoint
  did not join the contact while Home did, so the two screens disagreed about who
  a booking belonged to on the same visit.

## Open

- **Skin preference storage.** Currently `localStorage`, so it is per-browser.
  For a shared 2–5 person workspace it likely wants to be per-user on the server.
- **Per-user vs per-organization** for the skin choice itself.
- **Locale is pinned, not chosen.** `DISPLAY_LOCALE` is a placeholder for a real
  per-user preference. When one exists it replaces the constant, and the
  hydration fix still holds because the value travels with the render instead of
  being sniffed from the environment.
- **Filtering is client-side.** `DataFilter` predicates run over rows the page
  already loaded — right at hundreds of rows, wrong at tens of thousands. When a
  list outgrows one page this moves into the query; the `?view=` contract that
  Home's tiles link to stays the same either way.
- **`--brand`/`--highlight` tinted badges (`bg-brand/15`) were measured and pass,
  but they are ad-hoc alpha rather than tokens.** They should become
  `brand-subtle` pairs like `warning` now has, so the next skin cannot
  reintroduce the same 2.3:1 failure by changing one fill.
- **Panel's light `--highlight` clears the floor at 4.70:1** — a pass, but the
  slimmest one on the board. Deepening the fill would buy headroom at the cost of
  changing the identity, so it is flagged rather than changed.
- **Contacts still has no "last order"** — blocked on SEC-005 / ARCH-001, see
  step 2.
