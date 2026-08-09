# api.saroh.in

The single backend. A NestJS modular monolith that **hosts Better Auth** and
owns **all** database access — every frontend in this repo is a thin,
session-authenticated HTTP client of this service and none of them import
`@saroh/database`.

Dev port **3333** · package name `@saroh/api` (`pnpm --filter @saroh/api …`)

- **Framework:** NestJS 11, TypeScript, CommonJS
- **Database:** PostgreSQL via `@saroh/database` (Prisma 7 + `@prisma/adapter-pg`)
- **Auth:** Better Auth 1.6.x, mounted at `/api/auth/*` by `@thallesp/nestjs-better-auth`
- **Validation:** `class-validator` DTOs (global `ValidationPipe`) and zod at the env boundary
- **Storage:** `@saroh/object-storage` (S3-compatible), with an in-memory adapter when unconfigured
- **Email:** Nodemailer + `@saroh/emails` React Email templates

There is no OpenAPI/Swagger surface yet.

## Bootstrap order matters

[`src/main.ts`](src/main.ts) opens with a bare `import "./env"` above the sorted
import block, and it must stay that way. `@saroh/database` builds its Postgres
adapter at module scope from `process.env.DATABASE_URL`; if `./app.module` were
evaluated first, dotenv would not have run yet and node-postgres would silently
fall back to `localhost:5432`. A bare side-effect import is not pulled into the
alphabetised block, so the formatter cannot reorder it.

The same file installs process guards: an `unhandledRejection` is logged and
**not** fatal (these are overwhelmingly transient I/O — a dropped Neon socket, a
timed-out rollback — and the process can still serve traffic), while an
`uncaughtException` logs and exits non-zero for a supervisor to restart.

## Request pipeline

Applied globally, in order:

1. `correlationIdMiddleware` — first, so every request (including the mounted
   Better Auth handler) is traceable through its logs and error envelope
2. `helmet()`
3. Credentialed CORS — the `*.saroh.in` trusted origins plus `localhost:3000–3012`
   in dev, or `CORS_ORIGIN` when set. Never `*` with credentials
4. `ValidationPipe` — `whitelist`, `forbidNonWhitelisted`, `transform`
5. `OriginGuard` — app-layer CSRF check on unsafe methods for authenticated
   routes; public, webhook and Better Auth routes are exempt inside the guard
6. `OrgRlsInterceptor` → `LoggingInterceptor` — the RLS interceptor is outermost
   so handler DB work runs inside the per-request org context (a no-op unless
   RLS enforcement is on); then one structured log line per request
7. `AllExceptionsFilter` — one consistent error envelope

Body parsing is disabled at `NestFactory.create` because Better Auth needs the
raw body, then re-added in `AppModule` for the other routes with `rawBody: true`
— the public webhook endpoint HMAC-verifies provider signatures against those
exact bytes, which re-serialised JSON would not match.

## Authorization

Guards are applied per route, not globally:

| Guard                     | Enforces                                                            |
| ------------------------- | ------------------------------------------------------------------- |
| `BetterAuthGuard`         | An authenticated Saroh session                                      |
| `OrganizationGuard`       | Membership in the org the request is scoped to                      |
| `PlatformAdminGuard`      | Active, unexpired **platform staff** role (never org membership)    |
| `PlatformPermissionGuard` | The specific permission an `/admin` endpoint declares; fails closed |

Handler context comes from `@CurrentUser`, `@OrgContext`, `@PlatformAdminContext`,
`@RequireAdminPermission` and `@IdentityOnly` in
[`src/common/decorators/`](src/common/decorators/).

### Internal control plane (`/admin/*`)

Every `/admin` route stacks all three of `BetterAuthGuard` →
`PlatformAdminGuard` → `PlatformPermissionGuard`. Organization membership never
grants platform access. The fixed staff roles are `PLATFORM_OWNER`, `SUPPORT`,
`OPERATIONS`, `BILLING`, `RELEASE_MANAGER` and `AUDITOR`; their closed
permission vocabulary lives in
[`src/modules/admin/admin-permissions.ts`](src/modules/admin/admin-permissions.ts).

Feature-flag commands require a reason and an idempotency key. The flag change,
the domain `FeatureFlagAudit` row and the global `AdminAuditEvent` row commit in
one transaction — if the audit write fails, the operational change rolls back.
Audit metadata rejects secret-bearing keys recursively.

**Break-glass bootstrap.** `ADMIN_ALLOWLIST` is the recovery path for the first
administrator, or for a total lockout. A matching authenticated account receives
Platform Owner permissions, the use is logged at warning level, and `/admin/me`
reports `viaBootstrap: true` (which is what the amber banner in
`admin.saroh.in` renders from). Unset or empty means nobody. Normal staff access
is an active `PlatformAdmin` row with at least one active
`PlatformAdminRoleAssignment`; assignment and revocation are append-only.

For local development use a non-production address:

```dotenv
ADMIN_ALLOWLIST=operator@example.test
```

## Modules

38 feature modules under [`src/modules/`](src/modules/), wired in
[`app.module.ts`](src/app.module.ts):

- **Platform:** `health`, `admin`, `feature-flags`, `audit`, `jobs`,
  `provider-health`, `self-test`, `webhooks`
