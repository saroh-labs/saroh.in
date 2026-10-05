# Environments and feature flags

> **Read when:** adding an environment variable, comparing against an
> environment, or adding or removing a feature flag.
> Adapted from claude-patterns `devops/02-environments-and-flags.md`. Every
> variable and its local value: `docs/architecture/ENVIRONMENT.md`.

## Environment variables

- **Current** — **Typed, validated modules only.** Next apps use `env.ts` with
  `@t3-oss/env-nextjs`; the API uses `src/env.ts` with zod. Never read
  `process.env` in an app — the shared ESLint config's `restrictEnvAccess`
  rejects it outside `env.ts`.
- **Current** — **`NEXT_PUBLIC_*` is compiled into the browser bundle.** No
  secret sits under that prefix.
- **Current** — **`SKIP_ENV_VALIDATION` drops the defaults too.** The API's
  `PORT` default never applies under it; pass every value explicitly wherever
  there is no `.env` (CI, containers).
- **Adopted** — **Document every variable in the relevant `.env.example`.** Gap:
  `JOB_VISIBILITY_MS`, `JOB_WORKER_BATCH`, `JOB_WORKER_POLL_MS` and
  `PAYMENTS_ENC_KEY` are validated by the API and missing from its examples.

## A missing production variable fails loudly — **Current**

A fallback to a production address hides a missing variable: the deployment
works, against whatever the code assumed. On 5 Oct 2026 that dropped every
waitlist join for two days (DEV_LEARNINGS). So:

- **The API** requires, at boot, every variable a deployed instance can't do
  without (`REQUIRED_IN_PRODUCTION` in `apps/api.saroh.in/src/env.ts`:
  `RENDERER_URL`, `APP_URL`, `EMAIL_FROM`). Add a variable there when its
  fallback would send customers or staff to the wrong place.
- **Each Vercel app's `next.config`** refuses a `VERCEL_ENV=production` build
  without the addresses it talks to, and names them. Previews keep their
  fallbacks on purpose (plan 2026-10-05-001 KTD-3).
- **One resolver per address per app** (`rendererBase()`, `appBase()`,
  `serverApiUrl()`/`publicApiUrl()`), never a fallback repeated at each call.
- **A provider's environment is one switch on the API** (`CASHFREE_ENV`), sent
  to the browser with the checkout, so server and client can't disagree.
- Turbo passes only declared variables to builds: a variable a guard requires
  must be in `turbo.json`.

## Environment checks are allowlists — **Current**

`NODE_ENV` is `development`, `test` or `production`, and the repo compares with
`===` against the environment that _enables_ something:

```ts
if (env.NODE_ENV === "development") enableDangerousThing(); // right
if (env.NODE_ENV !== "production") enableDangerousThing(); // wrong
```

The second form enables it in every other environment, a misspelled one
included, and reads as correct in review. A gate may fail open only where that
is harmless, and should say so: `packages/database/src/client.ts` caches the
Prisma client on `globalThis` when `NODE_ENV !== "production"`, which is
hot-reload hygiene and protects nothing.

## Feature flags

- **Current** — Keys live in
  `apps/api.saroh.in/src/modules/feature-flags/flags.ts` (`FlagKey`), are
  evaluated by `FeatureFlagService`, are stored with overrides and an audit trail
  (`FeatureFlag`, `FeatureFlagOverride`, `FeatureFlagAudit`), and are managed in
  `admin.saroh.in` → Flags. A flag with no configuration has never been
  configured, which is not the same as disabled.
- **Current** — **Flags are Saroh's rollout switch** — not what a plan permits
  (entitlements) and not what an Organization has chosen (modules). ADR-003.
- **Current** — **The server half is the flag.** A frontend flag hides a feature;
  only the API flag keeps it private.
- **Current** — **Module rollout flags (`MODULE_*`) default off,** and nothing
  seeds their rows — insert them to see a module in a dev database.
- **Current** — **Enforcement switches start dark.** `MODULE_ENFORCEMENT` and
  `RLS_ENFORCEMENT` turn enforcement on; follow
  `docs/architecture/runbooks/MODULE_ROLLOUT.md` and
  `docs/architecture/RLS_ROLLOUT_AND_OPS.md`.
- **Adopted** — **Every flag has a deletion plan and a count of its readers,**
  written where it is declared. Gap: none of the keys in `flags.ts` has one.
