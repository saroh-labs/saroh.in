# admin.saroh.in — the operator console

The console an operator runs one Saroh instance from: its businesses, the
people in them, the operator's own team, releases, the waitlist and the
machinery behind it all. It talks to `api.saroh.in`'s `/admin/*` routes over
HTTP like every other frontend and decides nothing for itself — the API
authorizes, validates and records every read and write. The root `AGENTS.md`
still applies. Plan: `docs/plans/2026-09-23-001-feat-admin-console-plan.md`;
decision: DEC-021.

```bash
pnpm --filter admin dev        # under portless: https://admin.saroh.localhost
```

Signing in needs a staff grant or an address on the API's `ADMIN_ALLOWLIST`
(break-glass). A break-glass operator should grant themselves Platform owner on
`/team` so their own access is on the record.

## Rules that bite here

- **Every screen opens with `requireStaff(permission)`** (`lib/console.ts`)
  and hides what the operator cannot do with `can(...)`. That is a courtesy:
  the API refuses regardless. Staff refused a screen see "Not authorized"
  inside the shell, with the menu of what they can open; only someone who is
  not staff at all gets the bare page (`components/not-authorized.tsx`, #840).
- **Every write is an `OperatorDialog`** (`components/operator-dialog.tsx`):
  it says what will change, asks for a reason, asks for the business's name for
  anything that takes one down, and mints one idempotency key per attempt.
  Bulk retries and replays use `BulkAction`, which always shows the dry run
  first.
- **Deployments (`/deployments`, #886, DEC-107) are Platform Owners' only**,
  through `deployments:run`, which no other role carries. **Each console
  deploys only its own environment** (owner, 9 Oct): admin.saroh.io (dev
  API) deploys dev, admin.saroh.in (prod API) deploys production. The API
  decides, from its `SITE_DEPLOY_ENVIRONMENT`: it lists only that
  environment's rows and refuses a start for the other one (403, audited
  as DENIED); with none set it refuses every start (fail closed) and the
  page says why. The page shows one panel, a row per Cloudflare app, with
  the last successful deploy and the latest run, read from GitHub Actions
  (the API holds no Cloudflare read token, so the Worker's own
  `BUILD_FINGERPRINT` is not shown). Deploy is the one write without an
  `OperatorDialog` for dev: it starts at once (owner, 8 Oct). Production
  opens one that names the app and asks for its Worker's name
  (`saroh-web`), which the API checks too. The API starts
  `deploy-frontends.yml` with `SITE_DEPLOY_GITHUB_TOKEN`, rate-limits it per
  app and environment and per operator, and writes `deployment.start` to the
  audit trail for every start, and for every one refused for its
  environment, by the rate limit or by GitHub. A console deploy always
  builds; merges still deploy only what changed.
- **Server-only modules stay server-only.** `lib/control-plane.ts` and the
  modules that read through it (`businesses`, `staff`, `people`, `machinery`,
  `waitlist`, `deployments`, `usage`) import `next/headers`; a client component takes types from them,
  never values. Client-safe words live in `lib/roles.ts`, `lib/modules.ts`,
  `lib/format.ts`, `lib/deployment-words.ts`, `lib/usage-words.ts`.
- **Usage (`/usage`, #798)** lists every business by the storage its
  photos and videos use (READY media, in GB as the plan's `storageGb`
  counts it), sorted by the API across all businesses (Most / Least) and
  paged by number. It reads with `organization:read`, the directory's
  permission, so it adds none (DEC-039).
- **A business's details need a support session.** The session id lives in an
  httpOnly cookie per business (`accessCookieName`) and is sent as
  `x-admin-access-session`; without one the page shows the directory row and
  asks for a reason.
- **Dark by default, not following the system**, on the shared tokens. No
  accent is overridden — the console's Saffron is the base dark one.
- **`Badge` renders a `<div>`.** Never put one inside `<p>` or `<span>`; the
  hydration error it causes blanks nothing but costs a re-render.
- **Nav rows appear only for screens that exist** (`components/console-nav.tsx`),
  filtered by permission. The rail and drawer build it themselves from the
  permissions: a nav item carries its icon, which cannot cross to a client
  component.

## Read first

| When you are about to…                         | Read                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Add a screen or an `/admin` endpoint behind it | `docs/patterns/backend-auth-and-access.md` (cross-tenant reads) |
| Add a staff permission or change a role        | `apps/api.saroh.in/src/modules/admin/admin-permissions.ts`      |
| Style anything                                 | `docs/patterns/frontend-design-system.md`                       |
| Call a change done                             | `docs/patterns/frontend-verification.md`                        |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
