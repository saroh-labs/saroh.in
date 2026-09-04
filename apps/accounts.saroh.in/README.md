# accounts.saroh.in

Saroh's identity app: sign in, sign up, email verification, password reset, and
the user's own account settings. It is the **UI** for Better Auth — the auth
server itself runs in `api.saroh.in`.

Dev port **3000** · package name `auth` (`pnpm --filter auth …`)

## What's here

| Route              | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `/login`           | Email/password + GitHub and Google OAuth                  |
| `/signup`          | Name, email, password                                     |
| `/verify-email`    | Code-based verification (Better Auth `emailOTP` plugin)   |
| `/forgot-password` | Request a reset link by email                             |
| `/reset-password`  | Set a new password from the emailed token                 |
| `/account`         | Profile, change email, change password, sessions, delete  |
| `/apps`            | Chooser that hands a signed-in user off to the other apps |

`/account` acts on the **session user only**, never on an id from the URL. It
lives here rather than in `app.saroh.in` because this app is the single identity
provider — the product apps link to it from their user menu instead of
duplicating it. Organization-level configuration is the other half of that
split and belongs in `app.saroh.in/settings`.

## Local development

```bash
pnpm install
pnpm --filter auth dev        # https://accounts.saroh.localhost
```

`api.saroh.in` must be running too — this app has no auth server of its own.
`pnpm dev:api-auth` from the repo root starts both.

## Environment

Every variable is client-exposed and optional; see [`env.ts`](env.ts) for the
validated schema.

```dotenv
NEXT_PUBLIC_ACCOUNTS_URL=https://accounts.saroh.localhost  # this app's own origin
NEXT_PUBLIC_BETTER_AUTH_URL=https://api.saroh.localhost    # api origin (the auth server)
NEXT_PUBLIC_APP_URL=https://app.saroh.localhost            # where a verified user lands
# Which first-party origins may be RETURNED TO after sign-in (#222), and are
# trusted for CSRF. Unset falls back to the *.saroh.in list in @saroh/auth —
# correct in production, wrong in development, where a `?redirect=` to
# app.saroh.localhost would be refused and the visitor sent to the launcher.
BETTER_AUTH_TRUSTED_ORIGINS=https://accounts.saroh.localhost,https://admin.saroh.localhost,https://app.saroh.localhost
```

`NEXT_PUBLIC_APP_URL` may be omitted — [`lib/app-urls.ts`](lib/app-urls.ts)
falls back to the standard dev and production origins, so a fresh clone needs
no extra config.

## What this app must never hold

No database credentials and no OAuth secrets. It renders the auth UI and talks
to Better Auth over HTTP against `api.saroh.in`, the only service that touches
the database. `DATABASE_URL`, `BETTER_AUTH_SECRET`, and the `AUTH_GITHUB_*` /
`AUTH_GOOGLE_*` pairs belong in `apps/api.saroh.in` only.

Outbound email (verification, password reset) is likewise sent by the API using
`@saroh/emails` templates over Nodemailer — the SMTP settings live there, not
here. With no SMTP configured, the API logs the links to its console instead.

## Verification

```bash
pnpm --filter auth typecheck
pnpm --filter auth lint
SKIP_ENV_VALIDATION=1 pnpm --filter auth build
```
