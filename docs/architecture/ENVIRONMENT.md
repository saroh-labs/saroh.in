# Environment variables

This is the single reference for **which environment variables each app needs**
and **what happens when an optional one is absent**. The guiding rule:

> A fresh clone boots locally with **exactly one** variable set — `DATABASE_URL`
> on `api.saroh.in`. Everything else is optional and degrades gracefully.

Validation is typed (zod on the api, `@t3-oss/env-nextjs` on the Next apps).
An unset variable and an empty string are treated identically. Set
`SKIP_ENV_VALIDATION=1` to bypass validation entirely (e.g. for a Docker build
step that has no secrets).

---

## The one prerequisite

| Variable       | App          | Why it is required                                                                                      |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | api.saroh.in | The whole platform is backed by one Postgres; nothing serves a request without it. Must be a valid URL. |

That is the **only** hard requirement to boot the stack in development.

---

## api.saroh.in

**Required:** `DATABASE_URL`.

**Required in production only** (dev/test fall back automatically):

| Variable             | Absent in dev/test →                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Uses a fixed, **insecure dev fallback** (with a warning) so sessions still validate locally. **Mandatory in production** — boot throws without it. Must be byte-identical across the api and every session-validating app. |

**Optional** (each has a safe fallback — the api boots and runs without them):

| Group                | Variables                                                                                                                                                                          | Absent →                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth URLs            | `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`                                                                                                                                   | Trusted origins default to the built-in `*.saroh.in` list; base URL inferred.                                                                                                                                        |
| OAuth                | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                                                                     | Social login buttons are inert; **email + password login works**.                                                                                                                                                    |
| CORS/links           | `CORS_ORIGIN`, `APP_URL`                                                                                                                                                           | CORS uses the trusted-origins list + localhost; links use `https://app.saroh.in`.                                                                                                                                    |
| Storage              | `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`                                                                                       | Media uploads use the **in-memory adapter** (network-free); nothing persists off-process.                                                                                                                            |
| Email                | `EMAIL_FROM`/`SENDER_EMAIL_ID`, `SMTP_HOST`/`SMTP_HOSTNAME`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `USER_ACCOUNT`, `USER_PASSWORD`                                 | Email is **logged to the console** instead of sent (verification/reset/notify still visible).                                                                                                                        |
| Merchant payments    | `PAYMENTS_ENC_KEY`                                                                                                                                                                 | Payments boot fine; the crypto module validates the key **at use time** (first en/decrypt) and throws a clear error only if you actually try to connect a provider. A 32-byte key as base64 or 64-hex. Never logged. |
| Saroh billing (SaaS) | `SAROH_RAZORPAY_KEY_ID`, `SAROH_RAZORPAY_KEY_SECRET`, `SAROH_RAZORPAY_WEBHOOK_SECRET`, `SAROH_CASHFREE_CLIENT_ID`, `SAROH_CASHFREE_CLIENT_SECRET`, `SAROH_CASHFREE_WEBHOOK_SECRET` | Free plan + entitlements work; a paid subscribe/webhook only needs the provider you actually use. Read at use time, never at boot. Kept separate from merchant `PAYMENTS_ENC_KEY`.                                   |
| Analytics            | `ANALYTICS_IP_SALT`                                                                                                                                                                | Uses a fixed dev salt for the visitor hash (fine for local; set a real salt in production).                                                                                                                          |
| Job worker           | `JOB_WORKER_POLL_MS`, `JOB_WORKER_BATCH`, `JOB_VISIBILITY_MS`                                                                                                                      | Sensible defaults (2s poll, batch 10, 5-min visibility). Poll loop is off under `NODE_ENV=test`.                                                                                                                     |
| RLS                  | `RLS_ENFORCEMENT`                                                                                                                                                                  | Off. When `on`/`1`/`true`, the `prisma` proxy sets the per-request org GUC so Postgres RLS enforces tenant isolation (defense-in-depth). Needs the non-BYPASSRLS DB role to bite — see `RLS_ROLLOUT_AND_OPS.md`.     |
| Modules              | `MODULE_ENFORCEMENT`                                                                                                                                                               | Off. When `1`/`true`, `ModuleEnforcementGuard` refuses `@RequireModule` endpoints whose capability module isn't available (ADR-003). Dark by default; runtime kill-switch — see `runbooks/MODULE_ROLLOUT.md`.        |
| Misc                 | `NODE_ENV`, `PORT`                                                                                                                                                                 | Default `development`, `3333`.                                                                                                                                                                                       |

## The Next.js apps

`app.saroh.in`, `accounts.saroh.in`, `admin.saroh.in`, `sites.saroh.in`,
`saroh.in`, `docs.saroh.in`, `help.saroh.in`, `templates.saroh.in`,
`ui.saroh.in` — **every env var is optional.** They boot with zero configuration
and fall back to the production `*.saroh.in` URLs baked into the code.

Common optional overrides (point a frontend at a local api instead of prod):

| Variable                                                         | App(s)               | Absent →                                 |
| ---------------------------------------------------------------- | -------------------- | ---------------------------------------- |
| `API_URL` / `NEXT_PUBLIC_API_URL`                                | app, sites           | Defaults to `https://api.saroh.in`.      |
| `NEXT_PUBLIC_ACCOUNTS_URL`                                       | app, accounts, admin | Defaults to `https://accounts.saroh.in`. |
| `NEXT_PUBLIC_BETTER_AUTH_URL`                                    | app, accounts        | Defaults to the canonical auth host.     |
| `ADMIN_ALLOWLIST`                                                | admin                | No extra admin allowlist applied.        |
| `NEXT_PUBLIC_ROOT_DOMAIN`, `REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS` | sites                | Sensible built-in defaults.              |

## Local quick start

```bash
# 1. The only required variable:
echo 'DATABASE_URL="postgres://…"' > packages/database/.env

# 2. (optional) point the app at a local api instead of prod:
echo 'API_URL="http://localhost:3333"' > apps/app.saroh.in/.env.local

# 3. run — no auth secret, OAuth, SMTP, storage, or payment keys needed
pnpm dev
```

Production requires, at minimum: `DATABASE_URL` **and** `BETTER_AUTH_SECRET`
(the same value everywhere), plus whichever provider keys you actually use.
