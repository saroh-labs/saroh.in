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

## Before you finish

```bash
pnpm run lint && pnpm run typecheck
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
pnpm run check:routes && pnpm run check:cycles
```

Repo-specific agent skills live in `.agents/skills/`.
