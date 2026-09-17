# api.saroh.in

The NestJS API: it hosts Better Auth and is the **only** service that reads or
writes the database (`@saroh/database`, Prisma). Every other app reaches data
through it. The root `AGENTS.md` still applies.

```bash
pnpm dev:api                                        # under portless: https://api.saroh.localhost
pnpm --filter @saroh/api test:unit
TEST_DATABASE_URL=... pnpm --filter @saroh/api test:int
```

## Rules that bite here

- **Read env through `src/env.ts`, never `process.env`.** Under
  `SKIP_ENV_VALIDATION` it returns `process.env` untouched, so schema
  **defaults** vanish too (`PORT` binds a random port) — anywhere without a
  `.env` (CI, containers) pass every value explicitly.
  `docs/patterns/devops-environments-and-flags.md`.
- **Every tenant-owned read and write is scoped to the Organization** from the
  request context, never to an id the caller sent.
  `docs/patterns/backend-auth-and-access.md`.
- **The integration suite builds its schema with `prisma db push`** and never
  runs a migration file — a green `test:int` says nothing about a migration.
  `.agents/skills/saroh-migrations/SKILL.md`.
- **Deploys are CI's job**: `.github/workflows/deploy-api.yml` builds and rolls
  out the image. Never commit host names, addresses or credentials for it.
  `docs/patterns/devops-tooling-and-deploy.md`.

## Read first

| When you are about to…                                | Read                                       |
| ----------------------------------------------------- | ------------------------------------------ |
| Add or change a module, controller, service or DTO    | `docs/patterns/backend-nestjs.md`          |
| Touch roles, organization context or capability gates | `docs/patterns/backend-auth-and-access.md` |
| Change the schema or store money                      | `docs/patterns/backend-data-and-money.md`  |
| Enqueue or handle a background job                    | `docs/patterns/backend-jobs.md`            |
| Call a provider or receive a webhook                  | `docs/patterns/backend-integrations.md`    |
| Add logging, a health check or a degraded path        | `docs/patterns/devops-observability.md`    |
