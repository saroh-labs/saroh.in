# Setting up and running Saroh

How to get the monorepo running on your machine. For what Saroh is, start at
the [README](README.md). The detail behind each step lives in
[`LOCAL_DEV.md`](docs/architecture/LOCAL_DEV.md) (why portless, seeded data,
throwaway databases) and [`ENVIRONMENT.md`](docs/architecture/ENVIRONMENT.md)
(every app's URL and every environment variable).

## What you need

- **Node >= 24** (developed on 24.14.0) and **pnpm >= 9.9** (9.9.0). Corepack or
  a matching pnpm install is recommended; Turborepo drives the tasks.
- **PostgreSQL** you can create databases on.
- A real terminal with **sudo** once, for the local HTTPS proxy.

## 1. Install

```bash
pnpm install
```

## 2. Configure the environment

```bash
cp .env.example .env    # then fill in real values
```

Each app may also read its own `apps/<app>/.env`. The values that matter most:

- `DATABASE_URL` — your development database.
- `BETTER_AUTH_SECRET` — must be **identical** in `api` and every app that
  validates sessions, or cross-app sign-in fails silently. It is read at
  import time, so running built output without it throws before it can say why.
- `BETTER_AUTH_TRUSTED_ORIGINS` — set it to the local origins in `.env.example`.
  Unset, it falls back to the production list and sign-in lands on the app
  launcher instead of the page you asked for.

All `.env*` files are gitignored; only `.env.example` is committed. **Never
commit a real `.env`.** If a credential is ever exposed, rotate it in the
provider's dashboard — deleting the file is not enough.

## 3. Build the Prisma client and the database

```bash
pnpm --filter @saroh/database build               # generates the client
pnpm --filter @saroh/database db:migrate:deploy   # applies every migration
```

`db:push` also works for a quick throwaway database, but it skips the migration
files, so it says nothing about whether a migration is correct.

## 4. Install the local HTTPS proxy (once per machine)

```bash
npm install -g portless && portless service install --wildcard
```

It asks for sudo once. Every app then answers at its production hostname with
`.localhost` appended — `https://app.saroh.localhost`, `https://api.saroh.localhost`
and so on — over HTTPS, the same shape as production.

**Never run an app on a bare port** (`next dev -p 3003`, `nest start` with a
`PORT`). The API's CORS allowlist refuses it and the session cookie is not
shared, so sign-in silently fails.

## 5. Run

```bash
pnpm dev                 # everything
pnpm dev:app             # api + accounts + workspace — the usual one
pnpm dev:apps            # api + accounts + workspace + admin + sites
pnpm dev:api-auth        # api + accounts
pnpm dev:admin           # api + accounts + admin
pnpm dev:sites           # api + merchant site renderer
pnpm dev:emails          # email preview at https://emails.saroh.localhost
pnpm portless:status     # is the proxy up?
pnpm portless:doctor     # diagnose routing, DNS and certificates
```

Also: `dev:api`, `dev:accounts`, `dev:web`, `dev:docs`, `dev:help`,
`dev:templates`, `dev:ui`. `pnpm dev` inside any app runs that app alone.

| App                  | Local                             |
| -------------------- | --------------------------------- |
| `app.saroh.in`       | https://app.saroh.localhost       |
| `accounts.saroh.in`  | https://accounts.saroh.localhost  |
| `api.saroh.in`       | https://api.saroh.localhost       |
| `admin.saroh.in`     | https://admin.saroh.localhost     |
| `saroh.app`          | https://saroh.app.localhost       |
| `templates.saroh.in` | https://templates.saroh.localhost |
| `ui.saroh.in`        | https://ui.saroh.localhost        |
| `docs.saroh.in`      | https://docs.saroh.localhost      |
| `help.saroh.in`      | https://help.saroh.localhost      |
| `saroh.in`           | https://saroh.localhost           |

A merchant's site hangs off the renderer: the seeded `northwind` site is
https://northwind.saroh.app.localhost. A draft preview is
`https://saroh.app.localhost/preview/<token>`.

## 6. Seed something to look at

```bash
pnpm --filter @saroh/database db:seed            # one demo business
pnpm --filter @saroh/database db:seed:showcase   # plus a gym, a yoga studio, a clinic and a design studio
pnpm --filter @saroh/database db:seed:reset      # removes both
```

Sign in as `demo@saroh.dev` / `demo-password-123`. The showcase gives the same
account a different role in each business, so one login shows the workspace as
an owner, an admin, a member and a reviewer — the full table is in
[`LOCAL_DEV.md`](docs/architecture/LOCAL_DEV.md#demo-accounts).

## Before you open a pull request

```bash
pnpm run lint && pnpm run typecheck
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
pnpm run check:routes && pnpm run check:blocks && pnpm run check:cycles
```

`TEST_DATABASE_URL` must point at a throwaway database whose name contains
`test`. Contribution terms are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Running your own copy

There is no step-by-step self-hosting guide yet. What it takes:

- **PostgreSQL**, with migrations applied by
  `pnpm --filter @saroh/database db:migrate:deploy` before a new API version
  serves traffic — and a backup first.
- **The API** as a container: from the repository root,
  `docker build -f apps/api.saroh.in/Dockerfile -t saroh-api .`. It reports
  readiness at `/health/ready`.
- **The Next.js apps** on any Node host (Saroh's own run on Vercel). At least
  `accounts`, `app` and `saroh.app` for a working business; the rest are
  optional.
- **The environment** for each, listed with what happens when a value is unset
  in [`ENVIRONMENT.md`](docs/architecture/ENVIRONMENT.md). Sessions are one
  cookie shared across subdomains, so the API, `accounts` and every signed-in
  app must sit under one parent domain. Merchant sites (`saroh.app`) sit on
  their own domain, reading the API server-to-server.

How Saroh's own API ships is in
[`devops-tooling-and-deploy.md`](docs/patterns/devops-tooling-and-deploy.md).

## When something goes wrong

[`DEV_LEARNINGS.md`](docs/architecture/DEV_LEARNINGS.md) records the non-obvious
failures this repository has already hit, with their causes and fixes.
