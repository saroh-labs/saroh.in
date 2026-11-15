# docs.saroh.in

Saroh's public API docs: how to get a key, call the API, take bookings and
orders from your own site, receive webhooks and connect Claude or ChatGPT.
(End-user guides live in Help on saroh.in.)

Runs at `https://docs.saroh.localhost` under portless · package name `docs` (`pnpm --filter docs …`)

## What's here

MDX pages under [`content/api/`](content/api/), served by Nextra 4 on the App
Router at `/api/*`. `/` sends visitors to `/api` (the Worker does it; there is
no home page). The reference is drawn from `public/api/*.json`, which
`pnpm openapi` writes and `pnpm check:openapi` keeps in step with the contract.

Everything in `content/` is published. The contributor guides (running and
working on the monorepo) are kept out of the site, in
[`contributing/`](contributing/README.md):
[getting started](contributing/getting-started.md),
[architecture](contributing/architecture.md),
[authentication](contributing/authentication.md),
[database](contributing/database.md),
[contributing](contributing/contributing.md).

## Where it runs

A static export (`output: "export"`, `out/`) with a Pagefind search index
(`out/_pagefind`, written by `postbuild`), served as Workers static assets
behind [`worker/index.mjs`](worker/index.mjs): the dev access key, noindex
off the production host, `/` → `/api`, and the security headers. No Next
server, no OpenNext.

| Edition | Development                 | Production        |
| ------- | --------------------------- | ----------------- |
| India   | `docs.saroh.io` (key-gated) | `docs.saroh.in`   |
| Global  | Global's dev domain (gated) | `docs.saroh.tech` |

Deployed by `.github/workflows/deploy-frontends.yml` (`docs`, `docs-global`)
and `deploy-global-dev.yml`, from [`wrangler.jsonc`](wrangler.jsonc).
`pnpm cf:build` first writes the OpenAPI files for the deploy's edition and
environment (`NEXT_PUBLIC_EDITION`, `VERCEL_ENV`), so every host on the pages
is that deploy's. See `docs/patterns/devops-tooling-and-deploy.md`.

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
pnpm --filter docs dev       # https://docs.saroh.localhost/api
```

No environment variables and no backend.

## Verification

```bash
pnpm --filter docs typecheck
pnpm --filter docs lint
pnpm --filter docs test      # the Worker
pnpm --filter docs build     # out/, India's production hosts
NEXT_PUBLIC_EDITION=GLOBAL pnpm --filter docs cf:build   # Global's; then `pnpm openapi` to restore
```
