# 12 · Implementation Plan

> **Status:** Phased delivery plan (docs-only). Sequences the [11 · Design Backlog](./11_DESIGN_BACKLOG.md) into five milestones and connects them to the [08 · User Journeys](./08_USER_JOURNEYS.md).
> **Anchor:** _Saroh Canvas_ — one product, one primary action per screen, progressive disclosure, minimize clicks.
> **Ground truth:** `app.saroh.in` App Router (36 routes) + `@saroh/ui` (46 shadcn/Radix primitives) as of 2026‑07‑20.

## Starting reality — what THIS session already shipped (M0, done)

The plan does **not** start from zero. The following foundations landed this session and are treated as **complete**; milestones build on them rather than re-doing them.

| Shipped                                                                          | Evidence                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Shared `AppHeader` app-shell (brand, org switcher, nav, sign-out, notifications) | `components/shared/app-header.tsx`, rendered once in `app/layout.tsx` (#98, #99) |
| Design tokens wired into Tailwind (`--brand`)                                    | Tailwind preset (#91, #92)                                                       |
| Route-level loading / error / not-found boundaries                               | `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` (#100)                   |
| Self-hosted Inter (variable)                                                     | `localFont(InterVariable-latin.woff2)` in `app/layout.tsx` (#96)                 |
| Shared `ThemeProvider` (light default, system enabled)                           | `@saroh/ui/theme-provider` in `app/layout.tsx` (#95)                             |
| Single-source Wordmark (was 4 copies)                                            | `@saroh/ui/wordmark` (#93)                                                       |
| `@saroh/ui` source-consumption contract                                          | `packages/ui` (#94)                                                              |
| Component gallery app                                                            | `apps/ui.saroh.in/*` (#97)                                                       |

**Implication:** M1 is a _hardening/systematizing_ pass on tokens (not a green-field build), and M2 can extend an existing shell instead of inventing one.

---

## Milestone overview

| M      | Theme                                                       | Primary journeys unblocked | Backlog items                                              | Rough effort |
| ------ | ----------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- | ------------ |
| **M1** | Tokens · type · spacing · buttons · forms · icons           | foundations for all 11     | D‑12, D‑21, D‑29–D‑33, D‑46, D‑50, D‑52, D‑54              | ~14–19 pd    |
| **M2** | App-shell · sidebar · topbar · search · nav (goal-based IA) | 1,4,7,10,11 (findability)  | D‑02–D‑05, D‑17, D‑18, D‑48, D‑59                          | ~18–24 pd    |
| **M3** | Dashboard/Home · CRM · Website                              | 1,2,3,4,5,6                | D‑01, D‑06, D‑07, D‑08–D‑11, D‑13, D‑14, D‑43, D‑56, D‑57  | ~22–30 pd    |
| **M4** | Commerce · Appointments · Marketing · Analytics             | 6,7,8,9                    | D‑15, D‑16, D‑23, D‑23a, D‑24, D‑25–D‑28, D‑39, D‑47, D‑55 | ~26–34 pd    |
| **M5** | a11y · animations · dark-mode · performance · AI            | 11 + cross-cutting         | D‑34–D‑38, D‑40, D‑42, D‑44, D‑45, D‑53, D‑58, D‑60, D‑51  | ~20–28 pd    |

Total ≈ **100–135 person-days**. Milestones are largely sequential (each depends on the prior's foundations) but M4 sub-tracks (Commerce / Appointments / Marketing) can fan out in parallel once M2+M3 land.

---

## Milestone 1 — Foundations: tokens, type, spacing, buttons, forms, icons

**Goals:** make every later screen composable from a consistent, tokenized primitive layer, so M2–M5 stop re-inventing widths, headings, and error patterns.

**Deliverables (exact):**

- **Type scale** tokens (display/h1/h2/h3/body/caption) in the Tailwind preset; replace ad-hoc `text-2xl`/`text-lg` in `app/**` — D‑31.
- **Spacing + container** tokens: canonical content/wide/narrow widths to replace the `max-w-4xl` / `max-w-5xl` / `max-w-6xl` / `max-w-lg` sprawl — D‑30.
- **`<PageHeader>`** shared component (title + description + one primary-action slot) — D‑29, D‑11.
- **Button** loading state (spinner + label swap) on `@saroh/ui/button` — D‑46.
- **Form** pattern: adopt `@saroh/ui/form` (react-hook-form) as the standard; document inline-error + `aria-invalid` conventions; refactor `create-organization-form.tsx` as the reference — D‑21.
- **Progressive-disclosure** convention for create forms (advanced fields collapsed) — D‑12.
- **Status/badge** semantic tokens + `<StatusBadge>` (won/lost/pending/draft/live) — D‑32.
- **Icon system**: pick one set (lucide), sizes, usage doc — D‑33.
- **Elevation/shadow/border** tokens — D‑52; **Wordmark** size/clearspace — D‑50; central **formatters** in `@saroh/utils` — D‑54.

**Affected apps/packages/files:** `packages/ui` (preset, `button.tsx`, `form.tsx`, `badge.tsx`, `wordmark.tsx`, new `page-header.tsx`), `packages/utils`, `apps/app.saroh.in/app/globals.css`, `apps/ui.saroh.in` (document tokens).

**Acceptance criteria:**

- No `text-{size}` or `max-w-*` literals for structural type/width in `app/**` — all via tokens/`PageHeader` (grep-enforceable).
- `create-organization-form.tsx` uses `@saroh/ui/form`; a second form (product) follows the same pattern.
- Button shows a loading state on any async submit; double-submit is impossible.
- Status colors come from one map; gallery shows every badge/status variant.

**Effort:** ~14–19 pd. **Risks:** token churn ripples across all apps (mitigate: land preset first, migrate app-by-app behind no visual-regression). **Deps:** M0 tokens (#91/#92) — done.

---

## Milestone 2 — App shell: sidebar, topbar, search, goal-based nav

**Goals:** make every job **findable** by moving from object-nav to goal-nav, adding search, and fixing the mobile-nav _hole_.

**Deliverables:**

- **Goal-based IA** rewrite of `NAV[]`: Home·Website·Customers·Appointments·Commerce·Marketing·Insights·Automation·AI·Settings — D‑02. (Routes may alias existing ones until M3/M4 move them.)
- **Left sidebar shell** (collapsible) + slim **topbar** (org switcher, search, account) — D‑05; refactor `app/layout.tsx` + `app-header.tsx`.
- **⌘K command palette** wiring the existing `@saroh/ui/command` over entities + quick actions — D‑04.
- **Mobile nav**: bottom bar / `sheet` drawer — the current `hidden … lg:flex` leaves phones with none — D‑03.
- **Single org switcher**: remove the duplicate in `stores/[storeId]/layout.tsx` — D‑17.
- **Breadcrumbs** on nested store routes via `@saroh/ui/breadcrumb` — D‑18.
- **Touch targets** ≥44px in nav; **responsive form** reflow at 320/390 — D‑48, D‑59.

**Affected files:** `app/layout.tsx`, `components/shared/app-header.tsx` (→ split into `sidebar.tsx` + `topbar.tsx`), new `command-palette.tsx`, `mobile-nav.tsx`, `app/stores/[storeId]/layout.tsx`, `packages/ui/src/components/ui/{command,breadcrumb,sheet}.tsx`.

**Acceptance criteria:**

- All 10 goals reachable from one nav on desktop **and** mobile; nav no longer overflows.
- ⌘K opens from any route, searches ≥4 entity types, runs ≥3 quick actions, is keyboard-accessible.
- Exactly one org switcher renders on a store page.
- Every nested store route shows a breadcrumb trail.

**Effort:** ~18–24 pd. **Risks:** sidebar refactor touches every screen's layout width (mitigate via M1 container tokens; ship behind a flag). **Deps:** M1 (`PageHeader`, container tokens).

---

## Milestone 3 — Dashboard/Home, CRM, Website

**Goals:** replace dead-end empty landings with momentum, fix the CRM's broken primary action, and give the website journey its publish payoff.

**Deliverables:**

- **Home** dashboard: activity feed + next-best-action cards, replacing "Your stores" — D‑06; **setup checklist** — D‑56.
- **Onboarding** single-field + goal picker; defer profile fieldset — D‑07.
- **CRM fix**: "Add lead" primary action + `/leads/new` (today `app/leads/page.tsx` has no create) — D‑01; **unify Contacts + Customers** into `/customers` — D‑14; in-list **search/filter** — D‑57.
- **Website**: rename Sites→Website surface; **publish success state** ("You're live" + URL + share) — D‑13.
- **Empty/loading/error quality** (cross-cutting, land here first): `<EmptyState>` component + apply — D‑08; skeleton lists — D‑10; API-failure vs empty — D‑09; standard primary-action placement — D‑11; `<SuccessState>` — D‑43.

**Affected files:** `app/page.tsx`, `app/onboarding/page.tsx`, `create-organization-form.tsx`, `app/leads/*`, new `app/leads/new`, `app/contacts/*`, `app/sites/*` (+ Website alias), new `packages/ui/.../empty-state.tsx`, `lib/*/service.ts` (error sentinels).

**Acceptance criteria:**

- Post-onboarding lands on a Home with ≥1 concrete next action, never a bare empty table.
- A lead can be created in ≤2 clicks from `/leads` (was ~5+).
- Every index screen uses `<EmptyState>` (teaches + one CTA), skeletons on load, and a distinct retry state on fetch failure.
- Publishing a site shows a live URL + share, not a silent return.

**Effort:** ~22–30 pd. **Risks:** Contacts/Customers merge (D‑14) touches data model boundaries — coordinate with backend; may split to M4 if commerce customers block. **Deps:** M1, M2.

---

## Milestone 4 — Commerce, Appointments, Marketing, Analytics

**Goals:** flatten the deep per-store commerce flows, collapse Services+Bookings into Appointments, stand up Marketing, and make Analytics real. Sub-tracks parallelizable.

**Deliverables:**

- **Commerce:** org-level Orders rollup — D‑16; store overview → real KPI dashboard (`@saroh/charts`) — D‑24; dense **tables** + **pagination** + **bulk actions** for products/orders/customers — D‑23, D‑23a, D‑55; **card fallback** on mobile — D‑47.
- **Appointments:** merge `app/services/*` + `app/bookings/*` into one Appointments goal; services/hours as one-time setup — D‑15.
- **Team:** org-level `Settings → Team` with scoped invites (replaces per-store `members`) — D‑25; **pending-invite** rows — D‑26; **Settings** surface (profile/billing/domains) — D‑27.
- **Marketing:** `/marketing` with teaching empty state + campaign templates (empty-state-first, ahead of backend) — D‑39.
- **Analytics → Insights:** real charts + date range — D‑28.

**Affected files:** `app/stores/[storeId]/{orders,products,customers,members}/*`, new `app/commerce/*`, `app/services/*`+`app/bookings/*` → `app/appointments/*`, new `app/settings/*`, new `app/marketing/*`, `app/analytics/*`, `packages/charts`.

**Acceptance criteria:**

- Multi-store owner sees all orders in one org-level view; fulfil in ≤2 clicks.
- Booking a manual appointment is ≤2 clicks; services/hours are setup, not per-booking steps.
- One invite grants scoped access across stores; pending invites are visible/revocable.
- `/marketing` renders a teaching empty state even before campaigns are functional.
- Insights renders ≥3 real charts with a working date range.

**Effort:** ~26–34 pd. **Risks:** IA moves (Orders/Customers/Team/Appointments) are data-scope changes, not just UI — highest backend coordination; Marketing/Insights need new APIs (gate UI behind availability). **Deps:** M2 (IA), M3 (Customers unify).

---

## Milestone 5 — a11y, animations, dark-mode, performance ~~, AI~~

> **AI is deferred ([`DEC-015`](../architecture/DECISIONS.md))** and removed from
> this active milestone — D-38 / the `app/ai` surface must not be scheduled here
> and must never gate the accessibility, responsive, or performance work below.
> Module selection is **need-based, not size-based** (ADR-003 / DEC-016). See the
> [current-state delta](./17_CURRENT_STATE_DELTA.md).

**Goals:** make it accessible, calm, fast. (The AI item that formerly defined this milestone is deferred per DEC-015.)

**Deliverables:**

- **a11y:** focus-visible + keyboard nav + skip-link — D‑34; contrast audit (`muted-foreground`) — D‑35; card-as-link semantics — D‑37; palette ARIA — D‑53; avatars — D‑58; typed notification copy — D‑60.
- **Dark mode:** per-screen QA + chart theming — D‑36.
- **Animations:** motion tokens (duration/easing) — D‑44; `prefers-reduced-motion` — D‑45.
- **Errors:** boundary copy + retry — D‑42.
- **AI:** `app/ai` conversational surface + inline "draft with AI" in create forms + ⌘K "ask" mode — D‑38.
- **Automation:** `/automation` recipe cards (empty-state-first) — D‑40.
- **Docs:** extend `ui.saroh.in` gallery with empty/loading/error/disabled states + do/don't — D‑51.
- **Performance:** verify skeletons/pagination, code-split heavy charts, image handling on website editor.

**Affected files:** global CSS + tokens, `@saroh/ui` overlays/`command`, `@saroh/charts`, new `app/ai/*`, new `app/automation/*`, all create forms, `apps/ui.saroh.in`, `app/error.tsx`.

**Acceptance criteria:**

- Keyboard-only user can complete Journeys 1–10; axe/Lighthouse a11y ≥95 on core routes; AA contrast in light + dark.
- Every screen verified in dark mode incl. charts.
- Motion respects `prefers-reduced-motion`.
- AI is reachable via ⌘K from any screen with current-screen context; ≥1 create form offers inline AI drafting.
- Gallery documents every component's key states.

**Effort:** ~20–28 pd. **Risks:** AI (D‑38) depends on a backend AI service not yet in the repo — treat as its own track that can slip without blocking a11y/dark/perf; **do not** let AI schedule gate the accessibility work. **Deps:** M2 (shell/⌘K for AI + search), all prior for QA surface area.

---

## Sequencing & dependency summary

```
M0 (done: shell, tokens, boundaries, font, theme, wordmark, gallery)
   └─► M1 Foundations (tokens/type/forms/PageHeader)
          └─► M2 Shell (goal IA, sidebar, ⌘K, mobile, breadcrumbs)
                 ├─► M3 Home/CRM/Website (Add-lead fix, publish success, empty/loading/error quality)
                 │       └─► M4 Commerce/Appointments/Marketing/Insights  ← fan-out sub-tracks
                 └───────────► M5 a11y/motion/dark/perf/AI  (AI track parallel, backend-gated)
```

**Global risks:**

- **IA moves = data-scope moves.** Renaming Sites→Website is cosmetic; unifying Customers or org-level Orders/Team/Appointments changes tenancy scope — must land with backend, not as a pure design change. Keep those items flagged as **UI-blocked-on-API**.
- **Feature-absent surfaces (Marketing, Automation, AI)** ship _empty-state-first_ so the IA and teaching value land before the backend, per Saroh Canvas progressive disclosure — clearly labeled as coming, never faked as functional.
- **No visual regressions** during token/shell migrations: land preset + shell behind flags, migrate screen-by-screen, verify against the `ui.saroh.in` gallery.
