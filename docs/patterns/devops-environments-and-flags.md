# Environments and feature flags

> **Read when:** adding an environment variable, comparing against an
> environment, or adding or removing a feature flag.
> Adapted from claude-patterns `devops/02-environments-and-flags.md`. Every
> variable and its local value: `docs/architecture/ENVIRONMENT.md`.

## Environment variables

- **Typed, validated modules only.** Next apps use `env.ts` with
  `@t3-oss/env-nextjs`; the API uses `src/env.ts` with zod. Never read
  `process.env` in an app — the shared ESLint config's `restrictEnvAccess`
  rejects it outside `env.ts`.
- **`NEXT_PUBLIC_*` is compiled into the browser bundle.** Never put a secret
  under that prefix.
- **`SKIP_ENV_VALIDATION` drops the defaults too.** The API's `PORT` default
  never applies under it; pass every value explicitly wherever there is no
  `.env` (CI, containers).
- Document every variable in the relevant `.env.example`.

## Environment checks are allowlists

`NODE_ENV` is `development`, `test` or `production`. Compare with `===` against
the environment that _enables_ something:

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

- Keys live in `apps/api.saroh.in/src/modules/feature-flags/flags.ts`
  (`FlagKey`), are evaluated by `FeatureFlagService`, and are managed in
  `admin.saroh.in` → Flags. A flag with no configuration has never been
  configured, which is not the same as disabled.
- **Flags are Saroh's rollout switch** — not what a plan permits
  (entitlements) and not what an Organization has chosen (modules). ADR-003.
- **The server half is the flag.** A frontend flag hides a feature; only the API
  flag keeps it private.
- **Enforcement switches start dark.** `MODULE_ENFORCEMENT` and
  `RLS_ENFORCEMENT` turn enforcement on; follow
  `docs/architecture/runbooks/MODULE_ROLLOUT.md` and
  `docs/architecture/RLS_ROLLOUT_AND_OPS.md`.
- **Give every flag a deletion plan and a count of its readers,** written where
  the flag is declared, so whoever removes it knows how many places to find.
