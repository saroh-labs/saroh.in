# 10 · UX Audit — Scorecard & Findings

> A scored, grounded UX audit of every Saroh screen, driving the redesign.
> Companion docs: [01 Product Design Philosophy](./01_PRODUCT_DESIGN_PHILOSOPHY.md) · [09 Screen Inventory](./09_SCREEN_INVENTORY.md)

---

## Methodology

**What was scored.** Every route in `apps/app.saroh.in` plus the key non-app
surfaces (accounts auth, accounts `/apps`, saroh.in marketing, admin stub).
Near-identical screens are scored as one **group** (e.g. all four auth pages;
create+edit form pairs) — 34 rows in total. Findings are grounded in the actual
`page.tsx`/`layout.tsx` source read during this audit; leaf behaviours inside
client form components are flagged in [09](./09_SCREEN_INVENTORY.md) where they
could only be inferred from the component surface.

**Scale (1–10).** 9–10 exemplary · 7–8 solid, minor issues · 5–6 functional but
notable gaps · 3–4 significant problems · 1–2 broken/placeholder. Scores are
**relative to the "Saroh Canvas" anchor** (calm, one-product, one primary action
per screen, progressive disclosure, every screen answers _where am I / what can I
do / what next_), not to an abstract ideal.

**14 categories.** Visual consistency · Navigation clarity · Accessibility ·
Readability · Information hierarchy · Spacing · Forms · Interaction quality ·
Empty states · Loading states · Error handling · Responsiveness · Discoverability ·
User guidance.

**"N/A" (—)** is used where a category doesn't apply (Forms on a read-only list;
Empty states on a single-record form). N/A cells are **excluded** from both the
screen's overall and the category average, so a screen isn't penalised for lacking
a surface it shouldn't have. Averages are the arithmetic mean of applicable cells.

**Bias/limits.** This is a static-source audit, not a usability test with real
users; scores reflect _observable design decisions in code_, not measured task
success. Where a page delegates to a client component, the component's internals
(field validation UX, focus order) were sampled but not exhaustively audited —
those are the least certain scores (Forms especially).

---

## Scorecard

Columns: **VC** Visual consistency · **NC** Navigation clarity · **A11y** Accessibility · **Rd** Readability · **IH** Info hierarchy · **Sp** Spacing · **Fm** Forms · **IQ** Interaction quality · **ES** Empty states · **LS** Loading states · **EH** Error handling · **Rs** Responsiveness · **Ds** Discoverability · **UG** User guidance · **Avg** applicable mean.

