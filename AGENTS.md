# Working in this repository

## Run the apps with portless, never on ad-hoc ports

Every app is reached at its **production hostname with `.localhost` appended**.
`portless` (a devDependency, already installed as a systemd service) terminates
HTTPS on 443 and routes each hostname to the right dev server. Each app's
`portless` field in its `package.json` declares its name; `pnpm dev` runs
`dev`, which runs `portless`, for every app at once.

```bash
pnpm dev                                    # everything
pnpm dev:api-auth                           # api + accounts only
pnpm turbo run dev --filter=@saroh/api --filter=auth --filter=application
pnpm exec portless service status           # is the proxy up?
```

**Do not start apps with `next dev -p 3003` or `nest start` and a `PORT`.** It
looks equivalent and is not:

- `api.saroh.in`'s CORS allowlist is built from these `.localhost` hostnames
  (`main.ts`), so sign-in from an app on a bare port is refused by the browser
  before it reaches the API — with no error in the API log, because no request
  arrives.
- Better Auth issues a cookie scoped to the shared parent domain. Apps on
  different ports of bare `localhost` do not get a working cross-app session,
  so the workspace bounces back to the login screen forever.
- The `.localhost` names match production, so what you verify locally is the
  shape that ships.

## The domains

| App                  | Production                               | Local (portless)                  |
| -------------------- | ---------------------------------------- | --------------------------------- |
| `accounts.saroh.in`  | accounts.saroh.in                        | https://accounts.saroh.localhost  |
| `api.saroh.in`       | api.saroh.in                             | https://api.saroh.localhost       |
| `app.saroh.in`       | app.saroh.in                             | https://app.saroh.localhost       |
| `admin.saroh.in`     | admin.saroh.in                           | https://admin.saroh.localhost     |
| `saroh.app`          | saroh.app, `*.saroh.app`, custom domains | https://saroh.app.localhost       |
| `templates.saroh.in` | templates.saroh.in                       | https://templates.saroh.localhost |
| `ui.saroh.in`        | ui.saroh.in                              | https://ui.saroh.localhost        |
| `docs.saroh.in`      | docs.saroh.in                            | https://docs.saroh.localhost      |
| `help.saroh.in`      | help.saroh.in                            | https://help.saroh.localhost      |
| `saroh.in`           | saroh.in                                 | https://saroh.localhost           |

A **merchant's own site** hangs off the renderer's apex, so the seeded
`northwind` site is https://northwind.saroh.app.localhost — that wildcard is
why `portless service install` takes `--wildcard`. A **draft preview** lives at
`https://saroh.app.localhost/preview/<token>`.

Merchant sites must never inherit Saroh's brand; the `--site-*` token layer is
separate by design.

## Seeded data

```bash
pnpm --filter @saroh/database db:seed        # "Northwind Supply"
```

Sign in as `demo@saroh.dev` / `demo-password-123`. The seed lays down 24
contacts, 16 leads, 3 services, 10 bookings, 12 products, 10 orders and 3
sites, which is enough for every operational surface to have something on it.

## Databases

`packages/database/src/database-target.ts` refuses to migrate or seed a
database that is not allow-listed for the current `NODE_ENV`. To use a
throwaway database, name it explicitly rather than working around the guard:

```bash
DATABASE_TARGET_CONFIRM=saroh_scratch DATABASE_URL=... pnpm --filter @saroh/database db:seed
```

Migrations must replay onto an empty database and match `schema.prisma`
exactly. Before committing one:

```bash
DATABASE_TARGET_CONFIRM=saroh_migrate_check DATABASE_URL=<empty db> \
  pnpm --filter @saroh/database db:verify:replay
```

CI runs the same check as the `migration-replay` job. See the
`saroh-migrations` skill for why — the integration suite builds its schema with
`prisma db push` and never executes a migration file, so nothing else catches a
broken one.

## Architecture rules that bite

- **`api.saroh.in` is the only database-facing service.** Frontends never
  import `@saroh/database`, and never import a package that depends on it
  (`@saroh/templates` is the one that catches people). The shared ESLint config
  enforces this.
- **Organization is the tenant root**, not Store (ADR-001).
- Shared design tokens live in `packages/ui/src/globals.css` and
  `tooling/tailwind-config`. `--accent` is a shadcn neutral, not a brand
  accent — renaming it breaks components.

## `SKIP_ENV_VALIDATION` drops the defaults too

The API's typed env module returns `process.env` untouched when that flag is
set — so it skips the schema's **defaults** as well as its validation. `PORT`
has a default of 3333 that never applies, and `app.listen(undefined)` binds a
random port.

It looks fine locally because `apps/api.saroh.in/.env` sets `PORT`. Anywhere
without a `.env` — CI, a container — you must pass every value the app needs,
including the ones that "have a default". This cost a red CI run.

## Browser tests

The only tests that can answer a cross-origin or a layout question. Everything
in `e2e/` needs the stack actually running.

