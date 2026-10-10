# Working in this repository

Saroh is a multi-tenant business platform: one place a small business sells,
takes bookings, follows up on enquiries and keeps a website in step. It is a
pnpm (`pnpm@9`) + Turborepo monorepo.

## Layout

- `apps/api.saroh.in` — the NestJS API, the only service that talks to the database (has its own `AGENTS.md`)
- `apps/admin.saroh.in` — the operator console for one instance (has its own `AGENTS.md`)
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
- **The repo is public.** Nothing internal is committed: prices, plan limits,
  unreleased pricing designs, anything the user calls internal. Read the file
  list before every push.
- **Never push a unit branch or open a PR per unit.** Work lands in a local
  `batch-<date>-<n>` branch and goes up once per batch — every pushed PR is a
  full CI run. `docs/patterns/devops-tooling-and-deploy.md`.
- Shared tokens live in `packages/ui/src/globals.css` and
  `tooling/tailwind-config`. `--accent` is a shadcn neutral, not a brand
  accent — renaming it breaks components.

## UX design audits

Whenever the user asks for a UX audit, design audit, usability audit, or a
design review of any screen (for example "let's do the UX design audit",
"audit this screen", "review the UX"), read **AUDIT-PLAYBOOK.md** first and
follow it exactly. That means loading all 14 skills it lists with
`read_skill_prompt` (in Claude Code, the Skill tool) before auditing. The user
shouldn't have to name the file or the skills.

## Triggers — read before you change

Not every agent loads skills on its own — Claude Code in this repo does not — so
this table is how a pattern reaches you. Find what you are about to do and read
the right-hand files **before** writing code.

| When you are about to…                                                                                     | Read first                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Make any change                                                                                            | `docs/patterns/00-universal.md`                                                                |
| Audit or review the UX or design of a screen                                                               | `AUDIT-PLAYBOOK.md`                                                                            |
| Run the stack, seed or pick a database, or check a change in a browser by hand                             | `docs/architecture/LOCAL_DEV.md`                                                               |
| Design or change anything a merchant sees, decide what to build, or write copy, a claim or a status        | `docs/patterns/saroh-product.md` · `PRODUCT.md`                                                |
| Debug anything non-obvious                                                                                 | `docs/architecture/DEV_LEARNINGS.md`                                                           |
| Agree a product or architecture decision with the user — write it down the same day                        | `docs/architecture/DECISIONS.md` · `docs/architecture/adr/` · `00-universal.md` §13            |
| Add a route, page, layout, component or `lib/` module in a Next app                                        | `docs/patterns/frontend-app-structure.md` · `.agents/skills/saroh-architecture/SKILL.md`       |
| Read or write API data from a Next app, or add client or URL state                                         | `docs/patterns/frontend-data-and-state.md`                                                     |
| Add a merchant-site page or read, or an API write that changes what a published page shows                 | `docs/patterns/frontend-data-and-state.md` → page cache · `docs/patterns/backend-jobs.md`      |
| Build or change a form                                                                                     | `docs/patterns/frontend-forms.md`                                                              |
| Show a toast, an error, or an empty, loading or failed state                                               | `docs/patterns/frontend-error-feedback.md` · `.agents/skills/saroh-product-states/SKILL.md`    |
| Touch session handling, `packages/auth`, or anything that redirects to sign-in                             | `docs/patterns/frontend-error-feedback.md` · `docs/patterns/backend-auth-and-access.md`        |
| Style anything, add a token, icon or animation, or draw on a merchant's page                               | `docs/patterns/frontend-design-system.md`                                                      |
| Build or change merchant-facing UI in `app.saroh.in`                                                       | `.agents/skills/saroh-four-scenes/SKILL.md`                                                    |
| Call a UI change done                                                                                      | `docs/patterns/frontend-verification.md` · `.agents/skills/saroh-browser-tests/SKILL.md`       |
| Add or change an API module, controller, service, DTO or guard                                             | `docs/patterns/backend-nestjs.md` · `.agents/skills/saroh-architecture/SKILL.md`               |
| Change `schema.prisma`, add a model, or store money                                                        | `docs/patterns/backend-data-and-money.md` · `.agents/skills/saroh-migrations/SKILL.md`         |
| Touch roles, membership, invitations, organization context, capability gates, entitlements or staff access | `docs/patterns/backend-auth-and-access.md` · `.agents/skills/saroh-module-capability/SKILL.md` |
| Change the admin console, or add an `/admin` endpoint or staff permission                                  | `apps/admin.saroh.in/AGENTS.md` · `docs/patterns/backend-auth-and-access.md`                   |
| Enqueue a background job, or write or register a handler                                                   | `docs/patterns/backend-jobs.md`                                                                |
| Touch invoices, subscriptions, the renewal job, courses or class packs                                     | `docs/patterns/backend-billing-and-classes.md` · ADR-007                                       |
| Call a payment, billing, messaging or storage provider, or receive a webhook                               | `docs/patterns/backend-integrations.md`                                                        |
| Add an environment variable, an environment check or a feature flag                                        | `docs/patterns/devops-environments-and-flags.md`                                               |
| Handle a credential, or find one where it should not be                                                    | `docs/patterns/devops-secrets.md`                                                              |
| Add logging, a degraded path, a health check or error tracking                                             | `docs/patterns/devops-observability.md`                                                        |
| Send anything to PostHog, add a product event, or touch tracking or session recording on any app           | `docs/architecture/ERROR_TRACKING_AND_UPTIME.md` · `docs/patterns/devops-observability.md`     |
| Touch the cookie notice, Google Analytics, an ad tag or an ad conversion, on saroh.in or anywhere          | `docs/architecture/ADS_TRACKING.md` · `docs/patterns/devops-observability.md` → Ad tags        |
| Change lint, TypeScript, CI, tests or dependencies, or ship the API                                        | `docs/patterns/devops-tooling-and-deploy.md`                                                   |
| Start work, create a branch, push, open a PR or release                                                    | `docs/patterns/devops-tooling-and-deploy.md` → Branches, batches and pull requests             |