| Screen / group                           | VC  | NC  | A11y | Rd  | IH  | Sp  | Fm  | IQ  | ES  | LS  | EH  | Rs  | Ds  | UG  | **Avg** |
| ---------------------------------------- | --- | --- | ---- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------- |
| App shell (header + system pages)        | 6   | 4   | 5    | 7   | 6   | 7   | —   | 6   | 8   | 7   | 8   | 2   | 5   | 6   | **5.9** |
| Dashboard `/` (stores home)              | 5   | 6   | 6    | 7   | 6   | 7   | —   | 6   | 8   | 4   | 6   | 6   | 6   | 5   | **6.0** |
| Onboarding                               | 6   | 6   | 7    | 7   | 7   | 6   | 5   | 6   | 7   | 4   | 5   | 6   | 7   | 5   | **6.0** |
| Invitation accept `/invitations/[token]` | 5   | 5   | 4    | 6   | 5   | 6   | —   | 5   | 4   | 3   | 3   | 6   | 5   | 4   | **4.7** |
| Contacts list                            | 5   | 5   | 5    | 7   | 6   | 7   | —   | 6   | 8   | 4   | 6   | 6   | 2   | 4   | **5.5** |
| Contact detail                           | 6   | 5   | 7    | 7   | 6   | 7   | —   | 4   | 5   | 4   | 6   | 6   | 3   | 4   | **5.4** |
| Leads list                               | 5   | 5   | 6    | 7   | 6   | 7   | —   | 6   | 8   | 4   | 6   | 5   | 3   | 4   | **5.5** |
| Lead detail                              | 4   | 5   | 6    | 6   | 3   | 6   | 4   | 6   | 5   | 4   | 5   | 6   | 6   | 5   | **5.1** |
| Pipeline board                           | 5   | 6   | 8    | 7   | 7   | 6   | 6   | 6   | 6   | 4   | 5   | 5   | 6   | 6   | **5.9** |
| Bookings                                 | 5   | 5   | 6    | 7   | 6   | 6   | —   | 5   | 8   | 4   | 6   | 5   | 5   | 5   | **5.6** |
| Services list                            | 5   | 5   | 6    | 7   | 6   | 7   | —   | 6   | 8   | 4   | 6   | 4   | 5   | 5   | **5.7** |
| Service detail/edit                      | 6   | 5   | 6    | 7   | 7   | 7   | 4   | 6   | 5   | 4   | 5   | 6   | 6   | 5   | **5.6** |
| Service new                              | 6   | 5   | 6    | 7   | 6   | 7   | 4   | 6   | —   | 4   | 5   | 6   | 6   | 4   | **5.5** |
| Sites list                               | 5   | 5   | 6    | 7   | 6   | 7   | —   | 6   | 8   | 4   | 6   | 6   | 5   | 5   | **5.8** |
| Site editor `/sites/[siteId]`            | 4   | 4   | 4    | 6   | 4   | 6   | 4   | 6   | 4   | 4   | 5   | 5   | 5   | 4   | **4.6** |
| Site new                                 | 6   | 5   | 6    | 7   | 6   | 7   | 4   | 6   | —   | 4   | 5   | 6   | 6   | 4   | **5.5** |
| Store shell + overview                   | 4   | 5   | 6    | 7   | 4   | 6   | —   | 5   | 4   | 4   | 6   | 4   | 4   | 4   | **4.8** |
| Store settings                           | 6   | 6   | 6    | 7   | 6   | 6   | 4   | 6   | —   | 4   | 5   | 6   | 6   | 5   | **5.6** |
| Store members                            | 6   | 6   | 5    | 7   | 6   | 6   | 4   | 5   | 5   | 4   | 5   | 6   | 6   | 5   | **5.4** |
| Products list                            | 5   | 6   | 4    | 6   | 5   | 6   | —   | 5   | 7   | 4   | 6   | 5   | 6   | 5   | **5.4** |
| Product create/edit (+ categories)       | 6   | 5   | 5    | 7   | 6   | 6   | 3   | 5   | 5   | 4   | 5   | 6   | 4   | 4   | **5.1** |
| Orders list                              | 5   | 6   | 4    | 6   | 5   | 6   | —   | 5   | 7   | 4   | 6   | 5   | 6   | 5   | **5.4** |
| Order detail                             | 5   | 5   | 5    | 6   | 5   | 6   | 4   | 5   | 3   | 4   | 5   | 5   | 5   | 4   | **4.8** |
| Order new                                | 5   | 5   | 4    | 6   | 5   | 6   | 3   | 5   | 3   | 4   | 5   | 5   | 5   | 3   | **4.6** |
| Customers list                           | 4   | 6   | 4    | 6   | 4   | 6   | —   | 5   | 7   | 4   | 6   | 5   | 6   | 5   | **5.2** |
| Customer create/edit                     | 6   | 5   | 5    | 7   | 6   | 6   | 4   | 6   | —   | 4   | 5   | 6   | 5   | 4   | **5.3** |
| Content list                             | 5   | 6   | 4    | 6   | 5   | 6   | —   | 5   | 7   | 4   | 6   | 5   | 4   | 3   | **5.1** |
| Post create/edit (+ categories)          | 6   | 5   | 5    | 7   | 6   | 6   | 3   | 5   | 5   | 4   | 5   | 6   | 5   | 4   | **5.1** |
| Analytics                                | 5   | 5   | 4    | 7   | 6   | 7   | —   | 5   | 5   | 4   | 6   | 5   | 5   | 5   | **5.3** |
| Notifications                            | 5   | 6   | 6    | 7   | 6   | 7   | —   | 6   | 5   | 4   | 6   | 5   | 6   | 5   | **5.7** |
| Marketing (saroh.in)                     | 6   | 4   | 4    | 5   | 5   | 6   | —   | 7   | —   | 4   | 4   | 4   | 5   | 4   | **4.8** |
| Auth (login / signup / forgot / reset)   | 6   | 6   | 6    | 7   | 6   | 7   | 5   | 6   | —   | 5   | 6   | 7   | 6   | 6   | **6.1** |
| Accounts `/apps` launcher                | 2   | 5   | 3    | 5   | 4   | 5   | —   | 4   | —   | 2   | 2   | 5   | 6   | 4   | **3.9** |
| Admin stub                               | 2   | 3   | 3    | 3   | 2   | 4   | —   | 2   | 2   | 3   | 4   | 4   | 2   | 2   | **2.8** |

