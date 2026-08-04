---
target: apps/app.saroh.in (merchant workspace)
total_score: 15
max_score: 40
na_heuristics:
p0_count: 4
p1_count: 2
timestamp: 2026-08-02T11-15-54Z
slug: apps-app-saroh-in
---

Method: dual-agent (A: design review · B: detector + browser evidence, isolated)

Target: `apps/app.saroh.in` — merchant workspace · Mode: **Operate** · Walked authenticated as an org owner with all 8 modules enabled.

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                                                                                                                                            |
| --------- | ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 2         | Three CTAs 404 with no prior signal. Commerce badged **Active** while `/commerce` says "No sales channels yet". Analytics says `Orders 0` while Home says "Fulfil **1** open order". `loading.tsx` on only 4 of ~12 routes.                                          |
| 2         | Match System / Real World       | 1         | "Modules", "capabilities", "readiness", "providers & health", "sales channels" is platform-engineering vocabulary. **"Fix"** on a provider that was never configured is factually false. Four names for one object: Commerce / sales channels / store / storefronts. |
| 3         | User Control and Freedom        | 2         | Onboarding is enable-only (`disabled={pending \|\| isOn}`) — it cannot undo itself. `/sites/new` has no back link. No breadcrumbs. Credit: the Disable confirm dialog is excellent.                                                                                  |
| 4         | Consistency and Standards       | 1         | **Seven hand-rolled content widths** across 22 pages; the column jumps on every navigation. `MaxWidthWrapper` exists and is used by none of them. Page `<title>` missing on ~6 routes. Header action slot means three different things.                              |
| 5         | Error Prevention                | 2         | `/settings/modules` renders 15 same-weight buttons (7 "Finish setup", 8 "Disable"). Subdomain field has no format hint, no `.saroh.in` suffix, no availability check. Credit: Disable `AlertDialog` names consequences and labels escape "Keep enabled".             |
| 6         | Recognition Rather Than Recall  | 2         | Home rows 3 and 4 lead to the same page with no disambiguation. Module-card "Resolve" links restate Home's actions with no shared completion state. ⌘K cannot recall any entity.                                                                                     |
| 7         | Flexibility and Efficiency      | 1         | **⌘K is a decoy** — it maps `NAV_GROUPS` only, so "Search or jump to…" returns "No results found" for a customer name. No skip link, no saved views, no filters, no bulk actions. Sidebar is `position: static` and scrolls away.                                    |
| 8         | Aesthetic and Minimalist Design | 2         | Restraint has tipped into blankness. Home is `max-w-3xl` on 1440px — ~670px dead gutter — while stacking 8 competing rows. Eight identical icon-less grey boxes is absence, not minimalism.                                                                          |
| 9         | Error Recovery                  | 1         | Three primary paths end at "Page not found — doesn't exist, **or you don't have access to it**" (ambiguous blame). The Automations card states a blocker with **no** "Finish setup" — only "Disable".                                                                |
| 10        | Help and Documentation          | 1         | No help link, docs link, tooltip, or support contact anywhere in the product. `docs.saroh.in` and `help.saroh.in` exist as apps and are linked from nowhere.                                                                                                         |
| **Total** |                                 | **15/40** | **Poor — substantive rework, not polish**                                                                                                                                                                                                                            |

Most real interfaces land 20–32. This sits below that band, driven almost entirely by three broken primary CTAs and an activation path where 2 of 8 actions work.

## Design Specificity Verdict

**Category-interchangeable.** Swap the wordmark and this is any B2B SaaS admin shell from 2024–2026: left rail with uppercase group labels, lucide icons, shadcn `Card`, dashed-border centred empty state, navy primary. No composition on any route could only belong to _this_ product.

Conspicuously absent for an India-first small-business platform: **no ₹ anywhere** (Analytics tiles are Site views / Unique visitors / Enquiries / Orders — no money at all), no GST, no UPI/Razorpay naming in Providers, no WhatsApp in Communications. `EmptyState` accepts an `icon` prop and **not one of the eight empty states passes it**.

The one proprietary idea — _turn on capabilities as you grow_ — is rendered as a settings list and an all-on checklist. It is configuration, never narrative. **The differentiator is buried in Settings, below the fold.**

**Deterministic scan — important caveat.** `detect.mjs --json apps/app.saroh.in` exits 0 with `[]`, and **that zero carries no signal**: the detector short-circuits on Next.js projects and scans none of the 121 `.tsx` files. Verified with a canary file (exit 2, `bounce-easing`), so the engine works — this is a coverage gap. URL mode is unavailable (`puppeteer is required`). The real deterministic evidence is the in-page overlay, which is the same rule engine.

