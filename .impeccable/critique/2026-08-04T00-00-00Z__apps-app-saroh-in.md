---
target: apps/app.saroh.in (merchant workspace)
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
timestamp: 2026-08-04T00-00-00Z
slug: apps-app-saroh-in
supersedes: 2026-08-02T11-15-54Z__apps-app-saroh-in.md
---

Method: re-audit of the 2026-08-02 critique. **Every claim in the prior file was
re-measured against current code before being actioned** — several were already
fixed by the intervening redesign work, and one measurement in it no longer held.
Walked authenticated as an org owner against the seeded Northwind Supply data
(24 contacts, 16 leads, 10 orders, 4 bookings).

## Design Health Score

| #         | Heuristic                       | Was       | Now       | What moved it                                                                                                                                                                           |
| --------- | ------------------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 2         | 3         | No CTA 404s. Home carries evidence rows, not bare counts. `loading.tsx` on 10 of 12 list routes. Numbers on Home and counts on the rail share one source.                               |
| 2         | Match System / Real World       | 1         | 2         | "Fix" only where something is broken; "Set up" where nothing is connected. Provider states read Connected / Not connected / Not working. Still: "modules", "capabilities", "readiness". |
| 3         | User Control and Freedom        | 2         | 3         | Onboarding is a real, reversible choice. Density and filter choices persist and are shareable via `?view=`. Still no breadcrumbs.                                                       |
| 4         | Consistency and Standards       | 1         | 3         | Every list screen renders through one `DataView`; widths unified at `max-w-7xl`. Page titles on every route. Status colour maps to tokens everywhere.                                   |
| 5         | Error Prevention                | 2         | 2         | Unchanged this pass. The 15-same-weight-buttons problem on `/settings/modules` stands.                                                                                                  |
| 6         | Recognition Rather Than Recall  | 2         | 3         | ⌘K recalls contacts, leads and orders by name. Home rows name what they are about. Still: two Home rows can share a destination.                                                        |
| 7         | Flexibility and Efficiency      | 1         | 4         | The palette searches entities and offers create actions. Filters, sort, density toggle and deep links on every list. Still no saved views or bulk actions.                              |
| 8         | Aesthetic and Minimalist Design | 2         | 3         | Home fills the viewport as a dashboard. Borders are visible. Still no icons in empty states.                                                                                            |
| 9         | Error Recovery                  | 1         | 3         | The three dead-end paths resolve. Filtered-empty states name the narrowing rather than reading as "you have none".                                                                      |
| 10        | Help and Documentation          | 1         | 1         | **Unchanged.** No help link, docs link, tooltip or support contact anywhere. `docs.saroh.in` and `help.saroh.in` exist and are linked from nowhere.                                     |
| **Total** |                                 | **15/40** | **29/40** | Into the normal band (20–32), at the upper end.                                                                                                                                         |

## What was already fixed before this pass

Recorded because a re-audit that silently re-fixes solved problems teaches
nothing, and because one of these was measured wrong in the original.

- **Mobile header overflow (P0).** Reported as 61px of horizontal overflow with
  the account menu off-screen. **Measured now at 390×844: `scrollWidth` 390 vs
  `clientWidth` 390 — zero overflow, all seven controls on-screen.** Fixed by the
  intervening work; not touched again.
- **Home ranking chores above money (P0)** — severity sort landed earlier, and
  this week's rebuild added the evidence rows underneath.
- **Sidebar not sticky, not scrollable, Settings below the fold (P0)** — `sticky
top-0 h-screen` landed earlier; this week removed the `mt-auto` hole as well.
- **Onboarding enable-only with a fake affordance (P1)** — rewritten to a real,
  reversible choice.
- **Skip link, and the `<html>` hydration mismatch** — both fixed.
- **`filterNavGroups` failing open on an empty array** — now distinguishes `null`
  ("we could not find out", fail open) from `[]` ("nothing is enabled").

## What this pass fixed

### The three dead-end destinations (P0)