---

## Aggregate — per-category averages (across all scored screens)

| Category              | Avg     | Read                                                                                                                                            |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Readability           | **6.5** | Best. Inter, sensible type scale, muted-foreground for secondary text — the primitive layer carries this.                                       |
| Spacing               | **6.3** | Consistent `p-8` gutters and `gap`-based rhythm; the shadcn tokens do the work.                                                                 |
| Empty states          | **5.8** | Genuinely good on top-level lists (dashed cards + CTA); weak on detail pages and delegated inboxes.                                             |
| Interaction quality   | **5.4** | Hover states + optimistic server actions are fine; nothing delightful, some dead-ends.                                                          |
| Information hierarchy | **5.4** | Undermined by mixed heading scales (e.g. lead detail) and header/content misalignment.                                                          |
| Error handling        | **5.3** | App-root fail-loud boundary is a real strength; dragged down by raw-error screens (invitations, `/apps`).                                       |
| Responsiveness        | **5.3** | Page grids are okay; **the shell has no mobile/tablet nav**, which caps the whole product.                                                      |
| Navigation clarity    | **5.2** | Flat 9-item top nav + a second store-level nav; no breadcrumbs; glyph-only back links.                                                          |
| Accessibility         | **5.2** | Semantic HTML in places (pipeline, `<dl>`), but list-as-links, native `<select>`, missing `aria-current`/labels, and no form-error association. |
| Visual consistency    | **5.1** | Eight container widths, three list idioms, header ≠ content width — the redesign's #1 target.                                                   |
| Discoverability       | **5.1** | Core objects (contacts, leads) can't be created from their own screens; actions hide in empty states.                                           |
| User guidance         | **4.5** | Almost no inline "what is this / what next"; forms fail via toast, not guidance.                                                                |
| Forms                 | **4.1** | Lowest applicable. Hand-rolled `useState`, no inline validation, no `aria-invalid`, native `<select>`.                                          |
| Loading states        | **4.0** | Lowest overall. One generic app-root skeleton; **zero per-segment loading**, so every route flashes the same 4 rows.                            |

**Product-wide mean across all scored cells: 5.27 / 10** — a functional, coherent-at-the-token-level product that is _unfinished at the composition level_: the primitives and copy are decent (Readability 6.5, Spacing 6.3), but the things that make a product feel _designed and trustworthy_ — consistent layout, real forms, per-context loading, and user guidance — are the four weakest categories (Loading 4.0, Forms 4.1, Guidance 4.5, Visual consistency 5.1).

---

## The 10 lowest-scoring screens — and why