## Before you finish

```bash
pnpm prepush          # secrets, lint, types, check:*, unit tests, vitest
pnpm prepush --all    # before a push: + API integration (TEST_DATABASE_URL)
                      #   and the changed screens' browser specs, desk + phone,
                      #   on CI's seeded stack built from HEAD (E2E_DATABASE_URL)
```

A step that passed on a tree is never re-run on it (`--no-cache` forces it);
`--all` stops the local `pnpm dev` stack first and says how to restart it.
Locally `--int` and `--e2e` run only the specs the batch reaches (`--full`
runs all). So every new browser spec starts with a `// @covers …` line
(`pnpm run check:e2e-covers`).
A new browser spec owns its data — it runs beside every other test — and
tags a business-wide change `@serial` (`saroh-browser-tests` skill).

`git push` runs the quick gate itself (`.husky/pre-push`); `--no-verify`
is for emergencies only. CI is the last net, not the first: every CI round trip is a push
and twenty minutes. `scripts/prepush.sh` runs what CI runs.

## Learn from every miss

When CI, a review, the user or production catches a mistake:

1. Fix it, then add an entry to `docs/architecture/DEV_LEARNINGS.md`
   (symptom, cause, fix, where the rule lives).
2. If a check could have caught it earlier, add that check to
   `scripts/prepush.sh`, a lint rule or a test, not only to prose.
3. If it is a new way of working, put it in the pattern file for its area
   and a row in Triggers below, and follow it from the next commit on.

## Keeping this file short

This file is sent with every request. A new rule goes into the pattern file or
skill for its area, not here — add a row to Triggers above (and a pattern to
`docs/patterns/README.md`) so an agent that does not load them on its own still
finds it. Only a rule whose violation fails silently and expensively across
the whole repo belongs in "Rules that bite".
