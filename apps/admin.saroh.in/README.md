# Saroh control plane

`admin.saroh.in` is Saroh's internal operations and governance app. It is not an
Organization workspace: every screen is backed by the API's platform-staff
guard and fixed role permissions.

## Current foundation

- Dashboard with platform-level aggregates
- Permission-aware navigation and read-only states
- Release controls for global and Organization feature flags
- Immutable platform audit ledger with filters and cursor pagination
- Visible staff roles and a warning when break-glass access is active

The API is the authorization authority. Hiding a link or disabling a button in
this app is only a usability aid; `/admin/*` permissions are enforced again by
`api.saroh.in`.

## Staff roles

| Role            | Intended responsibility                                 |
| --------------- | ------------------------------------------------------- |
| Platform Owner  | Full control-plane access                               |
| Support         | Organization support and time-bounded access sessions   |
| Operations      | Jobs, webhooks, providers, and incidents                |
| Billing         | Subscriptions and billing interventions                 |
| Release Manager | Feature rollout and release controls                    |
| Auditor         | Read-only platform, operations, staff, and audit access |

A staff member may hold multiple roles. The API resolves the union of their
active permissions on every request, so revocation and expiry take effect
without waiting for a cached session to expire.

## Local development

From the repository root:

```bash
pnpm install
pnpm --filter admin dev
```

The admin app runs at `http://localhost:3001` and expects:

```dotenv
NEXT_PUBLIC_ACCOUNTS_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3333
```

The API must also be running with the same Better Auth configuration and a
database containing the control-plane migration.

### First local administrator

`ADMIN_ALLOWLIST` is a break-glass bootstrap on the API, not the normal staff
directory. For local setup only, set it to an account you control, using a
non-production test address:

```dotenv
ADMIN_ALLOWLIST=operator@example.test
```

Sign in with that account through `accounts.saroh.in`. The API grants temporary
Platform Owner capabilities and the shell displays an amber break-glass banner.
Use recorded `PlatformAdmin` role assignments for normal environments, then
remove the bootstrap address. An unset or empty allowlist grants nobody access.

Never commit a real staff address, session cookie, password, or credential.

## Verification

```bash
pnpm --filter admin typecheck
pnpm --filter admin lint
SKIP_ENV_VALIDATION=1 pnpm --filter admin build
```

The full interaction map and representative screenshots live in
[`docs/prototypes/admin-control-plane-flow`](../../docs/prototypes/admin-control-plane-flow).
