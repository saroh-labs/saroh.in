# Design system and theming

> **Read when:** styling anything; adding a token, a skin, an icon or an
> animation; checking accessibility; or drawing on a merchant's page.
> Adapted from claude-patterns `frontend/04-design-system.md`, reconciled with
> `docs/design-system/` — `06_DESIGN_TOKENS.md`, `07_STYLE_GUIDE.md`,
> `13_ACCESSIBILITY_GUIDE.md`, `14_RESPONSIVE_GUIDE.md`, `15_MOTION_GUIDELINES.md`.
> Those are a July 2026 audit; several gaps they describe have since closed,
> and dated notes in them say which. This file is the current state.

## Two token layers, never mixed

| Layer    | Where it is defined                                               | Where it is used                                                |
| -------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Saroh    | `packages/ui/src/globals.css`, `tooling/tailwind-config`          | The product apps                                                |
| Merchant | `--site-*` via `packages/site-blocks` (`SiteTheme`, `siteColors`) | `apps/saroh.app`, the editor preview, the `ui.saroh.in` catalog |

- **Current** — A merchant's site never inherits Saroh's brand, and
  `pnpm run check:blocks` enforces it. **G2:** no Saroh design token inside a
  site block. **G6:** the `--site-*` layer only inside `packages/site-blocks`,
  plus an allowlist in `scripts/check-blocks.mjs` of Saroh surfaces on a
  merchant's page (404, error and loading boundaries, checkout, the site header
  and footer, preview frames). A surface that draws no block goes on the list
  with its reason; a block goes in the package.
- **Current** — Every `siteColors` key has a default in `SiteTheme` (`muted` and
  `border` did not until `00cd219`).

## Saroh tokens

- **Current** — Semantic colours `primary`, `secondary`, `muted`, `accent`,
  `destructive`, `success`, `warning` and `info`, each with `-foreground`, plus
  `warning-subtle`; scales `brand-*`, `highlight-*`, `neutral-*`; shadows;
  `--radius`; motion tokens `--duration-fast` (120ms), `--duration-base` (200ms),
  `--duration-slow` (320ms), `--ease-out` and `--ease-in-out`. 06 §2's "no status
  tokens" gap is closed.
- **Current** — **`--primary` is the filled-button colour; `--brand` is the
  interactive blue** for links, focus and emphasis. The `brand` and `highlight`
  Button variants deliberately render the `--primary` fill (`button.tsx`); don't
  turn CTAs blue without deciding to (06 §1).
- **Current** — **`--accent` is a shadcn neutral** with about 32 component
  usages, not a brand accent. Don't rename it.
- **Adopted** — **Never an arbitrary value, a hex literal or a raw palette class
  in app code** (06, "the cardinal rule"); add a token instead. Arbitrary values
  are fine inside `packages/ui` primitives. Gap: one raw palette class in
  `app.saroh.in`; arbitrary values in app code are not counted.
- **Adopted** — **Add a token only when the pattern recurs** (three or more
  places) and nothing existing fits, with a comment saying what it is for.

## Skins and dark mode

- **Current** — **Four skins are token scopes, nothing more:** `mono` (the
  default, with no block of its own), `panel`, `instrument` and `stockroom`,
  selected by `data-skin` on `<html>` and composing with `.dark`. No component
  knows a skin exists. A new skin is a CSS block in `globals.css` plus an entry
  in `apps/app.saroh.in/lib/skins.ts`, which the switcher and the pre-paint
  script share. Never branch on a skin in a component.
- **Current** — `--radius` differs by skin (0 to 0.5rem), so `rounded-sm` on a
  16px control is at most 4px and never turns a checkbox round. **Adopted** — a
  skin that raises `--radius` must re-check small fixed controls.
- **Current** — Dark mode is the `class` strategy through `next-themes`; the app
  defaults to light with system preference enabled, and theme flips don't
  animate (`disableTransitionOnChange`). **Adopted** — every colour token defines
  a light and a dark value in every skin; dark is defined, never derived
  (`saroh-four-scenes` skill).

## Components and status

