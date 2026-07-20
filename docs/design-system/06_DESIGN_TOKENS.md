# 06 · Design Tokens — Saroh Canvas

> The single source of truth for colour, type, spacing, radius, elevation, and motion.
> Companion docs: [01 Philosophy](./01_PRODUCT_DESIGN_PHILOSOPHY.md) · [02 IA](./02_INFORMATION_ARCHITECTURE.md) · [07 Style Guide](./07_STYLE_GUIDE.md)

---

## 0. Where tokens live (grounded)

| Layer                           | File                                          | Role                                                                                                 |
| ------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CSS variables (source of truth) | `packages/ui/src/globals.css`                 | Defines every semantic colour + `--radius` as HSL channels, for `:root` (light) and `.dark`.         |
| Tailwind mapping                | `tooling/tailwind-config/tailwind.config.ts`  | Maps the CSS vars to Tailwind colour/radius utilities (`bg-primary`, `text-brand`, `rounded-lg`, …). |
| Font asset                      | `packages/ui/fonts/InterVariable-latin.woff2` | Self-hosted Inter, loaded per-app via `next/font/local` (`apps/app.saroh.in/app/layout.tsx`).        |
| Consumption                     | every app + `@saroh/ui` primitives            | Only ever reference the mapped utilities — never raw hex/px.                                         |

