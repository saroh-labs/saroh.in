# Workspace redesign — plan

> Decided 2026-08-04. Skin: **Panel**. Mode: **Operate**, dashboard-first.
> Product truth: [`PRODUCT.md`](../../PRODUCT.md). Visual worlds:
> `packages/ui/src/globals.css` (`[data-skin]` scopes).

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

### 2. Contacts — the pattern screen

The most data-heavy list with real seeded volume (24 rows). Columns: name,
company, source, **open lead value**, **last order**, **next booking**. That last
three are the point — they are what makes it a customer record rather than an
address book, and they come from data the API already has.

**Done when:** a merchant can answer "who is worth calling today" without
leaving the screen.

### 3. Home — a real dashboard

Not restyled: rebuilt. The ranked action list stays as the spine, but each row
carries its own evidence.

- **Needs you** — the ranked ladder, each row naming what it is about: the five
  open orders with age and value; the overdue leads with who and how much.
- **Today** — bookings on a time axis, now-marker, next up.
- **Numbers** — a small band of counts that are _links into filtered views_,
  never decorative tiles.

**Done when:** the primary action is obvious in one glance and every number on
screen is clickable to the thing it counts.

### 4. Sidebar — from filing cabinet to workspace

Reframed from places to work. Fewer destinations, each answering a question.
Keeps capability gating and every existing URL; this is grouping and naming.

### 5. The remaining list screens

Leads, Orders, Products, Bookings, Services — each adopting `DataView` with the
columns that make its row self-sufficient.

### 6. Light-register review

The three skins' light values are written but unreviewed. Bright shop-floor use
makes this functional: every skin needs a measured contrast pass in both modes
before anyone relies on it.

## Constraints carried from the audit

- Capability gating is unchanged: a merchant with Commerce off never sees Sell.
- No route changes; URLs are stable and `pnpm check:routes` enforces it.
- No claim may imply the unified customer record before auto-linking ships
  (SEC-005 / ARCH-001). Contacts stays "Contacts".
- `--accent` is a shadcn neutral with 32 usages, not a brand accent.
- Merchant sites (`sites.saroh.in`) never inherit Saroh's brand.

## Open

- **Skin preference storage.** Currently `localStorage`, so it is per-browser.
  For a shared 2–5 person workspace it likely wants to be per-user on the server.
- **Per-user vs per-organization** for the skin choice itself.
