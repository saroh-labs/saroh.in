# @saroh/auth

Shared authentication package for the Saroh.io monorepo, built on
[Better Auth](https://www.better-auth.com/).

The **Better Auth server** itself is hosted by the API (`apps/api.saroh.in`); this
package provides the single shared config plus the client- and server-side helpers
that every app consumes so there is exactly one auth surface across the monorepo.

## Exports

- **`@saroh/auth/server`** — the shared Better Auth server instance/config
  (`BETTER_AUTH_SECRET`, Prisma adapter). Owned by `api`; frontends don't import it.
- **`@saroh/auth/client`** — the browser `authClient` (`signIn`, `signOut`,
  `useSession`) that talks to the API cross-origin.
- **`@saroh/auth/middleware`** — Edge-safe Next.js middleware (cookie-presence /
  origin checks only, no DB access).
- **`@saroh/auth/next`** — `getServerSession()` for RSC/route handlers, which
  validates the session against the API over HTTP (no Prisma, no secret in the app).

`accounts.saroh.in` renders the auth UI; every other app authenticates against the
same session cookie, scoped to `.saroh.in` in production.
