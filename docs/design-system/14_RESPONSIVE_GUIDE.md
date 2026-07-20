# 14 · Responsive Guide

> Part of the Saroh design system. Companions: `06_LAYOUT_SYSTEM.md`,
> `13_ACCESSIBILITY_GUIDE.md`, `15_MOTION_GUIDELINES.md`.

**Anchor — "Saroh Canvas": calm, fast, legible, minimal motion, one product.**
Responsive design serves _legible_ and _fast_: the same content, reflowed so it
stays readable and tappable on a 375px phone and a 1440px laptop without a
second codebase.

Grounded in: `tooling/tailwind-config/tailwind.config.ts`,
`apps/app.saroh.in/components/shared/app-header.tsx`,
`apps/app.saroh.in/app/**`, `apps/accounts.saroh.in/app/(auth)/layout.tsx`,
`apps/saroh.in/app/page.tsx`.

---

## 1. Breakpoint tokens

Saroh uses **Tailwind defaults** (no custom `screens` override in
`tailwind.config.ts`; only `container.screens["2xl"] = 1400px` is customized,
l.17–22).

| Token    | Min-width                       | Typical device             | Saroh usage today                                       |
| -------- | ------------------------------- | -------------------------- | ------------------------------------------------------- |
| _(base)_ | 0                               | phone (portrait)           | **implicit default — under-served**                     |
| `sm`     | 640px                           | large phone / small tablet | auth layout padding (`sm:px-6`), a few `sm:grid-cols-*` |
| `md`     | 768px                           | tablet                     | almost unused                                           |
| `lg`     | 1024px                          | laptop                     | **app shell nav gate (`lg:flex`)**                      |
| `xl`     | 1280px                          | desktop                    | unused                                                  |
| `2xl`    | 1536px (container caps at 1400) | large desktop              | container only                                          |

**Rule — mobile-first:** author base styles for the smallest screen, then add
`sm:`/`md:`/`lg:` to _enhance_. Why: unprefixed classes apply everywhere, so a
missing base style means the mobile experience is whatever the desktop style
degrades into — which is exactly the bug in §3.

**Reality check (measured):** across all of `app.saroh.in` the only responsive
utilities present are `sm:grid-cols-*` (×5), `lg:grid-cols-*` (×1), the auth
layout's `sm:px-6 lg:px-8`, and the header's `hidden lg:flex`. **The product is
effectively single-breakpoint.** That is the headline of this document.

---

## 2. 🚨 Critical gap: the app header disappears on mobile

`apps/app.saroh.in/components/shared/app-header.tsx` l.74:

```tsx
<nav className="hidden items-center gap-4 text-sm lg:flex">
    {/* Stores, Sites, Contacts, Leads, Pipeline, Services, Bookings,
      Analytics, Notifications */}
</nav>
```

The primary navigation is `hidden` by default and only becomes `lg:flex` at
**1024px**. Below `lg` — i.e. **every phone and most tablets** — the entire nav
is removed **with no replacement**: no hamburger, no drawer, no bottom bar. The
header then shows only the Wordmark, the org switcher, and Sign-out.

**Impact:** an authenticated mobile user can reach the home page (`/` Stores)
but **cannot navigate to Sites, Contacts, Leads, Pipeline, Services, Bookings,
Analytics, or Notifications at all** from the chrome. This is a **critical,
launch-blocking responsive defect**, and it's more severe because the same
header is the _only_ nav (its docstring, l.14–20, says it was consolidated to be
the single shell so subpages could navigate).

**Fix (spec, not code):** below `lg`, render a menu button
(`Button size="icon"` ≥44px, §touch) that opens the existing **`Sheet`**
primitive (`packages/ui/src/components/ui/sheet.tsx`, `side="left"`) containing
the same `NAV` array. The `Sheet` already exists, is accessible (Radix dialog,
focus-trapped, `Esc`-closable), and animates calmly — so this is assembly, not
new components. Keep `lg:flex` for the inline desktop nav; show the trigger only
`lg:hidden`.

---

## 3. Mobile-first strategy & the two structural rules

### Rule A — "don't shrink desktop"

Design the mobile layout as a **reflow**, not a zoom-out. A phone view is a
single column of full-width blocks; a desktop view adds columns, sidebars, and
inline nav. Never ship a 1200px layout scaled into 375px (horizontal scroll,
2px tap targets). Why: Saroh's users are merchants on mid-range Android phones;
a shrunk desktop is unusable and off-anchor (not _legible_).

### Rule B — "don't stretch mobile onto desktop"

The inverse: a single 375px column centered on a 1440px screen wastes the space
and hurts scanning. Cap content width (`max-w-4xl`, `max-w-6xl` are already the
convention — leads uses `max-w-4xl`, pipeline `max-w-6xl`) and add columns as
width allows. Both rules together = **one layout that adapts at breakpoints**,
not two.

### Responsive padding — a system-wide miss

Pages hard-code `p-8` (32px) regardless of viewport: `leads/page.tsx` l.23
(`mx-auto max-w-4xl p-8`), `pipeline` l.58, `onboarding` l.19. On a 375px phone,
`p-8` eats 64px (17%) of width. **Rule:** use `p-4 sm:p-6 lg:p-8` (16→24→32).
Why: fixed large padding is the quiet reason mobile content feels cramped even
where the nav works.

---

## 4. Template → responsive-behavior map (the 12 templates)

These are the canonical layout archetypes across the suite. "Behavior" = what
should happen at each tier; **⚠️ = current gap**, ✅ = already correct.

