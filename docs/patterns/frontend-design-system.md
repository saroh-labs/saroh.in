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

## Saroh tokens — Ink & Saffron

- **Current** — **The brand is the "Saroh Brand System" page in the Claude
  Design project** (22 sections, v1); every value there is decided. How it
  landed, what is still to build and the one departure (`--input`) are in
  `docs/architecture/adr/ADR-005-ink-and-saffron-brand.md`. Ink `#1C1C1A` is the primary;
  Saffron `#D98A15` is the one accent; Paper `#F5F2EC` is the page, white the
  raised surface.
- **Current** — **Saffron is punctuation:** the cursor dot, one progress fill,
  one active state per screen. Two visible accents means one is wrong. Saffron
  500 is for fills; text in Saffron is 700 on light and 400 on dark.
- **Current** — Semantic colours `primary`, `secondary`, `muted`, `accent`,
  `destructive`, `success`, `warning` and `info`, each with `-foreground`; a
  `-subtle` pair for `success`, `warning`, `destructive`, `info`, `brand` and
  `highlight`; `-hover`/`-active` steps on the filled actions; `border-strong`,
  `field` and `disabled`. Scales: `brand-*` is Saffron, and `highlight-*` and
  `neutral-*` are both Ink. Warning is red-orange, never amber, because amber
  reads as Saffron.
- **Current** — **`--primary` is the Ink button; `highlight` is the Saffron
  one;** `--brand` is Saffron that sets text. The `brand` Button variant renders
  Ink, like `default`. Only `highlight` is Saffron, and it goes on one action
  per screen.
- **Current** — **Hover moves one ramp step, pressed two**, never a new hue and
  never an opacity. **De-emphasis is a colour, not an opacity:** Ink 500 on
  light.
- **Current** — **`--layer-1`…`--layer-6` are the Business Calendar's layer
  fills** (umber, green, slate, clay, bronze, navy, as the design draws them,
  kept on dark), with `--layer-foreground` for the count written on them.
  Which layer takes which is `lib/calendar/layers.ts`; the class strings sit
  in `components/calendar/tones.ts` because Tailwind does not scan `lib/`.
- **Current** — **`--accent` is a shadcn neutral** with about 32 component
  usages, not a brand accent. Don't rename it.
- **Adopted** — **Never an arbitrary value, a hex literal or a raw palette class
  in app code** (06, "the cardinal rule"); add a token instead. Arbitrary values
  are fine inside `packages/ui` primitives. Gap: one raw palette class in
  `app.saroh.in`; arbitrary values in app code are not counted.
- **Adopted** — **Add a token only when the pattern recurs** (three or more
  places) and nothing existing fits, with a comment saying what it is for.

## Skins and dark mode

- **Current** — **Skins are token scopes, nothing more.** The brand (`saroh`)
  is the base `:root` / `.dark` register and the default, so it has no block of
  its own. The four pre-brand skins (`mono`, `panel`, `instrument` and
  `stockroom`) sit on a legacy block that holds the old base verbatim. They are
  hidden in the switcher until the brand settles, and the switcher renders
  nothing while only one skin is visible. `saroh.app` pins `data-skin="mono"`,
  so merchant-facing Saroh surfaces keep the pre-brand register. A skin is
  selected by `data-skin` on `<html>` and composes with `.dark`. A new skin is a
  CSS block in `globals.css` plus an entry in `apps/app.saroh.in/lib/skins.ts`.
  Never branch on a skin in a component.
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
- **Current** — **Status reads through `Badge` variants,** never coloured text.
  State is a filled pill (`success`, `warning`, `error`, `info`, `draft`): the
  status tint with its 700 text, always saying the status in words. Kind is the
  neutral outline `tag`, for categories a shop owner invents.
- **Current** — **Border-first elevation.** `Card` is `rounded-xl` (14px) with
  no shadow, and `Button` and `Input` carry none. Shadows are Ink at low alpha,
  never black, and are for overlays that float above content: raised 8%, menu
  10%, modal 14%. On dark, depth comes from a surface step instead.
- **Current** — **The work area is white in light and the ground in dark.**
  In light the rail sits on Paper and the page you work on is the raised white
  card. In dark it is the ground (`--background`), as on the marketing site,
  and the tables and cards on it are the step up (`--card`). So a table
  container carries `bg-card` itself, not relying on the page behind it
  (`app-shell.tsx`, `data-view.tsx`).
- **Current** — **Button sizes are 32 / 38 / 45px** (`sm`, `default`, `lg`),
  set explicitly and weight 600. **Disabled is one treatment for every
  variant:** the `disabled` surface with an Ink 500 label that still clears
  4.5:1, never an opacity. Say why a control is disabled, nearby.
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
- **Current** — **The focus ring is Ink 900 with a Paper offset** (Saffron 400
  on dark), so it reads on white, Paper, Ink and Saffron alike.
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

## Type and the mark

- **Current** — **Three product faces, self-hosted in `packages/ui/fonts`:**
  Geist (`font-sans`) for all UI, body copy, labels and eyebrows, with 600 for
  buttons and emphasis. Space Grotesk (`font-display`) for display through H3,
  money and large figures, never body copy. JetBrains Mono (`font-mono`) **only
  where a value is measured**: a SKU, an order reference, a timestamp, a token
  value, a route. A label or eyebrow is 11px Geist 600, uppercase at 0.1em —
  never mono. Nothing is set below 11px. The wordmark's face (Plus Jakarta Sans 600) ships outlined inside `<Wordmark>` and is never loaded. `saroh.app`
  keeps its old faces.
- **Current** — **The mark is one SVG master** in `packages/ui/brand`, with
  `<Wordmark>` / `<SarohSymbol>` from `@saroh/ui/wordmark`. Never re-draw it.
  The stroke is never Saffron, and the dot drops below 20px. Every brand app
  ships `favicon.ico`, `icon.svg` and `apple-icon.png` in `app/`, rendered from
  that master.

## Motion

- **Current** — **Reduced motion is honoured globally:** `globals.css` clamps
  every animation and transition under `prefers-reduced-motion`. 15 §4's gap is
  closed.
- **Current** — **Durations come from the tokens:** 100ms (`fast`) under the
  finger, 140ms (`base`) as the default, 200ms (`slow`) for drawers and sheets,
  always ease-out and never overshooting. That settles the old cap: nothing is
  longer than 200ms. Exit faster than entry, and never animate position and size
  together. Motion only explains a change, so there is no decorative, looping,
  parallax or bounce motion on product surfaces.
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
