# accounts.saroh.in

Auth app for Saroh: login, sign up, forgot password, and reset password. Uses [better-auth](https://better-auth.com) with email/password and GitHub OAuth.

## Features

- **Login** – Email/password and GitHub OAuth
- **Sign up** – Email, name, password
- **Forgot password** – Request reset link by email
- **Reset password** – Set new password via link (token from email)
- Cross-subdomain cookies (`.saroh.in`), rate limiting, and better-auth plugins (admin, organization, 2FA, etc.)

## Run locally

From repo root:

```bash
pnpm dev
# or run only this app (see package.json for port)
```

Set `NEXT_PUBLIC_ACCOUNTS_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` in env — that is the app's entire surface (see `env.ts`).

This app holds no database credentials and no OAuth secrets. It renders the auth UI and talks to Better Auth over HTTP against `api.saroh.in`, which is the only service that touches the database. `DATABASE_URL`, `BETTER_AUTH_SECRET`, and the `AUTH_GITHUB_*` / `AUTH_GOOGLE_*` pairs belong in `apps/api.saroh.in` only.

**Email (React Email + Nodemailer):** Password reset and verification emails use templates from `@saroh/emails` and are sent via Nodemailer when SMTP is configured. Set either:

- **Generic SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `EMAIL_FROM`, `SMTP_SECURE`
- **Gmail:** `USER_ACCOUNT`, `USER_PASSWORD`, and optionally `SENDER_EMAIL_ID` or `EMAIL_FROM`

If no SMTP env is set, reset/verification links are logged to the console instead of sent.
