# Working in this repository

Saroh is a multi-tenant business platform: one place a small business sells,
takes bookings, follows up on enquiries and keeps a website in step. It is a
pnpm (`pnpm@9`) + Turborepo monorepo.

## Layout

- `apps/api.saroh.in` — the NestJS API, the only service that talks to the database (has its own `AGENTS.md`)
- `apps/*` — Next.js apps: `app` (merchant workspace), `accounts` (sign-in), `admin`, `saroh.app` (merchant sites), and the marketing, docs, help, templates and UI sites
- `packages/*` — shared code (`auth`, `database`, `ui`, `site-blocks`, …); `tooling/*` — ESLint, Tailwind, tsconfig
- `e2e/` — Playwright tests against the running stack
- `docs/patterns/` — how the codebase is built; `.agents/skills/` — step-by-step procedures
- `docs/architecture/` — current state, decisions, environment, local dev; `docs/plans`, `docs/prototypes`, `docs/product-transformation` — history, not current rules

## Rules that bite

- **Run apps with portless at `https://<app>.saroh.localhost`, never on a bare
  port** — CORS and the shared session silently break otherwise.
  `docs/architecture/LOCAL_DEV.md`.
- **Only `api.saroh.in` touches the database.** Frontends never import
  `@saroh/database` or Prisma, nor the root or `/server` entry of `@saroh/auth`,
  which pulls it in — use `@saroh/auth/client`, `/next`, `/middleware`,
  `/auth-status` or `/constants`. ESLint enforces it
  (`tooling/eslint-config-custom/nextjs.js`).
- **Organization is the tenant root**, not Store (ADR-001).
- **Merchant sites never inherit Saroh's brand**; the `--site-*` token layer is
  separate by design.
- Shared tokens live in `packages/ui/src/globals.css` and
  `tooling/tailwind-config`. `--accent` is a shadcn neutral, not a brand
  accent — renaming it breaks components.

## Triggers — read before you change

Not every agent loads skills on its own — Claude Code in this repo does not — so
this table is how a pattern reaches you. Find what you are about to do and read
the right-hand files **before** writing code.

| When you are about to…                                                                                     | Read first                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Make any change                                                                                            | `docs/patterns/00-universal.md`                                                                |
| Run the stack, seed or pick a database, or check a change in a browser by hand                             | `docs/architecture/LOCAL_DEV.md`                                                               |
| Design or change anything a merchant sees, decide what to build, or write copy, a claim or a status        | `docs/patterns/saroh-product.md` · `PRODUCT.md`                                                |
| Debug anything non-obvious                                                                                 | `docs/architecture/DEV_LEARNINGS.md`                                                           |
| Add a route, page, layout, component or `lib/` module in a Next app                                        | `docs/patterns/frontend-app-structure.md` · `.agents/skills/saroh-architecture/SKILL.md`       |
| Read or write API data from a Next app, or add client or URL state                                         | `docs/patterns/frontend-data-and-state.md`                                                     |
| Build or change a form                                                                                     | `docs/patterns/frontend-forms.md`                                                              |
| Show a toast, an error, or an empty, loading or failed state                                               | `docs/patterns/frontend-error-feedback.md` · `.agents/skills/saroh-product-states/SKILL.md`    |
| Touch session handling, `packages/auth`, or anything that redirects to sign-in                             | `docs/patterns/frontend-error-feedback.md` · `docs/patterns/backend-auth-and-access.md`        |
| Style anything, add a token, icon or animation, or draw on a merchant's page                               | `docs/patterns/frontend-design-system.md`                                                      |
| Build or change merchant-facing UI in `app.saroh.in`                                                       | `.agents/skills/saroh-four-scenes/SKILL.md`                                                    |
| Call a UI change done                                                                                      | `docs/patterns/frontend-verification.md` · `.agents/skills/saroh-browser-tests/SKILL.md`       |
| Add or change an API module, controller, service, DTO or guard                                             | `docs/patterns/backend-nestjs.md` · `.agents/skills/saroh-architecture/SKILL.md`               |
| Change `schema.prisma`, add a model, or store money                                                        | `docs/patterns/backend-data-and-money.md` · `.agents/skills/saroh-migrations/SKILL.md`         |
| Touch roles, membership, invitations, organization context, capability gates, entitlements or staff access | `docs/patterns/backend-auth-and-access.md` · `.agents/skills/saroh-module-capability/SKILL.md` |
| Enqueue a background job, or write or register a handler                                                   | `docs/patterns/backend-jobs.md`                                                                |
| Call a payment, billing, messaging or storage provider, or receive a webhook                               | `docs/patterns/backend-integrations.md`                                                        |
| Add an environment variable, an environment check or a feature flag                                        | `docs/patterns/devops-environments-and-flags.md`                                               |
| Handle a credential, or find one where it should not be                                                    | `docs/patterns/devops-secrets.md`                                                              |
| Add logging, a degraded path, a health check or error tracking                                             | `docs/patterns/devops-observability.md`                                                        |
| Change lint, TypeScript, CI, tests or dependencies, or ship the API                                        | `docs/patterns/devops-tooling-and-deploy.md`                                                   |

## Before you finish

```bash
pnpm run lint && pnpm run typecheck
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
pnpm run check:routes && pnpm run check:blocks && pnpm run check:cycles
```

## Keeping this file short

This file is sent with every request. A new rule goes into the pattern file or
skill for its area, not here — add a row to Triggers above (and a pattern to
`docs/patterns/README.md`) so an agent that does not load them on its own still
finds it. Only a rule whose violation fails silently and expensively across
the whole repo belongs in "Rules that bite".
