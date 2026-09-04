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

`app.saroh.in`, `accounts.saroh.in`, `admin.saroh.in`, `saroh.app`,
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

## Local URLs

Every app runs at its production hostname with `.localhost` appended, served
over HTTPS by [portless](https://github.com/vercel-labs/portless), a root
devDependency. Each app names itself in the `portless` field of its
package.json — the one place portless reads whether Turborepo starts the app
from its own directory or `portless` starts them all from the root. There are
no port numbers to remember, and host parsing — tenant subdomains, cookies,
CORS — works the same way as in production.

| Production           | Development                            |
| -------------------- | -------------------------------------- |
| saroh.in             | https://saroh.localhost                |
| app.saroh.in         | https://app.saroh.localhost            |
| accounts.saroh.in    | https://accounts.saroh.localhost       |
| api.saroh.in         | https://api.saroh.localhost            |
| admin.saroh.in       | https://admin.saroh.localhost          |
| docs.saroh.in        | https://docs.saroh.localhost           |
| help.saroh.in        | https://help.saroh.localhost           |
| templates.saroh.in   | https://templates.saroh.localhost      |
| ui.saroh.in          | https://ui.saroh.localhost             |
| `<tenant>`.saroh.app | https://`<tenant>`.saroh.app.localhost |

One-time setup on a fresh machine, in a real terminal (the proxy binds port
443, so it prompts for your password):

```bash
npm install -g portless                   # the service must run from here, not the repo
portless service install --wildcard       # generates and trusts a local CA; starts at login
```

The service runs as root, and macOS does not let a root daemon read your
Desktop, Documents or Downloads folders — so a service installed from a
checkout in one of those crash-loops with `EPERM` on `cli.js`. The global
install lives under your Node prefix, which root can read. `portless doctor`
reports the proxy's state; `~/.portless/service.log` has the reason if it is
not running.

`--wildcard` is what lets an unregistered subdomain such as
`northwind.saroh.app.localhost` reach the renderer. Each app's `dev` script is
`portless`, which runs its `dev:app` script through the proxy with a `PORT` of
its own; `pnpm run dev:app` still works on a bare port for anyone without the
proxy. Adding an app means adding the two scripts and the `portless` field.

## Local quick start

```bash
# 1. The only required variable:
echo 'DATABASE_URL="postgres://…"' > packages/database/.env

# 2. (optional) point the app at a local api instead of prod:
echo 'API_URL="https://api.saroh.localhost"' > apps/app.saroh.in/.env.local

# 3. run — no auth secret, OAuth, SMTP, storage, or payment keys needed
pnpm dev
```

Production requires, at minimum: `DATABASE_URL` **and** `BETTER_AUTH_SECRET`
(the same value everywhere), plus whichever provider keys you actually use.
