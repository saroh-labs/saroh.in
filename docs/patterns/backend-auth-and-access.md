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

## The roles — **Current**

`OrgRole` has four values (`common/types/organization-context.ts`), and
`organization-policy.ts` maps each to a closed set of actions.

| Role       | What it may do                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `OWNER`    | Everything, including `org:delete`.                                                                     |
| `ADMIN`    | Everything except `org:delete`.                                                                         |
| `MEMBER`   | The read-only floor: `org:read`, `member:read`, `store:read`, `site:read`, `media:read`, `module:read`. |
| `REVIEWER` | `site:read`, `site:comment`, `site:approve` — and nothing else, not even the floor.                     |

- **Current** — **REVIEWER is enumerated, never derived** (#276). The read-only
  floor includes the roster, the stores and the media library; a reviewer is an
  outside pair of eyes on one site. Deriving their set from the floor would mean
  every future addition to it silently widened what a reviewer can see.
- **Current** — **A reviewer's site:read is narrowed per site.**
  `SiteReviewer(siteId, userId)` is the grant; `reviewerScope(ctx)` in
  `sites/site-access.ts` is spread into the `where` of every site lookup —
  `assertSiteInOrg`, `listSites`, `getSite`, `getSiteFlags`, posts, post
  categories and preview links. A guard would not do: several services query
  `Site` directly, and a guard is something to forget. An ungranted site is a 404.
- **Current** — **Membership is assignable, and invitations are hashed.**
  `OrganizationInvitation` holds the role, a reviewer's sites, and a sha256 of
  the token; the plaintext exists only in the invitee's email. Seven-day expiry,
  one live invite per address per org, and accepting spends the token. The
  routes are `member:read` / `member:invite` / `member:role:update` /
  `member:remove`, plus `POST /organization-invitations/:token/accept`, which
  runs on the session alone because the caller is not a member yet.
- **Current** — **The last OWNER cannot be demoted or removed.** The S1-006
  invariant, enforced in `organization-members.service.ts` inside a serializable
  transaction — it is about the state of the roster, not what a role may do, so
  no role→action map can express it.

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
