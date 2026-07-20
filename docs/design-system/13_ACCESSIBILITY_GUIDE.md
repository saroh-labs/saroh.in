# 13 · Accessibility Guide

> Part of the Saroh design system. Companions: `04_DESIGN_TOKENS.md`,
> `05_COMPONENT_LIBRARY.md`, `06_LAYOUT_SYSTEM.md`, `14_RESPONSIVE_GUIDE.md`,
> `15_MOTION_GUIDELINES.md`.

**Anchor — "Saroh Canvas": calm, fast, legible, minimal motion, one product.**
Accessibility is not a bolt-on for Saroh; it is the same goal as the anchor
("legible") stated in standards terms. This document sets the bar (WCAG 2.2
Level AA), audits what the current code actually does against it, and gives a
concrete pass/fail plus the _why_ for each area.

Everything here is grounded in real files:

- Tokens: `packages/ui/src/globals.css`, `tooling/tailwind-config/tailwind.config.ts`
- Primitives (46): `packages/ui/src/components/ui/*` (Radix + shadcn)
- App shell: `apps/app.saroh.in/app/layout.tsx`, `apps/app.saroh.in/components/shared/app-header.tsx`
- Auth: `apps/accounts.saroh.in/app/(auth)/layout.tsx`
- Marketing: `apps/saroh.in/app/page.tsx` (forced dark)

---

## 0. Target & scope

| Item               | Decision                                                                             | Why                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conformance target | **WCAG 2.2 Level AA**                                                                | AA is the legal/industry baseline (EN 301 549, ADA settlements). AAA is aspirational and often unattainable for a data product.                       |
| Touch target rule  | **≥ 44 × 44 px** for primary interactive controls                                    | WCAG 2.5.8 (AA, 24px minimum) + Apple HIG / Material (44/48px). We hold the stricter 44px because Saroh is used on phones by non-technical merchants. |
| Testing            | axe-core / Lighthouse in CI, plus manual keyboard + VoiceOver/NVDA pass per template | Automated tools catch ~40% of issues; the rest (focus order, semantics, labels) need a human.                                                         |

**Why Radix helps us start ahead:** 30+ of the 46 primitives wrap Radix UI
(`@radix-ui/react-dialog`, `-dropdown-menu`, `-tooltip`, `-label`, etc.). Radix
ships focus trapping, `aria-*` wiring, roving tabindex, and `Esc`/arrow-key
handling for free. That means most _semantics_ are correct out of the box — our
job is to not break them (icon-only buttons without labels, removed focus
rings, wrong heading levels) and to fix the token/layout gaps Radix can't know
about.

---

## 1. Keyboard navigation & focus order

### Standard

Every interactive control must be reachable and operable with the keyboard
alone (WCAG 2.1.1), in an order that matches the visual/reading order
(WCAG 2.4.3), with no traps except intentional modal traps (2.1.2).

### What the code does

- **Radix modals/menus** (`dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`,
  `dropdown-menu.tsx`, `select.tsx`, `command.tsx`) trap focus while open,
  restore focus to the trigger on close, and close on `Esc`. **PASS** — this is
  the biggest a11y win in the system and comes from Radix.
- **App shell nav** (`app-header.tsx`) is a real `<nav>` of `next/link`
  `<a>` elements — natively focusable and in DOM order. **PASS on desktop.**
- **List pages** wrap whole cards in `<Link>` (`app/leads/page.tsx` line 48,
  the `<Card>` inside `<Link href={/leads/${id}}>`). The link is focusable and
  the hover style (`hover:bg-muted/40`) also fires on… hover only. **PARTIAL** —
  the card is keyboard-reachable but has **no `focus-visible` style of its own**,
  so a keyboard user cannot see which card is focused. Fix: add
  `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to
  the card link, or rely on the browser default outline (do not `outline-none`
  it).

### Gaps / actions

| Gap                            | Where                                                          | Action                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No skip-to-content link        | `app.saroh.in/app/layout.tsx`, marketing                       | Add a visually-hidden `<a href="#main">` that appears on focus. Why: keyboard users otherwise tab through the whole header on every page. |
| Focus order untested on Kanban | `app/pipeline/page.tsx` (horizontal `overflow-x-auto` columns) | Verify tab order goes column→cards→next column and that focused cards scroll into view.                                                   |

---

## 2. Visible focus & the `--ring` token

### Standard

Focus indicators must be visible (WCAG 2.4.7) and, under WCAG 2.2, meet a
minimum area/contrast (2.4.11 Focus Appearance): at least a 2px-thick indicator
with ≥ 3:1 contrast against adjacent colors.

### What the code does — and the core inconsistency

Buttons, inputs and Radix controls consistently use the shadcn focus recipe:

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
focus-visible:ring-offset-2
```