`/stores`, `/payments` and `/communications` still 404'd on a direct hit.
Nothing had emitted those links for a while and `pnpm check:routes` fails the
build if anything reintroduces one — but `/stores/new` and `/stores/[storeId]`
both exist, so a merchant trimming a URL back to its parent still died, as did
any bookmark of the old provider buttons. All three now redirect to the screen
that owns the job. **Verified 200**, along with `/appointments`.

### ⌘K was a decoy (P1, and the largest single gain)

It mapped `NAV_GROUPS` and nothing else. A new org-scoped search endpoint returns
contacts, leads and orders, each gated on **its own** read action — a palette is
a read surface like any other and must not become the one place a role sees rows
the list screens would refuse it.

One finding came out of verifying it: matching the whole query against each
column separately fails on the most natural input. "ananya rao" matched neither
`firstName` nor `lastName` nor the email. Every **word** must now match, each
anywhere on the record. Verified: "ananya rao" and "rao ananya" both find her;
"ananya bose" still finds nothing, so it did not loosen.

### Link purpose, and a failure this workspace was about to repeat

Three links whose entire accessible name was "Fix" (WCAG 2.4.4). Each now names
its provider — and "Fix" itself only appears where something is genuinely broken;
a provider nobody has connected says "Set up", because telling a merchant on day
one that something needs fixing is the product accusing itself.

Home was about to reproduce the same defect with five links named "Open". They
name their action now. **Verified: zero duplicate accessible link names on Home
and on Contacts.**

### Accessibility fundamentals

Focus rings on the rail, drawer and search trigger — all three fell back to
Chrome's default blue in exactly the place navigation happens most. `<aside>`
labelled (it announced as a bare "complementary"). Page titles on the four routes
that rendered the bare default. `autoComplete` on email fields app-wide and
name/phone on the customer form (WCAG 1.3.5 — there were zero attributes). The
search trigger raised to 44px below `md`; it measured 42×30.

### Legibility

`--border` measured **1.17–1.43:1** against its own surface across all six
skin/register pairs — a line nobody could see. That was defensible when a card
edge was ornament. It is not now the workspace is tables and that rule is what
tells one order from the next. Raised to **1.57–1.95:1**.

Deliberately **not** to 3:1: a 3:1 rule between every row of a dense table reads
as a spreadsheet cage and fights the data it organises. If a border ever carries
_meaning_ — state, selection, validity — that needs its own token at 3:1 rather
than a heavier `--border`.

## Still open, and honestly so

- **[P1] Help and documentation — score unchanged at 1/10.** There is still no
  help link, docs link, tooltip or support contact anywhere in the product, while
  `docs.saroh.in` and `help.saroh.in` exist as built apps linked from nowhere.
  This is the single largest remaining scoring gap and it was not touched.
- **[P1] `/settings/modules` renders 15 same-weight buttons.** Untouched.
- **Platform vocabulary.** "Modules", "capabilities", "readiness" survive in
  Settings. The nav was reframed to outcomes (Sell, Bookings, Customers) but the
  configuration surface still speaks in platform nouns.
- **No saved views, no bulk actions.** `DataView` has filters and sort; neither
  is persistable beyond the URL.
- **Empty states still pass no `icon`**, though `EmptyState` accepts one.
- **Touch targets** outside the header still sit below 44px in places.
- **`Fulfil` (British) coexists with `organization` (US).** Left alone on
  purpose: the entity is named `Organization` in the schema and in Better Auth,
  so changing the UI spelling alone would put the label out of step with the API
  it configures. Worth a decision, not a quiet edit.
- **Client-side filtering.** `DataFilter` predicates run over rows already
  loaded — right at hundreds, wrong at tens of thousands.

## Verification

752 API tests across 75 suites, `pnpm lint` and `pnpm build` clean,
`pnpm check:routes` resolving 46 destinations against 47 routes. Contrast
re-measured live across three skins × two registers. Console clean on Home,
Contacts, Leads and Bookings at 1440×900 and 390×844.
