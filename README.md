# Saroh.io

Open-source, multi-tenant SaaS platform for creating **blogs, portfolios, and e-commerce storefronts**.

A pnpm + Turborepo monorepo: a set of Next.js apps and a NestJS API, all
authenticating against a single Better Auth identity provider.

> **Note:** an earlier version of this README described MySQL + NextAuth.
> That was stale. The real stack is **PostgreSQL + Prisma 7 + Better Auth**,
> documented below.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript 5, TailwindCSS 3, shadcn / Radix UI
- **Backend:** NestJS 11 (`apps/api.saroh.in`)
- **Database:** PostgreSQL (Neon) via **Prisma 7** with `@prisma/adapter-pg`
- **Auth:** **Better Auth 1.6.x** (central identity provider) — _not NextAuth_
- **Email:** React Email + Nodemailer (`@saroh/emails`)
- **Storage:** AWS S3 / S3-compatible (DigitalOcean Spaces)
- **Hosting:** Vercel
- **Tooling:** pnpm 9.9, Turborepo 2.9

## Architecture

Authentication is centralized: **`accounts.saroh.in`** is the single identity
provider (Better Auth). Every other app consumes the Better Auth session;
`api.saroh.in` validates sessions directly against the shared Postgres. In
production the session cookie is scoped to `.saroh.in` so it works across all
subdomains.

### Apps (`apps/*`) — 10 total

| App | Domain | Role |
|-----|--------|------|
| `accounts.saroh.in` | accounts.saroh.in | **Central auth** — login, signup, verification, password reset, OAuth |
| `api.saroh.in` | api.saroh.in | NestJS backend; validates Better Auth sessions against the shared DB |
| `app.saroh.in` | app.saroh.in | Main product dashboard (migrating off NextAuth → accounts session) |
| `admin.saroh.in` | admin.saroh.in | Platform admin (session-gated, allowlisted) |
| `sites.saroh.in` | sites.saroh.in, `*.saroh.site`, custom domains | Public renderer for user blogs / portfolios / stores |
| `templates.saroh.in` | templates.saroh.in | Showcase of available designs |
| `ui.saroh.in` | ui.saroh.in | Design-system / component showcase |
| `docs.saroh.in` | docs.saroh.in | Developer documentation (Nextra) |
| `help.saroh.in` | help.saroh.in | End-user help guides (Nextra) |
| `saroh.in` | saroh.in | Marketing site |

### Shared packages (`packages/*`)

- `@saroh/auth` — shared Better Auth config: server instance + browser client + Next.js middleware/session helpers
- `@saroh/database` — Prisma schema + client (`@prisma/adapter-pg`)
- `@saroh/ui` — shared UI components / design system
- `@saroh/emails` — React Email templates (verification, password reset, …)
- `@saroh/charts` — chart components
- `@saroh/utils` — shared utilities

Tooling lives in `tooling/*` (eslint config, tailwind config, tsconfig).

## Local setup

```bash
# 1. Install
pnpm install

# 2. Configure env — copy the template and fill in real values
cp .env.example .env
# (each app may also read its own apps/<app>/.env)

# 3. Generate the Prisma client + sync the schema to your dev database
pnpm --filter @saroh/database build
pnpm --filter @saroh/database db:push

# 4. Run apps (examples)
pnpm dev                 # everything
pnpm dev:api-auth        # api + accounts
pnpm dev:apps            # accounts + admin + sites
```

## Environment & secrets

- All `.env*` files are gitignored; only `.env.example` is committed. **Never
  commit a real `.env`.**
- If a real credential is ever exposed (e.g. a Neon `DATABASE_URL` pasted
  somewhere shared), **rotate it immediately** in the provider dashboard — do
  not just delete the file.
- `BETTER_AUTH_SECRET` must be **identical** across `accounts`, `api`, and any
  app that validates sessions, or cross-app login silently fails.

## Auth: NextAuth → Better Auth migration status

Better Auth is the target. Migration checklist:

- [x] `@saroh/auth` provides the shared Better Auth server config + browser client
- [x] `accounts.saroh.in` issues sessions (email/password + OAuth, verification, reset)
- [x] `api.saroh.in` validates sessions against the shared Postgres
- [x] `admin.saroh.in` gates on the accounts session
- [ ] `app.saroh.in` still uses NextAuth v4 — migrate to the accounts session (see `docs/plans/`)
- [ ] Remove the `next-auth` catalog entry once `app` is migrated
- [ ] Advanced Better Auth plugins (org, 2FA, OTP, API keys, admin roles) — later milestone

## License & contact

Educational/open-source. Contact: <mohit@saroh.io>.
