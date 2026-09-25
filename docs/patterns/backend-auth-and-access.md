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
| May this operator do this?           | The permission vocabulary       | `admin-permissions.ts` (code); grants in `PlatformAdminRoleAssignment` (data)                                  |
| Is this business open for activity?  | Its lifecycle                   | `assertOrganizationOpen` (`organization-lifecycle.gate.ts`), in `OrganizationGuard` and public writes          |

The frontends, `admin.saroh.in` included, decide none of these. They render
what the API allows.

## The roles — **Current**

`OrgRole` has four values (`common/types/organization-context.ts`), and
`organization-policy.ts` maps each to a closed set of actions.

| Role       | What it may do                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER`    | Everything, including `org:delete`.                                                                                                                                                                                                                                                                                     |
| `ADMIN`    | Everything except `org:delete`.                                                                                                                                                                                                                                                                                         |
| `MEMBER`   | The read-only floor: `org:read`, `member:read`, `store:read`, `site:read`, `media:read`, `module:read`, and the diary — `booking:read`, `service:read`, `contact:read` (DEC-020) — plus `order:stage` (DEC-024, adopted): an order's kitchen view without money, and moving its stage. No leads, no pipeline, no money. |
| `REVIEWER` | `site:read`, `site:comment`, `site:approve` — and nothing else, not even the floor.                                                                                                                                                                                                                                     |

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
- **Current** — **A reviewer never opens the editor** (#275, decided
  2026-09-12). Reading and commenting is its own screen, not a read-only
  editor: `/sites/:id` redirects a caller without `section:write` to
  `/sites/:id/review`, which renders the page with the live site's blocks and a
  "Comment on sections" mode. It reads through `getPageForReview` (`site:read`,
  writes nothing), so `getPageDraft` requiring `section:write` is correct and
  stays. A read-only editor would make every editor change answer "and with no
  write access?".
- **Adopted** — **Members move kitchen stages, nothing else on an order**
  (DEC-024, amends DEC-020). `order:stage` reads the order's kitchen view —
  items, stage, notes, allergens, customer name — with money figures left out
  by the API, and moves its stage or undoes the last step. Refunds and edits
  to items or address stay `order:write` / `payment:manage` (Owner/Admin).
  **Current** since U14: a module may name several `requiredAction`s, any one
  of which reaches it, and Commerce takes `order:read` or `order:stage`, so a
  Member reaches Sell → Orders (the list comes back without totals or emails)
  and Order Detail (`GET organizations/:org/orders/:id`). The older
  store-scoped order list and read send totals, so they refuse a role with
  `order:stage` but no `order:read`. A new read inside Commerce must ask for
  its own action; the module gate no longer implies `order:read`.
- **Adopted** — **No money figures without a money read** (ADR-008). Stats,
  takings, fees and payouts go only to a role that may read that money
  (`payment:read`, `invoice:read`, `subscription:read`); the API omits them,
  it does not send them for the screen to hide. `billing:read` is Saroh's own
  billing (DEC-014), not the merchant's.
- **Adopted** — **Who writes the new settings** (ADR-008): staff, their hours,
  time off and booking rules need `service:write`; GST registration, state and
  rates need Owner/Admin. A Member is refused both.
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
  (`docs/architecture/LOCAL_DEV.md`; `docs/architecture/DEV_LEARNINGS.md`, #222).
- **Current** — **Every admin controller is `@AdminRoutes()`** (admin console
  plan, 2026-09-23): authenticated, staff, the route's declared permission
  (fail-closed), then — only on routes that ask — a support-access session.
  `admin.controller.permissions.spec.ts` reads every controller the admin module
  registers and fails a route that declares no permission.
- **Current** — **The staff vocabulary is code; grants are data** (plan D3).
  Adding a permission or changing what a role may do is a pull request to
  `admin-permissions.ts`, identical on every instance. Every permission is
  reachable — a permission nothing requires is removed, not kept for later.
  Granting, changing and revoking happen in the console (`/team`), never in
  SQL; assignments are append-only; no change may leave the instance without
  a Platform Owner whose ownership does not expire.
- **Current** — **Cross-tenant reads live only behind the admin guards** (plan
  D2). The admin services (`admin-organizations`, `admin-people`,
  `admin-machinery`, `admin-waitlist`, `admin-metrics`) read across every
  business with no organization context, so the `org_isolation` policies take
  their permissive branch. Each says **CROSS-TENANT READ** in its doc comment,
  returns what decides whether to act — never a business's customers, orders
  or messages — and reads personal data only behind `organization:pii:read`.
  A tenant path never calls one.
- **Current** — **Operators act through the business's own services, as
  themselves.** A module change, a role change or a removal goes through
  `ModuleLifecycleService` / `OrganizationMembersService` with an operator
  context (`roleKey: "platform-operator"`, the operator's own `userId`), so the
  business's rules hold (it always keeps an owner) and the change is never put
  down to one of its members. The business's own Activity shows it as "Saroh
  support" — never the operator's name, email or user id: the role key marks
  the row `metadata.byOperator` (`auditMetadata()` in `audit.service.ts`), and
  the admin ledger keeps who it was (DEC-035). There is no write-mode view-as.
- **Current** — **A suspended or closing business takes no new activity.**
  `OrganizationGuard` refuses writes and the public enquiry, booking and
  payment paths refuse outright; reads still pass and the site stays up, so its
  people can see what happened and take their data.
- **Adopted** — **Write business rules down.** Plan limits, role actions and what
  a disabled module preserves belong in the ADRs and runbooks
  (`docs/architecture/runbooks/MODULE_ROLLOUT.md`), not only in code.