- **Tenancy:** `organizations`, `projects`, `capabilities` (modular
  capabilities, ADR-003), `stores`, `members`
- **Commerce:** `products`, `categories`, `orders`, `customers`, `payments`,
  `billing`
- **CRM:** `contacts`, `leads`, `pipelines`, `enquiry`, `forms`, `communications`,
  `automations`, `notifications`
- **Bookings:** `bookings` (plus a public controller for unauthenticated booking)
- **Web:** `sites`, `domains`, `content`, `media` — including the public read
  API that `saroh.app` renders publication snapshots from
- **Other:** `analytics`, `search`, `saved-views`, `home`, `customer-workspace`,
  `waitlist`

Public, unauthenticated controllers are named as such
(`public-sites`, `public-bookings`, `public-payments`) so the auth boundary is
visible in the filename.

## Local development

```bash
pnpm install
pnpm --filter @saroh/database build      # generate the Prisma client first
pnpm --filter @saroh/api dev             # http://localhost:3333, watch mode
```

```bash
pnpm --filter @saroh/api build
pnpm --filter @saroh/api start           # node dist/main
```

### Migrations

```bash
pnpm --filter @saroh/database db:push            # dev: sync schema
DATABASE_URL=postgresql://… \
  pnpm --filter @saroh/database db:migrate:deploy  # deploy migrations
```

Deploy migrations **before** shipping API code that depends on them.

## Testing

Two Jest projects, split by whether they need a database:

```bash
pnpm --filter @saroh/api test        # UNIT — zero database, safe anywhere
pnpm --filter @saroh/api test:int    # INTEGRATION — needs TEST_DATABASE_URL
pnpm --filter @saroh/api test:cov
```

The unit project ([`jest.config.js`](jest.config.js)) runs the pure specs —
mocked Prisma, no network — and is what CI and a fresh clone can always run.
The integration project ([`jest.integration.config.js`](jest.integration.config.js))
runs DB-backed specs serially against a **dedicated** test database: it
`db push --force-reset`s the schema in `globalSetup` and truncates between
files.

There is no fallback to `DATABASE_URL`. `test/db-guard.ts` refuses to run unless
`TEST_DATABASE_URL` is set, its database name contains `test`, and it differs
from `DATABASE_URL` — so the tests cannot reach the dev or production database.
Copy [`.env.test.example`](.env.test.example) and point it at a throwaway
Postgres:

```bash
docker run -d --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

`src/modules/e2e/first-journey.e2e.spec.ts` walks the whole signup → org →
first-value journey through the real stack.

## Environment

[`src/env.ts`](src/env.ts) validates everything with zod at import time, before
Nest bootstraps. A missing or invalid variable throws with the exact list of
what is wrong. (`@t3-oss/env-core` is ESM-only and does not resolve cleanly from
this CommonJS app, so the contract is reimplemented here — empty strings become
`undefined`, same as the Next apps' `@t3-oss/env-nextjs` setup.)

### Required

| Variable       | Notes                                                         |
| -------------- | ------------------------------------------------------------- |
| `DATABASE_URL` | The one true prerequisite — no request is servable without it |

### Auth

`BETTER_AUTH_SECRET` is required in production and optional elsewhere; in
dev/test `@saroh/auth` supplies a fixed insecure fallback with a warning, so a
fresh clone boots on `DATABASE_URL` alone. In any shared environment it must be
**byte-identical** across the API and every session-validating app, or session
checks silently fail. `BETTER_AUTH_URL` is this service's own origin;
`BETTER_AUTH_TRUSTED_ORIGINS` overrides the default `*.saroh.in` allowlist.

### Optional

- `PORT` (default 3333), `NODE_ENV`, `CORS_ORIGIN`, `APP_URL` (base for
  invitation links in email)
- `AUTH_GITHUB_ID/SECRET`, `AUTH_GOOGLE_ID/SECRET` — email/password works
  without them
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_PUBLIC_BASE_URL` — absent, the media module uses the network-free
  in-memory adapter
- `EMAIL_FROM`, `SMTP_*` (legacy `SENDER_EMAIL_ID`, `SMTP_HOSTNAME`,
  `USER_ACCOUNT`, `USER_PASSWORD` still honoured as fallbacks)
- `PAYMENTS_ENC_KEY` — 32-byte AES-256-GCM key (base64 or 64-hex) for merchant
  credential encryption at rest. Optional in the schema so dev boots without
  payments; validated **at use time** and never logged
- `JOB_WORKER_POLL_MS`, `JOB_WORKER_BATCH`, `JOB_VISIBILITY_MS` — the durable
  job outbox worker. The poll loop is disabled under `NODE_ENV=test` regardless
- `ADMIN_ALLOWLIST` — break-glass only, see above
- `SKIP_ENV_VALIDATION=1` — for builds with no runtime secrets

Set `SKIP_ENV_VALIDATION=1` to build an image without real values.

## Code style

ESLint (`@saroh/eslint-config`), Prettier with `organize-imports`, and
Husky + lint-staged on commit.

```bash
pnpm --filter @saroh/api lint --fix
pnpm --filter @saroh/api format
pnpm --filter @saroh/api typecheck
```

## Related

- [Root README](../../README.md) — monorepo overview
- [`docs/architecture/`](../../docs/architecture/) — decisions, target
  architecture, roadmap and risk register
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
