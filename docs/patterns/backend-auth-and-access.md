# Authentication and access

> **Read when:** touching sign-in, sessions, organization context, roles,
> capability gates, entitlements or staff access.
> Adapted from claude-patterns `backend/04-auth-and-access.md`. Background:
> `docs/AUTHENTICATION_ARCHITECTURE.md`.

## Who decides what

| Question                             | Decided by                      | Where                                                        |
| ------------------------------------ | ------------------------------- | ------------------------------------------------------------ |
| Is this a signed-in user?            | Better Auth, running in the API | `BetterAuthGuard`; the cookie is scoped to the parent domain |
| Which organization, with which role? | The API, from the session       | `OrganizationGuard` → `OrganizationContextService`           |
| May this role take this action?      | Policy                          | `authorize(ctx, action)` in `organization-policy.ts`         |
| Is the capability switched on?       | The API                         | `ModuleEnforcementGuard` and `@RequireModule` (ADR-003)      |
| Does the plan allow it?              | Entitlements                    | `EntitlementService` (`check`, `can`)                        |
| Is this person Saroh staff?          | The API                         | `PlatformAdminGuard`, `PlatformPermissionGuard`              |

The frontends, `admin.saroh.in` included, decide none of these. They render
what the API allows.

## Rules

- **Derive the organization; never accept it.** `:organizationId` or
  `x-organization-id` is a hint the guard re-validates against real membership.
  Public routes derive the organization from the resource (a Site), never from
  the request.
- **Cross-tenant lookups are 404.** A 403 confirms that the row exists. Use 403
  for a known resource the caller may not act on: a role denial, a plan
  entitlement, an invitation sent to someone else.
- **Gate on the server first.** A hidden nav item is a usability aid.
  `ModuleEnforcementGuard` stays dark until `MODULE_ENFORCEMENT` is set, and
  `module-annotations.spec.ts` pins which routes are gated and which must never
  be (refunds, consent withdrawal, public checkout, published sites, webhooks).
- **Three control planes, never conflated** (ADR-003): feature flags are Saroh's
  rollout, entitlements are what a plan permits, modules are what an
  Organization has chosen.
- **Frontend session reads keep "signed out" and "could not check" apart.** Edge
  middleware checks cookie presence only (`@saroh/auth/middleware`); Server
  Components use `requireSession()`, and only a 401/403 redirects
  (`frontend-error-feedback.md`).
- **Frontends import a specific auth entry** — `@saroh/auth/client`,
  `/middleware`, `/next`, `/auth-status` or `/constants`. The package root pulls
  Prisma into the bundle (ESLint).
- **Local sign-in needs portless and `BETTER_AUTH_TRUSTED_ORIGINS`** (AGENTS.md;
  `docs/architecture/DEV_LEARNINGS.md`, #222).
- **Write business rules down.** Plan limits, role actions, and what a disabled
  module preserves belong in the ADRs and runbooks
  (`docs/architecture/runbooks/MODULE_ROLLOUT.md`), not only in code.