**The cardinal rule: never use an arbitrary value.** No raw hex colours, no
`text-[13px]`, no `p-[7px]`, no `bg-[#2563eb]`. If a value you need isn't a token, the
fix is to add a token here — not to hard-code it in a component. Current violations are
catalogued in [§12](#12-current-violations-to-fix).

---

## 1. Existing colour tokens (documented from source)

These are the **actual** tokens in `packages/ui/src/globals.css`, expressed as HSL
channel triples and consumed as `hsl(var(--token))` via the Tailwind config.

| Token                                        | Light (`:root`)                       | Dark (`.dark`)                          | Tailwind utility                           | Purpose                                                             |
| -------------------------------------------- | ------------------------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `--background`                               | `0 0% 100%`                           | `222.2 84% 4.9%`                        | `bg-background`                            | App canvas                                                          |
| `--foreground`                               | `222.2 84% 4.9%`                      | `210 40% 98%`                           | `text-foreground`                          | Primary text                                                        |
| `--card` / `--card-foreground`               | `0 0% 100%` / `222.2 84% 4.9%`        | `222.2 84% 4.9%` / `210 40% 98%`        | `bg-card` / `text-card-foreground`         | Card surface                                                        |
| `--popover` / `--popover-foreground`         | `0 0% 100%` / `222.2 84% 4.9%`        | `222.2 84% 4.9%` / `210 40% 98%`        | `bg-popover`                               | Overlays (dropdown, popover, dialog)                                |
| `--primary` / `--primary-foreground`         | `222.2 47.4% 11.2%` / `210 40% 98%`   | `210 40% 98%` / `222.2 47.4% 11.2%`     | `bg-primary`                               | Primary action / emphasis (near-black in light)                     |
| `--secondary` / `--secondary-foreground`     | `210 40% 96.1%` / `222.2 47.4% 11.2%` | `217.2 32.6% 17.5%` / `210 40% 98%`     | `bg-secondary`                             | Secondary surfaces/buttons                                          |
| `--muted` / `--muted-foreground`             | `210 40% 96.1%` / `215.4 16.3% 46.9%` | `217.2 32.6% 17.5%` / `215 20.2% 65.1%` | `text-muted-foreground`                    | De-emphasised text/surfaces                                         |
| `--accent` / `--accent-foreground`           | `210 40% 96.1%` / `222.2 47.4% 11.2%` | `217.2 32.6% 17.5%` / `210 40% 98%`     | `bg-accent`                                | Hover/active surface (nav items, menu rows)                         |
| `--destructive` / `--destructive-foreground` | `0 84.2% 60.2%` / `210 40% 98%`       | `0 62.8% 30.6%` / `210 40% 98%`         | `bg-destructive`                           | Danger/delete                                                       |
| `--border`                                   | `214.3 31.8% 91.4%`                   | `217.2 32.6% 17.5%`                     | `border-border`                            | Default borders (applied globally via `* { @apply border-border }`) |
| `--input`                                    | `214.3 31.8% 91.4%`                   | `217.2 32.6% 17.5%`                     | `border-input`                             | Form control borders                                                |
| `--ring`                                     | `222.2 84% 4.9%`                      | `212.7 26.8% 83.9%`                     | `ring-ring`                                | Focus ring                                                          |
| **`--brand`**                                | **`221.2 83.2% 53.3%`** (blue-600)    | **`217.2 91.2% 59.8%`** (blue-500)      | `bg-brand` / `text-brand` / `border-brand` | **The single Saroh accent**                                         |
| `--brand-foreground`                         | `210 40% 98%`                         | `222.2 47.4% 11.2%`                     | `text-brand-foreground`                    | Text on brand                                                       |

**Important nuance — `--primary` ≠ `--brand`.** In the current tokens, `--primary` is a
near-black slate (`222.2 47.4% 11.2%`), so the default `Button` and `Badge`
(`bg-primary`, per `packages/ui/src/components/ui/button.tsx` and `badge.tsx`) render
**dark**, not blue. `--brand` (blue) is a _separate_ token used for the wordmark and
docs/help nav. Saroh Canvas keeps this split deliberately: **brand blue is a highlight
and identity colour, not the default button fill.** This is why the app reads calm — the
accent is used sparingly, exactly per [01 P1](./01_PRODUCT_DESIGN_PHILOSOPHY.md). Do not
"fix" buttons to blue without an explicit decision to re-map `--primary` to `--brand`.

---

## 2. Semantic status tokens (the GAP — define these)

There is **no** success / warning / info token today. Components improvise with raw
Tailwind palette colours — `border-amber-400`, `border-blue-400`, `border-emerald-400`
in `components/crm/activity-timeline.tsx` and `text-amber-700 dark:text-amber-400` in
`components/stores/order-payments.tsx`. That is the "rainbow creep" that
[01 §3](./01_PRODUCT_DESIGN_PHILOSOPHY.md) forbids and is un-themeable. Add these to
`globals.css` and the Tailwind config so status colour becomes a token, not a guess.

| Token (add to `:root`)               | Light HSL                                | Dark HSL                                  | Maps to                | Meaning                            |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------- | ---------------------- | ---------------------------------- |
| `--success` / `--success-foreground` | `142.1 70.6% 45.3%` / `210 40% 98%`      | `142.1 70.6% 45.3%` / `144.9 80.4% 10%`   | emerald-600            | Completed, paid, active, healthy   |
| `--warning` / `--warning-foreground` | `37.7 92.1% 50.2%` / `222.2 47.4% 11.2%` | `37.7 92.1% 50.2%` / `20.9 88% 8%`        | amber-500              | Pending, needs attention, at risk  |
| `--info` / `--info-foreground`       | `221.2 83.2% 53.3%` / `210 40% 98%`      | `217.2 91.2% 59.8%` / `222.2 47.4% 11.2%` | blue-600 (= `--brand`) | Neutral informational, in-progress |

Then extend `tailwind.config.ts` `colors` with `success`/`warning`/`info`
(`DEFAULT` + `foreground`), mirroring the existing `brand` block. Usage rules:

- **Status only.** These colours carry meaning; never use them decoratively
  ([01 §3](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).
- **Prefer tokenised `Badge` variants** over ad-hoc text colour. Add
  `success`/`warning`/`info` variants to `badge.tsx` so order/lead/booking statuses read
  as consistent pills instead of coloured text.
- `--info` intentionally equals `--brand` so "informational" and "brand" never clash —
  one blue in the whole product.

---

## 3. Typography

**Family:** Inter, self-hosted (`packages/ui/fonts/InterVariable-latin.woff2`), one
variable file for the whole product. Loaded with `display: "swap"` so text never blocks
on the font ([01 P5](./01_PRODUCT_DESIGN_PHILOSOPHY.md)). `font-feature-settings` for
tabular numbers where columns of figures appear (orders, prices) — the app already reaches
for `tabular-nums` in `components/stores/order-payments.tsx`.

**Type scale** (the only sizes allowed; map to Tailwind utilities):

| Role    | Size / line-height | Weight  | Tailwind                                           | Use                                                               |
| ------- | ------------------ | ------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Display | 30 / 36 (1.2)      | 700     | `text-3xl font-bold`                               | Marketing / big empty-state hero (rare in-app)                    |
| H1      | 24 / 29 (1.2)      | 600     | `text-2xl font-semibold`                           | Page title (matches `page.tsx` "Your stores", store layout title) |
| H2      | 20 / 24 (1.2)      | 600     | `text-xl font-semibold`                            | Section heading                                                   |
| H3      | 16 / 20 (1.25)     | 600     | `text-base font-semibold`                          | Card title, sub-section                                           |
| Body    | 14 / 21 (1.5)      | 400     | `text-sm`                                          | Default body & table text (the app's baseline)                    |
| Small   | 13 / 20 (1.5)      | 400     | `text-[0.8125rem]` → **add `text-sm-tight` token** | Secondary/meta text                                               |
| Caption | 12 / 16 (1.33)     | 400/500 | `text-xs`                                          | Badges, timestamps, helper text                                   |

**Weights:** 400 (body), 500 (medium — nav/labels, e.g. `StoreNav` uses `font-medium`),
600 (semibold — headings), 700 (bold — display only). Nothing lighter than 400 or
between these steps.

**Line-height rule:** 1.2 for headings, 1.5 for body — the two values in the shared
anchor. Don't hand-tune per component.

> **Note on "small" (13px):** Tailwind's default scale has no 13px step, so a compliant
> `--font-size-sm-tight` token / `text-sm-tight` utility should be added rather than
> reaching for `text-[13px]`. Until then, prefer `text-sm` (14) or `text-xs` (12).

---

## 4. Spacing

**Base unit: 4px** (Tailwind's default scale — `1` = 4px, `2` = 8px, `4` = 16px, …).
Every margin, padding and gap is a multiple of 4 via a Tailwind step. **No arbitrary
spacing.**

| Token | px  | Typical use (grounded)                                                           |
| ----- | --- | -------------------------------------------------------------------------------- |
| `0.5` | 2   | Hairline nudges                                                                  |
| `1`   | 4   | Icon-to-label gap                                                                |
| `1.5` | 6   | `StoreNav` item padding (`py-1.5`)                                               |
| `2`   | 8   | Compact gaps                                                                     |
| `3`   | 12  | Control padding (`px-3`), inline gaps                                            |
| `4`   | 16  | Card gap / grid gap (`gap-4` on home grid)                                       |
| `6`   | 24  | Section spacing (`mb-6` in layouts), header padding (`px-6 py-3` in `AppHeader`) |
| `8`   | 32  | Page padding (`p-8` in `page.tsx` / store layout)                                |
| `16`  | 64  | Empty-state vertical padding (`py-16` in `StoresEmptyState`)                     |

**Page rhythm (observed & sanctioned):** page container `p-8`, section separation
`mb-6`, related-element gaps `gap-4`. New pages should follow this rhythm so every screen
feels dimensionally identical ([01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)).

---

## 5. Layout & grid

- **Content max-width:** the app uses per-context caps — `max-w-4xl` (home,
  `page.tsx`), `max-w-5xl` (store layout), `max-w-6xl` (`AppHeader`). Standardise on a
  small set: **`max-w-6xl`** for the shell, **`max-w-5xl`** for content pages,
  **`max-w-md`** for focused single-column forms (e.g. `invitations/[token]`). Centred
  with `mx-auto`.
- **Container:** the Tailwind config sets `container: { center: true, padding: "2rem",
screens: { "2xl": "1400px" } }`. Use it for marketing-width sections.
- **Grid:** cards use a responsive grid — `grid gap-4 sm:grid-cols-2` (home). Prefer
  `grid` + Tailwind columns over hand-rolled flex-wrap for card collections.

---

## 6. Radius

Driven by one variable, `--radius: 0.5rem` (8px) in `globals.css`, mapped in the config:

| Token | Value                      | Tailwind       | Use                                                                  |
| ----- | -------------------------- | -------------- | -------------------------------------------------------------------- |
| `sm`  | `calc(0.5rem - 4px)` = 4px | `rounded-sm`   | Badges/inner chips                                                   |
| `md`  | `calc(0.5rem - 2px)` = 6px | `rounded-md`   | Buttons, inputs, menu items (the app default — `Button`, `StoreNav`) |
| `lg`  | `0.5rem` = 8px             | `rounded-lg`   | Cards, dialogs, empty-state containers                               |
| full  | —                          | `rounded-full` | Avatars, notification count pill, `Badge` (`rounded-full`)           |

One radius family, derived from one variable — change `--radius` once to reshape the
whole product.

---

## 7. Elevation / shadows

**Minimal by design** ([01 P1/P5](./01_PRODUCT_DESIGN_PHILOSOPHY.md)). Hierarchy comes
from **borders**, not shadows. The app is border-first (`border-b` headers, `rounded-lg
border` cards, `border border-dashed` empty state).

| Level      | Token       | Where allowed                                                                                                                                                                                       |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — flat   | none        | Page content, cards (border only)                                                                                                                                                                   |
| 1 — subtle | `shadow-sm` | Only for **overlays that float above content**: dropdowns, popovers, selects, dialogs (the vendored shadcn primitives already use `shadow-md`/`shadow-lg` here — acceptable for true overlays only) |

**Never** use shadows on cards, buttons, inputs, or page sections. No `shadow-xl`, no
coloured/glow shadows, no layered shadows.

---

## 8. Motion / duration / easing

| Token           | Value                           | Use                                                                                              |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Duration — fast | 120ms                           | Hover/focus colour transitions (`transition-colors` on `Button`, `StoreNav`)                     |
| Duration — base | 200ms                           | Enter/exit of overlays, accordions (config already ships `accordion-down/up` at `0.2s ease-out`) |
| Easing          | `ease-out`                      | Default for all transitions                                                                      |
| Reduced motion  | honour `prefers-reduced-motion` | Disable non-essential motion entirely                                                            |

**Rules.** Motion communicates a state change only ([01 P5](./01_PRODUCT_DESIGN_PHILOSOPHY.md)) —
never decorative. Nothing longer than 200ms in-app. The root layout already sets
`disableTransitionOnChange` on the `ThemeProvider` so theme flips don't animate — keep
that; a flashing theme swap is noise, not feedback.

---

## 9. Opacity

Use a fixed ladder; don't invent opacities. Grounded usages: `hover:bg-primary/90`,
`hover:bg-secondary/80` (`button.tsx`), `opacity-50` for disabled, `text-muted-foreground/50`
for disabled nav (`StoreNav`).

| Opacity             | Use                                                           |
| ------------------- | ------------------------------------------------------------- |
| `/90`               | Primary/destructive hover                                     |
| `/80`               | Secondary/badge hover                                         |
| `50` (`opacity-50`) | Disabled controls (matches `disabled:opacity-50` in `Button`) |
| `/50`               | De-emphasised/disabled text                                   |

---

## 10. Dark mode

- **Mechanism:** class strategy (`darkMode: ["class"]` in the config); `next-themes`
  `ThemeProvider` with `attribute="class"`. The app **defaults to light**
  (`defaultTheme="light"` in `app/layout.tsx`) with `enableSystem`.
- **How it works:** every colour is a CSS variable with a `.dark` override in
  `globals.css`, so components never branch on theme — they use semantic utilities
  (`bg-background`, `text-foreground`) and get dark for free. **This is why you must never
  hard-code a colour:** a raw `text-amber-700` does not adapt, but `text-warning` will.
- **Requirement:** any new semantic token (§2) must define both light and dark values.

---

## 11. Breakpoints & interaction states

**Breakpoints** (Tailwind defaults — the app uses `sm:` and `lg:` today):

| Token | Min width                         | Role (per [02 IA §5](./02_INFORMATION_ARCHITECTURE.md))                       |
| ----- | --------------------------------- | ----------------------------------------------------------------------------- |
| `sm`  | 640px                             | Card grids go multi-column                                                    |
| `md`  | 768px                             | Tablet: sidebar → icon rail                                                   |
| `lg`  | 1024px                            | Desktop: full sidebar + top bar (`AppHeader` nav is `hidden … lg:flex` today) |
| `xl`  | 1280px                            | Wider content                                                                 |
| `2xl` | 1536px (container caps at 1400px) | Max canvas                                                                    |

**Interaction states** (consistent everywhere):

| State          | Token/utility                                                                | Grounded example                                                                 |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hover          | `hover:bg-accent hover:text-accent-foreground` (nav/menu); `/90`,`/80` fills | `StoreNav`, `Button` ghost/outline                                               |
| Focus          | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`   | `Button`, `Badge` — **always visible for keyboard users**; never remove the ring |
| Active/current | `bg-accent text-accent-foreground` + `aria-current="page"`                   | `StoreNav` active tab                                                            |
| Disabled       | `disabled:opacity-50 disabled:pointer-events-none` / `aria-disabled`         | `Button`, `StoreNav` "Soon" items                                                |

Focus visibility is a hard requirement, not a preference: it's the only orientation a
keyboard or screen-reader user gets.

---

## 12. Current violations to fix

Grounded, from source (excluding vendored shadcn primitives, where Radix-derived
arbitrary values like `min-w-[8rem]` are acceptable):

| Violation                                                                                | File                                                                                    | Fix                                                                                                                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Raw palette status colours `border-amber-400` / `border-blue-400` / `border-emerald-400` | `apps/app.saroh.in/components/crm/activity-timeline.tsx`                                | Replace with `border-warning` / `border-info` / `border-success` (§2)                                                            |
| Raw palette `text-amber-700 dark:text-amber-400`                                         | `apps/app.saroh.in/components/stores/order-payments.tsx`                                | Replace with `text-warning` (§2) — and it drops the manual dark override                                                         |
| Arbitrary type `text-[10px]`                                                             | `apps/app.saroh.in/components/stores/store-nav.tsx` (Soon badge)                        | Use `text-xs` (12) or a defined caption token                                                                                    |
| Arbitrary min-width `min-w-[200px]`                                                      | `apps/app.saroh.in/components/stores/members-manager.tsx`                               | Round to a spacing token (`min-w-48` = 192px / `min-w-52` = 208px)                                                               |
| **Duplicate primitive set**                                                              | `apps/app.saroh.in/components/ui/*` exists **alongside** consuming `@saroh/ui`          | Consolidate on `@saroh/ui` so tokens can't drift between two copies (also flagged in [01 P6](./01_PRODUCT_DESIGN_PHILOSOPHY.md)) |
| **Two toast systems**                                                                    | local `components/ui/toast.tsx` (Radix, uses raw `red-300/50/400/600`) **and** `sonner` | Standardise on `sonner` (already the app's choice in server actions); delete the Radix toast to remove the raw-red leak          |

**Enforcement suggestion (non-blocking, docs-only recommendation):** an ESLint rule
forbidding arbitrary Tailwind values (`*-\[…\]`) outside `packages/ui/src/components/ui`,
plus a rule flagging raw palette colour names (`amber-`, `emerald-`, `blue-` as colour
utilities) in app code, would make "never arbitrary" mechanically enforced rather than
review-dependent.