**Overlay results** (5 pages): `gradient-text` 5/5 · `layout-transition` 5/5 · `skipped-heading` 2/5 · `line-length` 2/5.

- `gradient-text` — **false positive.** It is the brand wordmark (`packages/ui/.../wordmark.tsx`), a legitimate gradient logotype; the rule targets gradient body copy.
- `layout-transition` — **false positive.** No `transition: height` exists in app or `@saroh/ui` source; it matches vendored sonner/cmdk/Next-overlay CSS.
- `skipped-heading` — **genuine**, independently confirmed by DOM walk and by Assessment A on different routes.
- `line-length` — genuine, 101–104 chars at 1440px, advisory.

## Overall Impression

The engineering underneath is better than the experience on top. Navigation is driven by a single `NAV_GROUPS` array that feeds sidebar, mobile drawer and ⌘K, module-gated — the right abstraction. Contrast passes everywhere. Console is clean on 5 of 6 routes. Forms are fully labelled.

But a merchant's first session is: onboarding turns on all 8 modules without asking, Home hands them 8 setup chores, and **2 of those 8 destinations actually work.** The single item marked `Overdue` — "Fulfil 1 open order", the only revenue-bearing action in the product — links to `/stores`, which is a 404.

**The biggest opportunity:** stop defaulting every module on. That one line of logic is upstream of the 8-row Home wall, the 7 "Setup required" cards, and the 15-item rail. One deliberately chosen goal produces one focused Home, one action, one empty state to fill.

## What's Working

1. **`nav-items.tsx` as single source of truth.** One `NAV_GROUPS` array plus `filterNavGroups()` drives desktop rail, mobile drawer and command palette, gated on live module availability. Desktop and mobile provably cannot drift. This is the correct architecture for the scale goal — the problem is what it renders, not how it is wired.
2. **The Disable confirmation dialog.** It states the consequence ("New activity stops and {label} leaves the navigation"), removes the fear ("Existing data is preserved"), pre-explains the 409 safeguard, and labels the escape **"Keep enabled"** rather than "Cancel". The one place in the app where copy does real emotional work.
3. **Accessibility fundamentals are cleaner than expected.** Zero unlabelled inputs, zero buttons without accessible names, zero images without alt across the routes measured. All text contrast passes (body 5.96:1, primary button 13.74:1, sidebar active 15.55:1). `prefers-reduced-motion` implemented. These are the expensive things to retrofit and they are already right.

## Priority Issues

### [P0] Three primary call-to-actions terminate in "Page not found"

Verified by `fetch()`: `/stores` → **404**, `/payments` → **404**, `/communications` → **404**.

- Home's only `Overdue` row, "Fulfil 1 open order" → `/stores`
- `/settings/providers` → Payments "Fix" → `/payments`
- `/settings/providers` → Communications "Fix" → `/communications`

Home rows 3 and 4 both route to `/settings/providers`, whose only two actions are these two 404s. The entire payments-setup and messaging-setup path is broken, and so is the one genuinely urgent piece of work.

**Why it matters:** this is the trust floor. A merchant clicking the thing labelled "Overdue" and landing on "doesn't exist, or you don't have access to it" concludes the product is not real. No downstream polish recovers from that.

**Fix:** repoint to real routes, or suppress the action server-side in the Home producer rather than emitting an unroutable `href`. Add a build-time assertion that every `HomeAction.href` and `blocker.actionHref` resolves in the app router.

**Command:** `$impeccable harden`

### [P0] The merchant's account menu is off-screen on mobile

At 390×844: `clientWidth` 390 vs `scrollWidth` **451 — 61px of horizontal overflow.** The header's right cluster (`app-header.tsx:71`, `flex items-center gap-2 sm:gap-4`) holds OrganizationSwitcher + ThemeToggle + UserMenu with no `min-w-0`, no shrink, no truncation. The org switcher alone is 175px. The theme toggle is clipped at the edge; the user avatar sits entirely outside the viewport at `left: 411, right: 451`.

**Why it matters:** sign-out, account and org switching are unreachable on a phone. For a segment whose owners run the business from a phone, the primary chrome is broken — and it is the kind of defect that never shows up in desktop review.

**Fix:** `min-w-0` + truncation on the switcher, collapse it to an avatar-only trigger under `sm`, or move it into the mobile drawer.

**Command:** `$impeccable adapt`

### [P0] Home ranks chores above money, and grows with modules rather than work

`NextActions` renders `primary` in a card, then dumps the rest as an undifferentiated 7-row list **in source order**. Six "Setup" chores therefore rank above the single `Overdue` item. Two of the eight rows are not actions at all — _"Insights become available once your modules produce activity"_ is a status sentence wearing a Setup badge and an Open button; _"Create a pipeline to start tracking leads"_ is an instruction the destination explicitly refuses.