1. **Admin stub — 2.8.** `apps/admin.saroh.in/app/page.tsx`. The authorized view is literal developer scaffolding: "We will add the admin page components here" plus a `<ul class="list-disc">` with no `pl-*` so bullets clip, and no heading. _Why:_ any admin who reaches it sees an unfinished page — zero on hierarchy, empty state, guidance, and interaction. Either build it or gate the route.
2. **Accounts `/apps` launcher — 3.9.** `apps/accounts.saroh.in/app/apps/page.tsx`. A hardcoded white card (`bg-white`, no `dark:`) floating on the accounts root's dark `bg-neutral-950`; title is a `<div>` not `<h1>`; `console.log(session)` left in; loading = `Loading...`, error = raw message. _Why:_ this is the **identity provider's front door for every Saroh app** — the light-on-dark mismatch and unstyled states break trust at first login (VC 2, LS 2, EH 2, A11y 3).
3. **Order new — 4.6.** `.../stores/[storeId]/orders/new/page.tsx` + `order-form.tsx`. The app's most complex form (line-items array, tax/shipping/discount, live totals) is hand-rolled `useState` with **no field validation, no `aria-invalid`, native `<select>`s, and a `toast` as the only error surface** — and it renders even when the store has zero products/customers. _Why:_ the highest-stakes data-entry screen has the weakest safety net (Forms 3, Guidance 3, Empty 3).
4. **Site editor — 4.6.** `.../sites/[siteId]/page.tsx`. Jumps to `max-w-6xl` (widest in the app), renders **no server `h1`** (title hydrates inside `SiteEditor`), and double-`notFound()`s. _Why:_ entered from a `max-w-4xl` list, the width jump + titleless SSR make it feel like a different app; screen readers/SEO get no heading (VC 4, IH 4, A11y 4).
5. **Invitation accept — 4.7.** `.../invitations/[token]/page.tsx`. Success is a silent `redirect`; the only rendered state is an error `Card` whose body is the **raw `result.error` string**. _Why:_ a trust-sensitive first touch with a new org has no confirmation and can surface internal error phrasing (EH 3, LS 3, ES 4, A11y 4).
6. **Order detail — 4.8.** `.../orders/[orderId]/page.tsx`. Read-heavy; **empty items list not handled**; mutations buried in `OrderStatusControls`/`OrderPayments`; two color-only badges. _Why:_ the operational screen a merchant lives in during fulfilment is thin on state-handling and hierarchy (ES 3, IH 5, UG 4).
7. **Marketing home — 4.8.** `apps/saroh.in/app/page.tsx`. An effects reel (`Spotlight`/`Sparkles`/`Bento`) ending in a waitlist, with **no copy-driven hero, no nav/footer, no `h1` in the file**, four commented-out hero experiments, and heavy animation with no reduced-motion guard. _Why:_ the first impression answers "what is this?" only through motion — weak for scanning, SEO, and accessibility (NC 4, A11y 4, Rd 5, Rs 4).
8. **Store shell + overview — 4.8.** `.../stores/[storeId]/layout.tsx` + `/page.tsx`. A **second header and second org switcher** stack under the global one; its own `max-w-5xl`; the overview page then just restates the store name/slug and shows an empty, `hidden` "coming soon" grid. _Why:_ the store home answers "where am I" twice and "what next" not at all, and the nested chrome breaks the one-shell anchor (IH 4, VC 4, Rs 4, Ds 4, ES 4).
9. **Lead detail — 5.1.** `.../leads/[leadId]/page.tsx`. Functionally the richest screen, but **seven co-equal actions in flat bordered panels with mixed heading scales** (`text-sm font-medium` vs `text-lg font-semibold` for peer sections) and `max-w-3xl` (narrower than the rest of CRM). _Why:_ directly contradicts "one primary action per screen" — the _next best action_ is visually ambiguous exactly where selling happens (IH 3, VC 4).
10. **Product create/edit — 5.1** _(tied with Content list 5.1 and Post create/edit 5.1)._ `.../products/[productId]/…` + `product-form.tsx`. Hand-rolled form, native `<select>`, no inline validation (Forms 3); **variants only appear after the product is created**, with no hint at create time, so the create→configure path isn't discoverable (Ds 4, UG 4). _Content list_ ties here for a different reason: it renders a "New post" button to `VIEWER` users the API will reject (a self-documented misleading affordance → Ds 4, UG 3).

---

## Per-screen commentary (why the notable scores land where they do)

Grouped by area; each note explains the score-shaping issues. High performers get a line; low performers get the "why."

