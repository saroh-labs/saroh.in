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
  the API refuses regardless.
- **Every write is an `OperatorDialog`** (`components/operator-dialog.tsx`):
  it says what will change, asks for a reason, asks for the business's name for
  anything that takes one down, and mints one idempotency key per attempt.
  Bulk retries and replays use `BulkAction`, which always shows the dry run
  first.
- **Server-only modules stay server-only.** `lib/control-plane.ts` and the
  modules that read through it (`businesses`, `staff`, `people`, `machinery`,
  `waitlist`) import `next/headers`; a client component takes types from them,
  never values. Client-safe words live in `lib/roles.ts`, `lib/modules.ts`,
  `lib/format.ts`.
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
