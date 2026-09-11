# Authentication and access

> **Read when:** touching sign-in, sessions, organization context, roles,
> capability gates, entitlements or staff access.
> Adapted from claude-patterns `backend/04-auth-and-access.md`. The current
> Better Auth configuration is `packages/auth/src/server.ts`; the decision is
> DEC-003 in `docs/architecture/DECISIONS.md`. (A longer
> `docs/AUTHENTICATION_ARCHITECTURE.md` exists on some machines but is gitignored
> and describes the design before `api.saroh.in` became the auth server — don't
> rely on it.)

## Who decides what — **Current**

| Question                             | Decided by                      | Where                                                                                                          |
| ------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Is this a signed-in user?            | Better Auth, running in the API | `packages/auth/src/server.ts` (emailOTP, GitHub and Google sign-in, cross-subdomain cookie); `BetterAuthGuard` |
| Which organization, with which role? | The API, from the session       | `OrganizationGuard` → `OrganizationContextService`                                                             |
| May this role take this action?      | Policy                          | `authorize(ctx, action)` in `organization-policy.ts`                                                           |
| Is the capability switched on?       | The API                         | `ModuleEnforcementGuard` and `@RequireModule` (ADR-003)                                                        |
| Does the plan allow it?              | Entitlements                    | `EntitlementService` (`check`, `can`)                                                                          |
| Is this person Saroh staff?          | The API                         | `PlatformAdminGuard`, `PlatformPermissionGuard`                                                                |

The frontends, `admin.saroh.in` included, decide none of these. They render
what the API allows.

## Rules

- **Current** — **Derive the organization; never accept it.** `:organizationId`
  or `x-organization-id` is a hint the guard re-validates against real
  membership. Public routes derive the organization from the resource (a Site),
  never from the request.
- **Current** — **Cross-tenant lookups are 404.** A 403 confirms that the row
  exists. 403 is for a known resource the caller may not act on: a role denial, a
  plan entitlement, an invitation sent to someone else.
- **Current** — **Gate on the server first** (§21, §29). A hidden nav item is a
  usability aid. `ModuleEnforcementGuard` covers 19 controllers across all eight
  modules and stays dark until `MODULE_ENFORCEMENT` is set;
  `module-annotations.spec.ts` pins what is gated and what must never be
  (refunds, consent withdrawal, public checkout, published sites, webhooks).
- **Current** — **Three control planes, never conflated** (ADR-003): feature flags
  are Saroh's rollout, entitlements are what a plan permits, modules are what an
  Organization has chosen.
- **Current** — **State-changing requests are origin-checked.** `OriginGuard`
  rejects an untrusted `Origin` on POST, PUT, PATCH and DELETE.
- **Current** — **Frontend session reads keep "signed out" and "could not check"
  apart.** Edge middleware checks cookie presence only
  (`@saroh/auth/middleware`); Server Components use `requireSession()`, and only
  a 401/403 redirects (`frontend-error-feedback.md`).
- **Current** — **Frontends import a specific auth entry** — `@saroh/auth/client`,
  `/middleware`, `/next`, `/auth-status` or `/constants`. The package root pulls
  Prisma into the bundle (ESLint).
- **Current** — **Local sign-in needs portless and `BETTER_AUTH_TRUSTED_ORIGINS`**
  (AGENTS.md; `docs/architecture/DEV_LEARNINGS.md`, #222).
- **Adopted** — **Write business rules down.** Plan limits, role actions and what
  a disabled module preserves belong in the ADRs and runbooks
  (`docs/architecture/runbooks/MODULE_ROLLOUT.md`), not only in code.
