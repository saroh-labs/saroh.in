# Design system and theming

> **Read when:** styling anything, adding a token, an icon or an animation, or
> drawing on a merchant's page.
> Adapted from claude-patterns `frontend/04-design-system.md`. The full system is
> in `docs/design-system/` — start with `06_DESIGN_TOKENS.md`,
> `05_COMPONENT_LIBRARY.md`, `13_ACCESSIBILITY_GUIDE.md`,
> `14_RESPONSIVE_GUIDE.md` and `15_MOTION_GUIDELINES.md`. This file is the rules
> an agent must not break.

## Two token layers, never mixed

| Layer    | Where it is defined                                               | Where it is used                                                |
| -------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Saroh    | `packages/ui/src/globals.css`, `tooling/tailwind-config`          | The product apps                                                |
| Merchant | `--site-*` via `packages/site-blocks` (`SiteTheme`, `siteColors`) | `apps/saroh.app`, the editor preview, the `ui.saroh.in` catalog |

A merchant's site must never inherit Saroh's brand. `pnpm run check:blocks`
enforces this:

- **G2:** no Saroh design token inside a site block.
- **G6:** the `--site-*` layer only inside `packages/site-blocks`, plus an
  allowlist in `scripts/check-blocks.mjs` of Saroh surfaces that sit on a
  merchant's page — the 404, error and loading boundaries, checkout, the site
  header and footer, the preview frames. A new surface that draws no block goes
  on the list with its reason; a block goes in the package.
- **Every `siteColors` key needs a default in `SiteTheme`.** `muted` and
  `border` had none, so `text-site-muted` silently rendered at the inherited
  colour on every fallback path.

## Saroh tokens

- Semantic colours `primary`, `secondary`, `muted`, `accent`, `destructive`,
  `success`, `warning` and `info` (each with `-foreground`); scales `brand-*`,
  `highlight-*` and `neutral-*`; shadows, radius, `--duration-*` and `--ease-*`.
- **`--accent` is a shadcn neutral** with about 32 component usages, not a brand
  accent. Don't rename it.
- No hex literals or raw palette classes (`bg-blue-500`) in a component.

## Rules

- **Variants over colour classNames.** Don't paint `bg-*` or `text-*` over
  `Badge`, `Button` or `Alert`; add a variant to the primitive. `Badge` has
  `default`, `secondary`, `destructive` and `outline`.
- **Tailwind is 3.4.** Arbitrary custom properties need `var()`:
  `rounded-[var(--site-radius)]`, not `rounded-[--site-radius]`.
- **One icon set: `lucide-react`.** `react-icons` survives in two files (the
  `accounts.saroh.in` login form and the `ui.saroh.in` header); replace it, don't
  spread it. Every icon-only control has an `aria-label`.
- **Motion respects reduced motion.** `globals.css` clamps every animation and
  transition under `prefers-reduced-motion`. Keep keyframes in stylesheets
  loaded alongside it (`auth.css`, `workspace.css`) so the clamp applies, and
  take durations from the `--duration-*` tokens.
- **Touch is a primary scene.** Use the `coarse:` variant for touch sizing, and
  read `.agents/skills/saroh-four-scenes/SKILL.md` for merchant-facing UI.
- **Small fixed-size controls pin their radius** rather than inheriting a
  proportional one that turns a checkbox into a circle.
- **Token sprawl is the risk.** Reuse the closest existing token. Add one only
  when the pattern recurs in three or more places and nothing fits, with a
  comment saying what it is for.
