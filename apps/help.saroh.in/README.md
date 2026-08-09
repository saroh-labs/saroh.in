# help.saroh.in

Product help for the people **using** Saroh to run a business — not for
developers contributing to the repo. (Developer docs live in
[`docs.saroh.in`](../docs.saroh.in).)

Dev port **3007** · package name `help` (`pnpm --filter help …`)

## What's here

MDX pages under [`content/`](content/), served by Nextra 4 on the App Router:

| Page                       | Covers                                     |
| -------------------------- | ------------------------------------------ |
| `index`                    | Where to start                             |
| `getting-started`          | First steps after signing up               |
| `what-your-business-needs` | Choosing the capability modules to turn on |
| `finding-your-way-around`  | The workspace: navigation and vocabulary   |
| `selling`                  | Products, orders, payments                 |
| `bookings`                 | Services, availability, the schedule       |
| `customers`                | Contacts, leads, pipeline                  |
| `website`                  | Building and publishing a site             |
| `organisation`             | Org settings, team, projects               |

Write for someone running a shop or a studio, not someone reading the source.
Match the vocabulary the product actually shows — the workspace names things the
way onboarding phrased them (Sell, Bookings, Customers, Website, Insights), so
help should too.

`app.saroh.in` links here from its in-product help affordances
([`lib/help/`](../app.saroh.in/lib/help/)), which is worth checking when
renaming or moving a page.

## Stack notes

Same Nextra 4 setup as `docs.saroh.in`: theme and layout in
[`app/layout.jsx`](app/layout.jsx), `@saroh/ui` for the wordmark and tokens, and
self-hosted fonts from `packages/ui/fonts`. `globals.css` must be imported
**after** `nextra-theme-docs/style.css` — it overrides the variables that
stylesheet declares, and CSS import order decides which wins. The import sort
rule happens to preserve that today; don't rely on it silently.

## Local development

```bash
pnpm install
pnpm --filter help dev       # http://localhost:3007
```

No environment variables and no backend.

## Verification

```bash
pnpm --filter help typecheck
pnpm --filter help lint
pnpm --filter help build
```
