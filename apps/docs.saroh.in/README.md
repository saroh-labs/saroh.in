# docs.saroh.in

Developer documentation for the Saroh monorepo — for people contributing to the
codebase, not for people using the product. (End-user guides live in
[`help.saroh.in`](../help.saroh.in).)

Dev port **3006** · package name `docs` (`pnpm --filter docs …`)

## What's here

MDX pages under [`content/`](content/), served by Nextra 4 on the App Router:

| Page              | Covers                                                 |
| ----------------- | ------------------------------------------------------ |
| `index`           | Overview and how to navigate the docs                  |
| `getting-started` | Clone, install, env, first run                         |
| `architecture`    | Apps, packages, and the API-as-single-backend boundary |
| `authentication`  | Better Auth: where it runs and how sessions flow       |
| `database`        | Prisma schema, client, migrations                      |
| `contributing`    | Working in the monorepo                                |

Add a page by dropping an `.mdx` file into `content/` — Nextra builds the
navigation from the page map.

## Stack notes

Nextra 4 configures its theme and layout in [`app/layout.jsx`](app/layout.jsx),
**not** in `next.config.mjs` — the old `theme` / `themeConfig` options are gone.
`@saroh/ui` is consumed as source via `transpilePackages` so the canonical
`<Wordmark>` and the design tokens are the same ones the product apps use, and
fonts are self-hosted from `packages/ui/fonts` so a build never reaches out to
an external network.

## Local development

```bash
pnpm install
pnpm --filter docs dev       # https://docs.saroh.localhost
```

No environment variables and no backend — it is a static content site.

## Verification

```bash
pnpm --filter docs typecheck
pnpm --filter docs lint
pnpm --filter docs build
```