(see `button.tsx` line 8, `input.tsx` line 12, `dialog.tsx` close button).

The ring color comes from the **`--ring` token** in `globals.css`:

| Theme | `--ring` value                          | Rendered        | Contrast vs its background       |
| ----- | --------------------------------------- | --------------- | -------------------------------- |
| Light | `222.2 84% 4.9%` (near-black slate-950) | dark navy ring  | ~19:1 on white — **PASS 2.4.11** |
| Dark  | `212.7 26.8% 83.9%` (light slate)       | light gray ring | high — **PASS**                  |

**So focus is _visible_ (good), but the ring is the near-black foreground
color, not the brand.** That is a deliberate shadcn default, and it passes
contrast — but it means Saroh's focus state has **no brand identity** and, more
importantly, is **easy to confuse with a normal border** on already-dark
controls.

**Recommendation — define a dedicated focus ring:**

```css
/* globals.css :root */
--ring: 221.2 83.2% 53.3%; /* = --brand (blue-600); focus == brand */
```

Why brand-blue as the ring:

1. **Contrast still passes** — blue-600 (#2563eb) on white ≈ **5.2:1** and on
   the light card ≈ same, both above the 3:1 focus-appearance floor.
2. It ties the "you are here" signal to the one product accent (anchor: _one
   product_), so focus reads as intentional, not as a stray border.
3. It differentiates focus from the neutral `--border` (`214.3 31.8% 91.4%`),
   which the near-black ring can visually echo on dense forms.

Either choice is conformant; the point is to **pick one, name it `--ring`, and
never `outline-none` without a replacement.** The one place to watch:
`disabled:pointer-events-none` is fine, but never remove the ring on custom
clickable `div`s (see the card-link gap in §1).

---

## 3. Screen readers & semantics

### Standard

Meaningful structure via native elements and landmarks (WCAG 1.3.1), one `<h1>`
per page with a logical heading hierarchy (2.4.6), accessible names for all
controls (4.1.2).

### Audit

| Area               | State                   | Evidence / Why                                                                                                                                                                                                                                       |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landmarks          | **PARTIAL**             | `app-header.tsx` uses `<header>` + `<nav>`; pages use `<main>` (`leads/page.tsx` l.23, `pipeline` l.58). Good. But there is **no `<footer>`** and no `aria-label` distinguishing multiple navs.                                                      |
| Headings           | **PASS (mostly)**       | Pages open with a single `<h1 className="text-2xl font-semibold">` (leads, pipeline, onboarding). Kanban column titles are `<h2>` (`pipeline` l.71) — correct nesting. Audit each new page for exactly one h1.                                       |
| Icon-only controls | **PASS pattern exists** | `dialog.tsx`/`sheet.tsx` close buttons include `<span className="sr-only">Close</span>` beside the `<X>` icon. This is the required pattern — **every** icon-only button (future ones) must copy it, or lucide `<X>` renders as an unlabeled button. |
| Brand link         | **PASS**                | Wordmark link has `aria-label="Saroh"` (`app-header.tsx` l.46, l.63).                                                                                                                                                                                |
| Notification count | **PARTIAL**             | The unread badge (`app-header.tsx` l.89) is a bare number in a `<span>`. A screen reader reads "Notifications 3" run together. Add `aria-label={`Notifications, ${unread} unread`}` and mark the number `aria-hidden`.                               |
| Live regions       | **GAP**                 | Toasts (sonner) — see §8. Async list updates have no `aria-live`.                                                                                                                                                                                    |

**Why this matters:** Radix gives us correct roles inside components, but
_page-level_ semantics (landmarks, heading order, the accessible name on the
notification link) are hand-authored and are where regressions appear.

---

## 4. Color contrast — audit of the real token values

Method: converted each `globals.css` HSL token to sRGB and computed the WCAG
relative-luminance contrast ratio. AA thresholds: **4.5:1** normal text,
**3:1** large text (≥18px, or ≥14px bold) and non-text/UI.

### Light theme (`:root`)

| Foreground                               | Background              | Approx hex        | Ratio        | Normal AA (4.5) | Verdict                                     |
| ---------------------------------------- | ----------------------- | ----------------- | ------------ | --------------- | ------------------------------------------- |
| `--foreground` slate-950                 | `--background` white    | #020817 / #fff    | ~19:1        | ✅              | Excellent                                   |
| `--muted-foreground` `215.4 16.3% 46.9%` | `--background` white    | #64748b / #fff    | **≈ 4.76:1** | ✅ (just)       | **Marginal PASS**                           |
| white `--primary-foreground`             | `--primary` slate-900   | #f8fafc / #0f172a | ~16:1        | ✅              | Default `<Button>` — excellent              |
| white `--brand-foreground`               | `--brand` blue-600      | #fff / #2563eb    | **≈ 5.2:1**  | ✅              | Brand button/badge — PASS                   |
| `--brand` as text                        | white                   | #2563eb / #fff    | **≈ 5.2:1**  | ✅              | `text-brand` links PASS                     |
| white `--destructive-foreground`         | `--destructive` red-500 | #fff / #ef4444    | **≈ 3.8:1**  | ❌              | **FAIL for normal text**                    |
| `--border` slate-200                     | white                   | #e2e8f0 / #fff    | ~1.2:1       | n/a             | Border only (decorative) — OK, but see note |

### Key findings & why

1. **`muted-foreground` on white ≈ 4.76:1 — passes AA but barely, and it is
   everywhere** (`FormDescription`, `CardDescription`, timestamps, the whole
   nav which is `text-muted-foreground` in `app-header.tsx` l.79). It **fails
   AAA (7:1)** and any slight opacity reduction (e.g. `text-muted-foreground/80`)
   would drop it below AA. **Action:** never render muted-foreground below
   14px, never add opacity to it, and treat it as the floor — do not introduce
   a lighter secondary gray.
2. **`destructive` white text ≈ 3.8:1 FAILS AA for normal text.** The default
   `<Button variant="destructive">` is `text-sm font-medium` (14px, weight 500)
   — not "large text", so it needs 4.5:1. **Action:** either darken
   `--destructive` (e.g. red-600 `0 72% 51%` → ~4.8:1) or make destructive
   button text `font-semibold`+`text-base`≥18px. This is the single most
   concrete contrast **fail** in the system.
3. **Borders (`--border` ~1.2:1) are decorative and that's fine** — but note
   that `<Input>` relies on `border-input` (same value) as its _only_ resting
   affordance. A 1.2:1 border is easy to miss; the focus ring (§2) is what
   rescues it. Do not remove input borders in favor of background-only fields.

### Dark theme (`.dark`) & the accounts pattern

- `.dark` `muted-foreground` `215 20.2% 65.1%` on `background` `222.2 84% 4.9%`
  ≈ **6.6:1 — PASS** (comfortably better than light). Good, but the anchor
  notes `.dark` is **under-exercised**; audit it whenever a surface actually
  ships dark.
- **Accounts "light card on dark" is confirmed intentional** (theme-provider
  docstring, `packages/ui/src/components/ui/theme-provider.tsx`; backdrop
  `bg-neutral-950` radial gradient in `accounts.saroh.in/app/layout.tsx` l.28).
  The card is a **light** surface, so text on it uses light-theme contrast — the
  numbers above apply. **Caveat:** the login buttons use raw `stone-*`
  utilities (`text-stone-600`, `border-stone-200` in
  `login/github-login-button.tsx`), **not tokens** — stone-600 on white ≈ 7:1
  (fine) but this palette drift means the accounts screen is outside the token
  audit. **Action:** migrate accounts to `muted-foreground`/`border` tokens so
  one audit covers it.
- **Marketing (`saroh.in`, `bg-neutral-950`)** is hand-rolled dark; audit its
  text colors separately — it does not consume the `.dark` token set.

---

## 5. Form accessibility

### Standard

Every field has a programmatically-associated label (WCAG 1.3.1/3.3.2), errors
are identified in text and associated with the field (3.3.1), and error text is
not conveyed by color alone (1.4.1).

### What the code does — this is a strong point

`packages/ui/src/components/ui/form.tsx` (the shadcn + react-hook-form wrapper)
does the wiring correctly:

| Requirement          | Implementation                                                                | Line        |
| -------------------- | ----------------------------------------------------------------------------- | ----------- |
| Label ↔ control      | `FormLabel` sets `htmlFor={formItemId}`; `FormControl` sets `id={formItemId}` | l.89, l.106 |
| Description assoc.   | `aria-describedby` includes `formDescriptionId`                               | l.107–111   |
| Error assoc.         | on error, `aria-describedby` adds `formMessageId`; sets `aria-invalid`        | l.108–112   |
| Error not color-only | error adds `text-destructive` **and** renders `FormMessage` **text**          | l.88, l.151 |
| Unique ids           | `React.useId()` per `FormItem`                                                | l.69        |

**PASS.** This is genuinely accessible and should be the mandated pattern:
_never_ hand-roll a field; always use `FormField` → `FormItem` → `FormLabel` +
`FormControl` + `FormMessage`. Why: it guarantees the `id`/`aria-describedby`/
`aria-invalid` triad that screen readers announce on focus and on error.

### Gaps

| Gap                                                  | Why it matters                                                                                                  | Action                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `<Input>` has no required/placeholder-as-label guard | Placeholder is not a label (WCAG 3.3.2) and `placeholder:text-muted-foreground` (#64748b, 4.76:1) is borderline | Enforce a real `FormLabel` on every field; never ship placeholder-only inputs                               |
| Error announcement timing                            | `FormMessage` appears in DOM but isn't a live region                                                            | For async/submit errors, add `role="alert"` to the message container so it's announced without moving focus |
| Raw auth forms                                       | accounts login buttons/forms bypass `form.tsx` (raw stone utilities)                                            | Route them through the shared `form` primitives                                                             |

---

## 6. Reduced motion

Fully specified in `15_MOTION_GUIDELINES.md`; the a11y requirement (WCAG 2.3.3,
AAA but we adopt it): honor `prefers-reduced-motion`. **Current gap:** the
system relies on `tailwindcss-animate` + Radix `data-[state]` animations
(`dialog.tsx`, `accordion.tsx`, `sheet.tsx`) and **no global reduced-motion
override exists** in `globals.css`. Add one (see doc 15). Why: vestibular users
can be made physically ill by the sheet's `slide-in-from-*` and the dialog's
`zoom-in-95` if not suppressed.

---

## 7. Touch targets ≥ 44px

### Audit of the real size tokens (`button.tsx` l.23–28, `input.tsx` l.12)

| Control            | Class       | Height    | ≥ 44px? |
| ------------------ | ----------- | --------- | ------- |
| Button `default`   | `h-10`      | **40px**  | ❌      |
| Button `sm`        | `h-9`       | **36px**  | ❌      |
| Button `lg`        | `h-11`      | **44px**  | ✅      |
| Button `icon`      | `h-10 w-10` | **40×40** | ❌      |
| Input              | `h-10`      | **40px**  | ❌      |
| Auth OAuth buttons | `h-10`      | **40px**  | ❌      |

**Finding: the default interactive size is 40px — below the 44px bar, and 36px
for `sm`.** They clear the WCAG 2.5.8 AA _minimum_ of 24px, so this is not a
conformance failure, but it fails the ergonomic target we set (and Apple/Material
guidance). Why it matters: merchants tap these on phones; a 36–40px control with
tight spacing raises mis-tap rate, especially the icon buttons and adjacent
Badge/Button clusters (`leads/page.tsx` l.62 has two badges + a card link in a
row).

**Actions (no code change here — this is the guideline):**

1. On touch/mobile, promote primary actions to `size="lg"` (44px) — see the
   "don't shrink desktop" corollary in `14_RESPONSIVE_GUIDE.md`.
2. Give icon buttons at least `p-2.5` of hit-area padding or bump `icon` to
   `h-11 w-11` on touch.
3. Maintain **≥ 8px spacing** between adjacent targets so the effective tap area
   isn't shared.

---

## 8. Component-specific: tables, dialogs, toasts

### Tables

- **The `Table` primitive exists** (`table.tsx`) and correctly wraps a native
  `<table>` in `<div className="relative w-full overflow-auto">` (l.9) so it
  scrolls instead of breaking layout — good. But it renders `<caption>` slot
  (`caption-bottom`) that is **rarely populated**. Every data table should have
  a `<TableCaption>` (accessible name) and real `<th scope="col">`.
- **Reality check:** grep shows **no `<Table>` usage in `app.saroh.in`** — data
  is rendered as `<Card>` grids (leads, pipeline). That's actually good for
  mobile (§ responsive doc), but when tables do arrive, mandate `scope` on
  headers and a caption. Why: without `scope`, screen readers can't announce
  "row header / column header" associations.

### Dialogs / alert-dialogs / sheets

- Radix provides `role="dialog"`, `aria-modal`, focus trap, `Esc`, and labelling
  **only if** `DialogTitle`/`DialogDescription` are rendered. The primitives
  expose them (`dialog.tsx`, `sheet.tsx` `SheetTitle`/`SheetDescription`).
  **Rule:** every dialog MUST render a `DialogTitle` (visually-hidden if the
  design has no visible title) or Radix warns and the dialog has no accessible
  name. **PASS by construction, fail if authors skip the title.**

### Toasts (sonner)

- `sonner.tsx` renders `<Toaster>` themed via `next-themes`. Sonner sets
  `aria-live="polite"` / `role="status"` internally — **PASS** for
  non-urgent messages. **Action:** use sonner's `error` variant for failures so
  it maps to an assertive announcement, and **never** put an action that _only_
  exists in a toast (toasts auto-dismiss; keyboard/SR users may miss them). Keep
  toast duration long enough to read (anchor: calm — see doc 15).

---

## 9. Per-area conformance summary

| Area                          | Verdict                              | Blocker?                               |
| ----------------------------- | ------------------------------------ | -------------------------------------- |
| Keyboard operability (Radix)  | ✅ PASS                              | —                                      |
| Card-link focus visibility    | ⚠️ PARTIAL                           | Add focus-visible ring                 |
| Visible focus / `--ring`      | ✅ PASS, ⚠️ inconsistent (not brand) | Recommend `--ring = --brand`           |
| Skip link                     | ❌ MISSING                           | Add to shells                          |
| Landmarks / headings          | ⚠️ MOSTLY                            | Add footer, label navs                 |
| Notification badge name       | ⚠️ PARTIAL                           | aria-label the link                    |
| Contrast — text/brand/primary | ✅ PASS                              | —                                      |
| Contrast — muted-foreground   | ⚠️ MARGINAL (4.76:1)                 | Don't dilute further                   |
| Contrast — destructive text   | ❌ **FAIL (3.8:1)**                  | **Darken destructive or enlarge text** |
| Forms (`form.tsx`)            | ✅ PASS                              | —                                      |
| Reduced motion                | ❌ MISSING global override           | Add (doc 15)                           |
| Touch targets                 | ⚠️ 40px default (<44)                | Promote to lg on touch                 |
| Dialogs/sheets                | ✅ PASS if titled                    | —                                      |
| Toasts                        | ✅ PASS                              | —                                      |

**Two most critical a11y issues:** (1) **destructive-button white text at
≈3.8:1 fails WCAG AA** for normal text; (2) **no global `prefers-reduced-motion`
override** despite pervasive Radix/animate motion. Both are one-line token/CSS
fixes.
