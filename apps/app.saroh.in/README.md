# app.saroh.in

The merchant workspace — the app a business actually works in. Every screen is
a session-authenticated client of `api.saroh.in`; this app holds no database
access of its own.

Dev port **3003** · package name `application` (`pnpm --filter application …`)

## What's here

The whole app sits behind an auth gate. [`middleware.ts`](middleware.ts) uses
`@saroh/auth`'s middleware to redirect anyone without an accounts session to
`accounts.saroh.in`, so there are no partly-public routes to reason about.

**Onboarding** (`/onboarding`) asks what the business needs to do and turns the
answers into selected capability modules.

**The shell** (`app/(shell)`) is everything else, grouped the way onboarding
phrased it rather than by internal entity names:

| Group     | Module key     | Routes                             |
| --------- | -------------- | ---------------------------------- |
| Sell      | `COMMERCE`     | `/commerce`, `/stores/…`           |
| Bookings  | `APPOINTMENTS` | `/bookings`, `/services`           |
| Customers | `CRM`          | `/contacts`, `/leads`, `/pipeline` |
| Website   | `WEBSITE`      | `/sites`                           |
| Insights  | `INSIGHTS`     | `/analytics`                       |
| _(core)_  | —              | `/`, `/notifications`, `/settings` |

Under a store: products and categories, orders, customers, content (posts and
post categories), members, and store settings.

[`components/shared/nav-items.tsx`](components/shared/nav-items.tsx) is the
single source of truth for the sidebar, mobile drawer and command menu, and
lists **only routes that exist** — `pnpm check:routes` fails the build on a nav
entry that would 404.

### Capability modules

Groups carrying a `moduleKey` render only when that module is available to the
actor (ADR-003). Settings and Notifications are core chrome and are never
module-gated — Settings → Modules is where a module gets switched on in the
first place. The server is the authority: [`lib/modules/`](lib/modules/) decodes
what the API returns and the Server Actions there forward the session cookie to
endpoints that enforce `module:manage`. Hiding a nav group is a usability aid,
not a permission.

### Settings

`/settings` covers **organization** configuration — org profile, modules,
per-project modules, payment providers. A user's own identity (name, email,
password, sessions) is deliberately not here; it lives at
`accounts.saroh.in/account`, which the header user menu links to.

## Local development

```bash
pnpm install
pnpm --filter application dev     # https://app.saroh.localhost
```

`api.saroh.in` and `accounts.saroh.in` must be running as well — this app
renders nothing useful without a session and an API to read.

## Environment

See [`env.ts`](env.ts) for the validated schema.

```dotenv
API_URL=https://api.saroh.localhost                # server-only; used by lib/**/service.ts
NEXT_PUBLIC_API_URL=https://api.saroh.localhost    # public fallback
NEXT_PUBLIC_ACCOUNTS_URL=https://accounts.saroh.localhost
NEXT_PUBLIC_BETTER_AUTH_URL=https://api.saroh.localhost
NEXT_PUBLIC_ROOT_DOMAIN=saroh.app.localhost        # where merchant subdomains live (saroh.app in prod)
# NGROK_URL=                                       # dev-only tunnel origin
```

`NEXT_PUBLIC_ROOT_DOMAIN` is `saroh.app`, **not** `saroh.in`. It is the same
variable `saroh.app` reads to resolve tenants, so the address this app shows a
merchant and the address the renderer actually serves cannot disagree.

## Data access

Server modules under `lib/<domain>/service.ts` forward the session cookie to
`api.saroh.in`; mutations go through Server Actions in the matching
`actions.ts`. Nothing in this app imports `@saroh/database` — ESLint forbids it
in frontends, and the API is the single authorization boundary.

## Verification

```bash
pnpm --filter application typecheck
pnpm --filter application lint
SKIP_ENV_VALIDATION=1 pnpm --filter application build
pnpm check:routes            # from the repo root — nav entries must resolve
```