**Why it matters:** this is the daily landing screen and the stated engagement surface. It teaches "Saroh is where my to-do list lives", not "where my business runs". And because each enabled module contributes ≥1 blocker, Home scales with _module count_, not with work — 12 modules means 12 rows and real work sinks further.

**Fix:** sort by severity descending, not source order. Cap visible actions at 3 with the rest collapsed. Split into **"Needs you now"** (orders, enquiries, bookings) above **"Finish setting up"** so real work never sits below a chore. Drop Setup items with no actionable destination.

**Command:** `$impeccable layout`

### [P0] The sidebar cannot scroll, does not stick, and pushes Settings below the fold — this is the scale failure

Measured at 1440×800: `aside.scrollHeight` = **1318px**; the last three items (`Organization`, `Modules`, `Providers`) sit at `bottom: 832 / 872 / 912` — all below an 800px fold. `position: static`, so the rail is not sticky; on a long page the whole nav scrolls away. `nav` carries `overflow-y-auto` but `aside` has unbounded height (`flex min-h-screen`, not `h-screen`), so the overflow rule never engages.

Compounding: **three of six groups contain exactly one item.** `COMMERCE → Commerce`, `WEBSITE → Sites`, `INSIGHTS → Analytics` each spend a ~28px heading to introduce one 36px link.

**Why it matters:** `Settings → Modules` is the only place to turn a capability on or off — and the onboarding screen explicitly points at it. On a standard laptop it is invisible. **Every module added makes this strictly worse:** each arrives as heading + 1–3 links (~64–150px), so at 10 modules Settings is ~200px below the fold. This is the concrete answer to "will this scale" — today, no.

**Fix:** `h-screen sticky top-0` on `aside` so the existing `overflow-y-auto` engages; collapse single-item groups to bare links; pin Settings to a `mt-auto` footer region so its position is stable regardless of module count; add the missing skip link.

**Command:** `$impeccable layout`

### [P1] Onboarding turns everything on, cannot turn anything off, and fakes its own affordance

`ModuleGoalPicker` initialises from what the server already has enabled and renders `disabled={pending || isOn}` with the label **"Enabled"** — eight cards, all already on, each with a button-shaped element that does nothing when clicked and **no path to turn anything off**. It also renders inside the full 15-item shell, contradicting `AppShell`'s own stated principle that the funnel stays uncluttered.

**Why it matters:** this screen asks a genuinely good question — _"What does your business need to do?"_ — then pre-answers it with "everything". That default is the upstream cause of the 8-row Home, the 7 "Setup required" cards, and the 15-item rail. The fake decision also destroys the screen's persuasive value: nothing was chosen, so nothing is owned.

**Fix:** default all modules **off**. Ask for **one** goal to start ("What's the first thing you want to do?") with the rest behind "Add more later". Make the card a real toggle so the choice is reversible in place. Render chrome-free like the zero-org step.

**Command:** `$impeccable onboard`

### [P1] The primary navigation has no design-system focus ring, and there is no skip link

`grep -rn 'focus-visible' apps/app.saroh.in` → **0 matches.** `@saroh/ui`'s Button ships the correct token ring (`focus-visible:ring-2 ring-ring ring-offset-2`), but every hand-rolled interactive element bypasses it: `app-sidebar.tsx:62` (all 15 nav links), `mobile-nav.tsx:83`, `command-trigger.tsx`. They fall back to Chrome's default `rgb(0,95,204)` ring, which does not match the design system.

No skip link exists, so a keyboard user tabs **~19 stops** before reaching `<main>` on every page — and that count grows with every module added.

**Why it matters:** the focus ring is the keyboard user's cursor. It is inconsistent precisely where navigation happens most. Combined with the missing skip link, the keyboard experience degrades with each capability — the same scale problem as the rail, in accessibility form.

**Fix:** apply the token ring in the three files; add a skip link to `AppShell`; give `<aside>` an `aria-label` and `<main>` an `id`.

**Command:** `$impeccable audit`

## Persona Red Flags

**Alex (impatient power user)** — ⌘K is a decoy: it maps `NAV_GROUPS` with `value={item.label}`, so it contains exactly the 15 links already visible in the rail. Placeholder says "Search or jump to…"; typing a customer name returns "No results found". He tries once, gets burned, never opens it again. No action commands despite `/services/new`, `/sites/new`, `/stores/new` existing as routes. Seven ghost links on Home all labelled identically "Open" — he cannot target by label. Sidebar scrolls away on `/settings/modules`. No filters, sorts, saved views or bulk actions anywhere.