- **Current** — **Variants over colour classNames.** Don't paint `bg-*` or
  `text-*` over a primitive; add a variant. `Button` has `default`, `brand`,
  `highlight`, `success`, `destructive`, `outline`, `secondary`, `ghost` and
  `link`.
- **Adopted** — **Status reads through `Badge` variants on the status tokens** —
  success, warning, info, destructive — never coloured text (06 §2, 07 §6). Gap:
  `Badge` has only `default`, `secondary`, `destructive` and `outline`.
- **Current** — **Border-first elevation.** `Card` is `rounded-xl` with no
  shadow, and `Button` and `Input` carry none; shadows are for overlays that
  float above content (06 §7).
- **Adopted** — **One primary action per screen;** button labels are verb plus
  noun; sentence case everywhere; the product is always "Saroh" (07 §2, §4).
- **Adopted** — **Containers come from a small named set** (04 §1): narrow for
  auth and wizards, form, default, wide. Gap: pages still pick their own
  `max-w-*`.
- **Current** — **`--warning` is a fill;** text on a pale tint uses
  `--warning-subtle-foreground`.

## Touch, reflow and accessibility

- **Current** — **Touch targets reach 44px on a touch pointer.** Every `Button`
  size grows through the `coarse:` variant (`default` and `icon` 40→44px, `sm`
  32→44px) and keeps its desk height under a mouse; `coarse:` is a pointer
  media query, not a width. 13 §7 and 14 §5's "40px default" finding predates
  it. Inputs were not re-checked.
- **Adopted** — **Reflow at 320px and 390px** with no hidden operation and no
  page-level horizontal scroll; wide content scrolls inside its own container
  (14, 18, 04 §4). Put `min-w-0` on grid and flex columns holding text.
- **Adopted** — **No hover-only affordance, ever** (PRODUCT_STRATEGY §19): the
  phone and the shop floor have no hover.
- **Adopted** — **Contrast materially above 4.5:1** for body text, in light and
  dark and every skin (`PRODUCT.md`); never colour alone; the focus ring is never
  removed; `muted-foreground` is never set below 14px or given opacity
  (13 §4); every dialog renders a `DialogTitle` (13 §8).
- **Adopted** — **Icon-only controls have an accessible name** (an `aria-label`,
  or an `sr-only` span as `dialog.tsx` does). Gap: the icon buttons in
  `components/shared/skin-switcher.tsx` and `components/common/ThemeToggle.tsx`.

## Icons

- **Adopted** — **`lucide-react` only**, `size-4` by default, `currentColor`, one
  meaning per glyph (`Plus` creates, `X` dismisses) (07 §3). Gap: `react-icons`
  is imported in `accounts.saroh.in` `components/auth/login-form.tsx` and
  `ui.saroh.in` `components/shared/header/index.tsx`.

## Motion

- **Current** — **Reduced motion is honoured globally:** `globals.css` clamps
  every animation and transition under `prefers-reduced-motion`. 15 §4's gap is
  closed.
- **Adopted** — **Durations come from the tokens,** and motion only explains a
  change — no decorative, looping, parallax or bounce motion on product surfaces
  (15 §2). The cap is unresolved: 06 §8 says nothing over 200ms in-app, 15 says
  overlays up to 300ms, and `--duration-slow` is 320ms. Until one change settles
  it, nothing longer than `--duration-slow`.
- **Adopted** — **Motion comes from the primitives and the shared Tailwind
  config, not per-app `@keyframes`** (15 §3). Gap, and a contradiction to
  resolve rather than copy: `accounts.saroh.in/app/auth.css` defines 8 keyframes
  and `app.saroh.in/app/workspace.css` 3, some on curves named `--sa-spring` and
  `--wk-spring`. Don't add a third file.

## Numbers and dates

- **Current** — **Shared formatters** in `apps/app.saroh.in/lib/format`:
  `formatMoney`, `formatMoneyMajor` and `formatCount` in `money.ts`, date and time
  helpers that take an explicit time zone in `datetime.ts`, and
  `DISPLAY_LOCALE = "en-GB"` in `locale.ts`. Never concatenate a currency symbol
  by hand (07 §5).
- **Adopted** — `tabular-nums` on columns of figures, and "—" where zero is a
  state rather than a measurement (07 §5).
