# admin.saroh.in

Saroh's internal operations and governance app — the control plane. It is not an
Organization workspace: every screen is backed by the API's platform-staff guard
and its fixed role permissions.

Dev port **3001** · package name `admin` (`pnpm --filter admin …`)

## What's here

| Route    | Purpose                                                         |
| -------- | --------------------------------------------------------------- |
| `/`      | Dashboard of platform-level aggregates                          |
| `/flags` | Release controls for global and Organization feature flags      |
| `/audit` | Immutable platform audit ledger, with filters and cursor paging |

Plus permission-aware navigation with read-only states, the signed-in staff
member's visible roles, and an amber banner when break-glass access is what let
them in.

**The API is the authorization authority.** Hiding a link or disabling a button
here is only a usability aid; `/admin/*` permissions are enforced again by
`api.saroh.in`, where `PlatformAdminGuard` requires an active, non-revoked grant
and `PlatformPermissionGuard` fails closed. This app decides nothing about
access — it forwards the session cookie and renders whatever the API allows,
which is why [`env.ts`](env.ts) declares no server-only variables at all.

## Staff roles

| Role            | Intended responsibility                                 |
| --------------- | ------------------------------------------------------- |
| Platform Owner  | Full control-plane access                               |
| Support         | Organization support and time-bounded access sessions   |
| Operations      | Jobs, webhooks, providers, and incidents                |
| Billing         | Subscriptions and billing interventions                 |
| Release Manager | Feature rollout and release controls                    |
| Auditor         | Read-only platform, operations, staff, and audit access |

A staff member may hold several roles. The API resolves the union of their
active permissions on every request, so revocation and expiry take effect
without waiting for a cached session to expire.

## Local development

```bash
pnpm install
pnpm --filter admin dev      # http://localhost:3001
```

```dotenv
NEXT_PUBLIC_ACCOUNTS_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3333
```

The API must be running with the same Better Auth configuration and a database
that has the control-plane migration applied.

### First local administrator

`ADMIN_ALLOWLIST` is a break-glass bootstrap **on the API**, not the normal
staff directory. It used to be declared in this app's `env.ts` and described as
"the fail-closed admin gate", read by one local helper that nothing called —
which pointed anyone changing admin access at the wrong service. For local setup
only, set it on the API side to an account you control, using a non-production
test address:

```dotenv
ADMIN_ALLOWLIST=operator@example.test
```

Sign in with that account through `accounts.saroh.in`. The API grants temporary
Platform Owner capabilities and reports `viaBootstrap: true` from `/admin/me`,
which is what the amber break-glass banner renders from. Use recorded
`PlatformAdmin` role assignments for normal environments, then remove the
bootstrap address. An unset or empty allowlist grants nobody access.

Never commit a real staff address, session cookie, password, or credential.

## Verification

```bash
pnpm --filter admin typecheck
pnpm --filter admin lint
SKIP_ENV_VALIDATION=1 pnpm --filter admin build
```

The full interaction map and representative screenshots live in
[`docs/prototypes/admin-control-plane-flow`](../../docs/prototypes/admin-control-plane-flow).