**Shell & system.** _App shell (5.9)_ — strong system pages (loading skeleton, fail-loud `error.tsx`, styled 404 → LS 7, EH 8, ES 8) but **Responsiveness 2** because nav is `hidden lg:flex` with no mobile fallback: below `lg` there is no way to reach any section. NC 4 for a flat 9-item nav that doesn't express the product's structure.

**Onboarding & entry.** _Onboarding (6.0)_ — clean single `h1`, focused zero-org funnel (Ds 7); loses on LS 4 and thin guidance (no "what happens next"). _Dashboard (6.0)_ — solid list + empty state; LS 4 and a primary action that vanishes when the list is non-empty vs empty behaviour keep it from higher.

**CRM.** _Contacts list (5.5)_ / _Leads list (5.5)_ — good empty states (ES 8) but **Discoverability 2–3**: neither object can be created from its own screen. _Contact detail (5.4)_ — nice `<dl>` semantics (A11y 7) but read-only dead-end (IQ 4, Ds 3). _Pipeline (5.9)_ — **the app's accessibility high-water mark** (A11y 8: `aria-label`ed stage sections, semantic `<article>`, real link titles); held down by the `max-w-full` width outlier and LS 4. _Lead detail (5.1)_ — see bottom-10 #9.

**Bookings & Services.** _Services list (5.7)_ / _Bookings (5.6)_ — good empty states; Services loses Rs 4 for a single-column card grid where its sibling _Sites (5.8)_ uses `sm:grid-cols-2` — the inconsistency itself is the finding. Service/Site _new_ pages (5.5) are clean but formulaic (no context copy, Fm 4).

**Sites.** _Sites list (5.8)_ — the "canonical" list. _Site editor (4.6)_ — see bottom-10 #4.

**Store workspace.** _Store settings (5.6)_ / _Store members (5.4)_ — tidy, but forms are hand-rolled (Fm 4) and members conveys permission via a prop rather than clear read-only messaging. _Products/Orders/Customers/Content lists (5.1–5.4)_ — all share the `<ul>`-row idiom for **tabular data with no `<table>` semantics** (A11y 4, no column headers/sorting); _Customers_ additionally has a ragged right column (city only-if-present → VC 4, IH 4). _Store shell+overview (4.8)_ and _Order new/detail (4.6/4.8)_ — see bottom-10.

**Analytics & Notifications.** _Analytics (5.3)_ — clean, but the range selector is links with **no `aria-current`/`aria-pressed`** (A11y 4) so the active range is color-only. _Notifications (5.7)_ — fine shell; ES/IQ delegated to a client component that couldn't be fully verified; header + page both fetch unread count.

**Non-app.** _Auth (6.1)_ — the **highest group**: clean centered layout, responsive `sm:/lg:` padding, real form components; docked only for login's dead code + the shared-layout's single mislabeled `metadata` title (Fm 5 pending component verification). _Marketing (4.8)_, _/apps (3.9)_, _Admin (2.8)_ — see bottom-10 / above.

---

## What the numbers say for the redesign

The product is **not broken — it is unfinished at the composition layer.** The
token/primitive foundation and copy readability are already at 6.3–6.5; the four
categories that will most raise the _felt_ quality of the product, in priority
order:

1. **Loading states (4.0)** — add per-segment `loading.tsx` that mirrors each
   destination's real layout instead of one generic skeleton.
2. **Forms (4.1)** — standardise on `react-hook-form` + `zod` + the existing
   `@saroh/ui` `Form`/`Select` primitives, with inline `aria-invalid` errors,
   replacing hand-rolled `useState` + `toast`.
3. **User guidance (4.5)** — one line of "what is this / what next" per screen;
   fix misleading affordances (viewer "New post", empty-state primary actions).
4. **Visual consistency (5.1)** — collapse eight container widths to a single
   `MaxWidthWrapper`, align the header to content, and pick **one** list idiom
   (a real `DataTable` for tabular records).

Fixing these four does not require rebuilding features — it re-uses primitives
that already exist — and would move the product-wide mean from **5.27** toward the
7+ range the "Saroh Canvas" anchor implies.