**Sam (keyboard + screen reader)** — ~19 tab stops before content on every page, no skip link. Link purpose fails WCAG 2.4.4 systemically: three links whose entire accessible name is "Fix", seven named "Open". Heading skip `h1 → h3` on `/settings/providers` and `/onboarding/modules`, confirmed independently by both assessments. `<aside>` has no `aria-label` (announces as bare "complementary"); `<main>` has no accessible name. The onboarding "Enabled" control is a `disabled` button — the reader announces "Enabled, button, dimmed" eight times, communicating _state_ through a _control_ role. Zero `autoComplete` attributes app-wide including `type="email"` fields (WCAG 1.3.5).

**Jordan (confused first-timer)** — lands on a chore list of seven grey "Setup" badges with no explanation of what Saroh does, no sample data, no tour, no help link. Meets vocabulary she has never seen: "modules", "capabilities", "readiness", "providers & health". Hits the circular CRM copy — `/contacts` says contacts arrive when you create a lead from a contact; `/leads` says create one by hand from a contact; `/pipeline` says one is created automatically. Three consecutive screens, zero buttons, no entrance to the loop. "Fix" tells her something is already broken on day one, then both money paths 404. `/sites/new` has no back link, and its "Subdomain (optional)" field never shows what URL results.

**Casey (distracted mobile)** — the account menu is off the right edge of the screen (61px overflow). No bottom tab bar: every context switch is tap-hamburger → scroll a 15-item sheet → tap. No control anywhere in the app reaches 44×44 (passes WCAG 2.2 AA at 24×24, fails AAA/HIG universally); the mobile search trigger is 42×30 and the brand link 49×27.

## Minor Observations

- **React hydration mismatch on first visit** — `app/layout.tsx:35` renders `<html lang="en">` without `suppressHydrationWarning` while next-themes mutates `className` and `color-scheme` client-side. Surfaces on the no-stored-preference path, i.e. every genuinely new user. Same defect I fixed on `saroh.in` earlier; this app still has it.
- **`/settings` is an orphan** — not in the sidebar, reachable only by URL, and its three cards duplicate the three SETTINGS sidebar links exactly.
- **Page `<title>` missing on ~6 routes** (`/contacts`, `/leads`, `/pipeline`, `/services`, `/sites`, `/notifications`) — they render the bare default "Saroh". Tab title is how a merchant with six tabs finds this one.
- **Label drift on identical destinations** — `Providers` vs `Providers & health`; `Sites` vs `Your sites`; `Bookings` vs `Schedule`.
- **`/appointments` is a hub duplicating three sidebar items** sitting ~200px to its left; only `Availability` has no sidebar equivalent.
- **Automations card describes a blocker with no `actionHref`** — it names a problem and offers only "Disable".
- **`loading.tsx` on only 4 routes** — contacts, leads, pipeline, bookings. Commerce, sites, services, analytics, settings have none, so perceived latency is inconsistent route to route.
- **`filterNavGroups` fails open** — `if (availableModuleKeys.length === 0) return [...groups]`, so during a dark rollout every org sees every module's nav regardless of entitlement.
- **Card/divider border measures 1.28:1** against the page. Defensible under 1.4.11 (decorative, and `--input` is separately compliant at 3.23:1), but card edges are near-invisible — worth revisiting as legibility rather than compliance.
- **`Fulfil` (British) coexists with `organization` and `Analytics` (US).**
- Root `metadata.description` says "storefronts", a word used nowhere in the UI.

## Questions to Consider

1. **If a merchant never opened Settings, would they know Saroh is modular?** The differentiator currently lives in a settings list that falls below the fold. What if capability growth were surfaced at the moment of need — "you've outgrown this, turn on Payments" — rather than as configuration you have to find?
2. **Why does Home rank chores above money?** What if it refused to show a single Setup item on any day where real work exists, and setup lived in a separate dismissible strip that shrinks as it completes?
3. **What is the one screen a merchant opens Saroh for at 9am?** Nothing currently answers this. Home answers "what have I not configured" — a setup wizard that never graduates into an operating surface.
4. **Should nine modules mean nine nav groups?** The rail is a 1:1 projection of the capability graph. What if navigation were driven by what the merchant _does_ (Sell / Serve / Reach / Grow) so a new capability slots into an existing group instead of appending a heading?
5. **What if a new org shipped with a seeded demo store, three products and two orders — flagged as sample, one click to clear?** Every empty state exists only because there is nothing to show.
6. **Is "Fix" the right word for something that was never broken?** What would this app read like if every string were written by a shop owner in Pune rather than by the people who built the platform?