```bash
pnpm dev                                          # in another terminal
pnpm --filter @saroh/e2e install:browsers         # once
E2E_IGNORE_HTTPS_ERRORS=1 pnpm --filter @saroh/e2e test:e2e
```

`E2E_IGNORE_HTTPS_ERRORS` is needed locally because portless serves the
`.localhost` names with its own CA; CI runs on bare ports and does not set it.

**Set `BETTER_AUTH_TRUSTED_ORIGINS` when running the stack yourself.** Unset, it
falls back to the `*.saroh.in` production list, so a return-to on a `.localhost`
origin is correctly refused and sign-in silently lands on the app launcher
instead of the page you asked for (#222). `.env.example` has the right value;
an ad-hoc `turbo run dev` with your own env does not inherit it.

## Triggers — read before you change

Not every agent loads `.agents/skills/` on its own — Claude Code in this repo
does not — so this table is how a rule reaches you. Find what you are about to
do and follow the right-hand column **before** writing code. Product and
architecture decisions are in `docs/architecture/DECISIONS.md`; these sit below
them.

| When you are about to…                                                                                         | First                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Debug anything non-obvious                                                                                     | Search `docs/architecture/DEV_LEARNINGS.md`; the cause may already be written down. Add an entry once you have fixed it.                                                                                                                                                                                                                               |
| Add a module, route or data-access path, or cross an app or package boundary                                   | Read `.agents/skills/saroh-architecture/SKILL.md`. Frontends read through Server Components and `lib/<domain>/service.ts` → `lib/api/http.ts`, and write through Server Actions (DEC-004); there is no client-side server-state library. An org-scoped Site write starts with the guards in `apps/api.saroh.in/src/modules/sites/site-access.ts`.      |
| Build a screen that reads data — empty, loading, failed, partial, denied or gated                              | Read `.agents/skills/saroh-product-states/SKILL.md`. A failed read is never an empty one.                                                                                                                                                                                                                                                              |
| Touch session handling, `packages/auth`, or anything that redirects to sign-in                                 | Use `resolveServerSession()` / `requireSession()`. Only a 401/403 means signed out; an unreachable api throws to `error.tsx`. Never collapse the two into one `null`.                                                                                                                                                                                  |
| Add or change a capability module, or a gated route or nav entry                                               | Read `.agents/skills/saroh-module-capability/SKILL.md`.                                                                                                                                                                                                                                                                                                |
| Change `schema.prisma` or a migration                                                                          | Read `.agents/skills/saroh-migrations/SKILL.md` and run the replay check under Databases.                                                                                                                                                                                                                                                              |
| Build or change merchant-facing UI in `app.saroh.in`                                                           | Read `.agents/skills/saroh-four-scenes/SKILL.md`.                                                                                                                                                                                                                                                                                                      |
| Change layout, cross-origin auth or touch targets                                                              | Read `.agents/skills/saroh-browser-tests/SKILL.md`; only a real browser answers these.                                                                                                                                                                                                                                                                 |
| Draw anything on a merchant's page — `apps/saroh.app`, `packages/site-blocks`, `SiteTheme`, the editor preview | `--site-*` tokens only, never Saroh's. A surface that draws no block (404, error boundary, checkout) goes on the G6 allowlist in `scripts/check-blocks.mjs` with its reason; a block goes in the package. A new `siteColors` key needs a `SiteTheme` default. Tailwind is 3.4: `rounded-[var(--x)]`, not `rounded-[--x]`. Run `pnpm run check:blocks`. |
| Enqueue a background job, or write or register a handler                                                       | Register the handler in the same change that first enqueues the type; `modules/jobs/job-consumers.spec.ts` fails otherwise. Handlers must be idempotent — delivery is at-least-once (DEC-008). A new terminal write on `Job` is fenced on `(id, status: PROCESSING, lockedBy)`.                                                                        |
| Show a toast                                                                                                   | `showSuccess` / `showError` / `showWarning` / `showInfo` from `@saroh/ui/toast`; ESLint rejects sonner's `toast`. Toast your own copy, never `error.message`.                                                                                                                                                                                          |
| Add a helper, hook or component                                                                                | Search for an existing one first. `cn()` comes from `@saroh/ui/lib/utils`; `packages/site-blocks` keeps its own on purpose.                                                                                                                                                                                                                            |
| Add a Next app or route group                                                                                  | Give it `app/error.tsx` and `loading.tsx`.                                                                                                                                                                                                                                                                                                             |
| Add a dependency                                                                                               | Check it is not already installed under another name, and was not removed on purpose — React Query was, because nothing here fetches server state client-side.                                                                                                                                                                                         |

## Before you finish

```bash
pnpm run lint && pnpm run typecheck
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
pnpm run check:routes && pnpm run check:blocks && pnpm run check:cycles
```

Repo-specific agent skills live in `.agents/skills/`. When you add one, add its
row to Triggers above — an agent that does not load skills will never find it
otherwise.