| #   | Template                  | Real example                                     | Mobile (base)                                         | Tablet (md/lg)                                 | Desktop (lg+)               |
| --- | ------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| 1   | **Marketing landing**     | `saroh.in/app/page.tsx` (`bg-neutral-950`)       | 1-col, stacked hero                                   | 2-col sections                                 | full-bleed, forced dark     |
| 2   | **Auth / login**          | `accounts.saroh.in/app/(auth)/layout.tsx`        | full-width card, `sm:px-6`                            | centered card `sm:max-w-lg` ✅                 | same, more backdrop         |
| 3   | **App shell**             | `app.saroh.in/app/layout.tsx` + `app-header.tsx` | ⚠️ **nav vanishes → needs Sheet drawer**              | drawer or inline                               | inline `lg:flex` nav ✅     |
| 4   | **Onboarding (zero-org)** | `app/onboarding/page.tsx` (`max-w-lg`)           | 1-col, `p-4` (today `p-8` ⚠️)                         | centered `max-w-lg` ✅                         | same                        |
| 5   | **List / card grid**      | `app/leads`, `contacts`, `services`              | 1-col `grid gap-3` ✅                                 | keep 1-col or 2-col                            | `max-w-4xl` capped ✅       |
| 6   | **Record detail**         | `app/leads/[id]`, `stores/[id]`                  | stacked sections                                      | 1-col                                          | 2-col (content + meta rail) |
| 7   | **Kanban / board**        | `app/pipeline/page.tsx`                          | ✅ `overflow-x-auto`, `w-72 shrink-0` columns scroll  | same horizontal scroll                         | all columns visible         |
| 8   | **Dashboard / analytics** | `app/analytics`                                  | 1-col stat cards                                      | `sm:grid-cols-2`                               | `lg:grid-cols-3/4`          |
| 9   | **Form / create**         | `create-organization-form`, service forms        | full-width fields, `size="lg"` on submit              | `max-w-lg`                                     | `max-w-lg` centered         |
| 10  | **Feed / notifications**  | `app/notifications`                              | 1-col list, ⚠ needs `aria-live` (doc 13)              | 1-col                                          | `max-w-2xl` capped          |
| 11  | **Data table**            | `@saroh/ui table.tsx` (defined, unused)          | ⚠ **table → stacked cards** (already the app's habit) | horizontal scroll wrapper ✅ (`overflow-auto`) | full table                  |
| 12  | **Docs / help**           | `docs.saroh.in`, `help.saroh.in` (Nextra)        | Nextra collapses sidebar to drawer ✅                 | sidebar + content                              | sidebar + content + TOC     |

### Notes on the strongest and weakest templates

- **Kanban (7) is the model to copy:** `pipeline/page.tsx` l.61 uses
  `flex gap-4 overflow-x-auto pb-4` with `w-72 shrink-0` columns — a board that
  degrades to a swipeable strip on mobile without breaking. This is the correct
  "don't shrink desktop" pattern for wide content.
- **Data table (11): the app already prefers cards over tables** (grep finds no
  `<Table>` in `app.saroh.in` — data is `<Card>` grids). Formalize this: on
  mobile, a data table should become **one card per row** (label: value pairs);
  the `Table` primitive's `overflow-auto` wrapper is the fallback when a true
  grid is unavoidable. Why: a multi-column table on a 375px screen forces
  horizontal scroll that hides key columns.

---

## 5. Touch ergonomics (cross-ref doc 13 §7)

| Guideline                 | Value                             | Why                                                                                                                                   |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Min target                | **44 × 44px**                     | default `Button h-10` = 40px; promote to `size="lg"` (h-11=44px) on touch                                                             |
| Target spacing            | ≥ 8px                             | leads cards stack a card-link + 2 badges in a row (`leads/page.tsx` l.62); crowding shares hit-area                                   |
| Thumb zone                | primary CTA reachable bottom-half | on tall phones, a top-only action bar is a stretch; consider sticky bottom CTA on forms                                               |
| No hover-only affordances | —                                 | `hover:bg-muted/40`, `hover:underline` (leads, header) don't exist on touch; ensure the same state is reachable/visible without hover |

---

## 6. Testing matrix

Verify each of the 12 templates at these widths (Tailwind boundaries ± 1):

| Width  | Why this width                                        |
| ------ | ----------------------------------------------------- |
| 360px  | small Android — the true worst case                   |
| 390px  | iPhone                                                |
| 768px  | `md` — tablet portrait                                |
| 1024px | `lg` — **the header nav flips here; test both sides** |
| 1440px | laptop — confirm `max-w-*` caps engage                |

Automate with the Chrome DevTools MCP `resize_page` / `emulate` per template;
assert (a) no horizontal body scroll, (b) nav reachable, (c) targets ≥44px.

---

## 7. Summary

| Finding                                                                       | Severity               |
| ----------------------------------------------------------------------------- | ---------------------- |
| **App header nav `hidden … lg:flex` disappears < 1024px with no replacement** | 🔴 **Critical**        |
| Product is effectively single-breakpoint (almost no `sm/md` usage)            | 🟠 High                |
| Fixed `p-8` padding on every page (not responsive)                            | 🟠 High                |
| Default controls 40px < 44px touch target                                     | 🟡 Medium              |
| Kanban + card-grid + Nextra already responsive                                | 🟢 Good, use as models |

**Single most critical responsive gap:** the primary navigation in
`app-header.tsx` is gated behind `lg:flex` and has **no mobile fallback**, so
below 1024px authenticated users cannot navigate the app at all. The fix is to
open the existing `Sheet` drawer with the same `NAV` array below `lg`.
