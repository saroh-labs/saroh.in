# ui.saroh.in

The design-system showcase: the Midnight & Lime tokens and the `@saroh/ui`
components rendered on their own, away from any product screen.

Dev port **3011** · package name `ui` (`pnpm --filter ui …`) — the app; the
library it showcases is `@saroh/ui` in [`packages/ui`](../../packages/ui).

## What's here

[`app/page.tsx`](app/page.tsx) is the only built page, and the useful one: the
token reference. Colour swatches paired with the Tailwind utility that produces
them, plus type, buttons, badges, cards and form controls in context. The
swatches render the token values themselves rather than a screenshot of them, so
`--brand` versus `--brand-surface`, or `highlight` versus `accent`, can be seen
rather than guessed at.

## The `[pageType]` routes are a scaffold

`app/[pageType]` and `app/[pageType]/[name]` are wired end to end — the dynamic
routes resolve, the layouts exist, and an unknown page type falls through to the
`not-found` boundary — but the four list components in
[`components/pages/`](components/pages/) still return placeholder markup
(`<div>ChartsList</div>` and friends), and the detail page prints its params.

[`lib/data/pages.ts`](lib/data/pages.ts) is the registry they read. Each entry
pairs a page type with its layout and list component:

| `pageType`   | Declared pages                             |
| ------------ | ------------------------------------------ |
| `docs`       | Getting Started, Customization, Deployment |
| `components` | Buttons, Forms                             |
| `charts`     | Bar Chart, Line Chart                      |
| `templates`  | Basic Blog, E-commerce                     |

Filling these in means writing the four list components and the detail page;
the routing and navigation follow from the registry entry and need no new
routes. `@saroh/charts` is already a dependency for when the chart pages get
built — nothing imports it yet.

## Why it exists

A component library is easy to drift on when it is only ever seen inside a
feature. This is where a token change or a new variant gets checked on its own,
against the same `@saroh/ui` build every product app consumes.

## Local development

```bash
pnpm install
pnpm --filter ui dev         # https://ui.saroh.localhost
```

No environment variables and no backend.

## Verification

```bash
pnpm --filter ui typecheck
pnpm --filter ui lint
pnpm --filter ui build
```
