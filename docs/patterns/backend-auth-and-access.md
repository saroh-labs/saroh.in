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
  by the API, and moves its stage or undoes the last step. Taking, changing,
  refunding and exporting orders are the split order powers below
  (Owner/Admin by default).
  **Current** since U14: a module may name several `requiredAction`s, any one
  of which reaches it, and Commerce takes `order:read` or `order:stage`, so a
  Member reaches Sell → Orders (the list comes back without totals or emails)
  and Order Detail (`GET organizations/:org/orders/:id`). The older
  store-scoped order list and read send totals, so they refuse a role with
  `order:stage` but no `order:read`. A new read inside Commerce must ask for
  its own action; the module gate no longer implies `order:read`.
- **Current** (B16, DEC-039) — **Each order endpoint asks its own power.**
  `order:create` takes a new order (store-scoped `POST stores/:id/orders`
  and its New order lines) and its pay link; `order:edit` changes a placed
  order (`PATCH`, "Change how it's fulfilled", recording a payment by hand);
  a pay link on an order takes either; `order:refund` refunds, retries a
  refund and cancels (a cancel is a refund in full), and settles the money
  when a paid order changes; `order:export` is asked of every Export page
  (`GET orders?export=true`). Reads stay `order:read` or `order:stage`, and
  moving steps and the courier's details `order:stage`. `resolveCapabilities`
  adds implied holds: `order:write` → create, edit, export; `payment:manage`
  → refund; each of the four → `order:read` (the whole order, money
  included — Order Detail sends money to `order:read` or `payment:read`).
  So a role saved before the split keeps what it could do; no backfill. On
  the store-scoped writes `store:write` no longer takes orders; a storefront
  role that writes to its storefront still does (DEC-048).
  `order-permissions.db.spec.ts` pins the matrix one row per endpoint; a new
  order endpoint adds its row there.
- **Current** (C13, DEC-039) — **Each customer endpoint asks its own power.**
  `contact:read` ("See customers and contacts") reads the list, Customer
  Detail and search, phone and email included; `contact:write` ("Edit
  customers and contacts") edits, and hard-deletes a record with no orders or
  invoices, and implies `contact:read`. `customer:sensitive` shows Medical
  and other sensitive Needs attention entries and booking-page intake notes;
  `canSeeSensitive` in `customer-workspace/attention-read.ts` is the one seam
  every surface asks, and nothing implies it (a front desk with
  `contact:write` doesn't read medical notes). `customer:merge` and
  `customer:remove` stand alone. Owner and Admin hold all five; a Member
  holds `contact:read`. Inside Customer Detail each part follows its own
  read: an order's total with `order:read`, a pack's price with `pack:read`,
  subscriptions with `subscription:read`, invoices and Owed with
  `invoice:read`; Spent, which sums orders and invoices, needs both.
  Customer refusals read "Your role can't …" (`customer-access.ts`).
  `customer-permissions.db.spec.ts` pins one row per customer endpoint.
- **Current** (E26, DEC-039) — **Each booking, service and pack endpoint
  asks its own power.** `service:write` is relabelled "Change services,
  hours, time off and booking rules" and covers all of that set-up; there is
  no `booking:settings` key (one power, one key). `pack:sell` ("Sell class
  packs and book with them") sells a pack at the desk and spends or gives
  back a holder's class on a booking (with `booking:write`); `pack:write`
  ("Make and change class packs") creates, edits, publishes, extends and
  archives. `pack:read` shows the whole pack, prices and sales included:
  there is no money-free pack read. `resolveCapabilities` adds implied
  holds: `booking:write` → `booking:read`, `service:write` → `service:read`,
  `pack:write` → `pack:sell` → `pack:read`, so a role saved with
  `pack:write` still sells; no backfill. Owner and Admin hold all three pack
  powers; a Member holds none of them until F18 (matrix Q1). Refusals read
  "Your role can't …" (`bookings/booking-access.ts`).
  `booking-permissions.db.spec.ts` pins one row per endpoint; a new booking,
  service or pack endpoint adds its row there.
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
- **Current** (F19) — **Granting is bounded by reach.** Nobody gives a role a
  permission they don't hold, or changes, renames or removes a role that can
  already do more than they can — their own role included. Members (who can
  be put in which role) and roles (what a role may be given) both ask
  `withinReach` / `outOfReach` in `organization-policy.ts`, on the target's
  resolved set (implied holds count); the refusal is a 403 naming the
  permissions in the owner's words. Any new write of a permission list
  (F17's extras) asks the same helper.
- **Current** (F16, DEC-048) — **A storefront's people are on the team.**
  Accepting a storefront invite (`members/members.service.ts`) also makes a
  `Membership` in the store's business, in the same transaction, in the
  narrow **"Storefront team"** role (key `storefront-team`: `org:read`,
  `member:read`, `module:read`, `media:read`, `store:read`,
  `product-review:read` — no customers, bookings, orders or money), unless
  the person already holds a role, which is never lowered or replaced. The
  rule is `joinTeamFromStorefront` in `@saroh/database`
  (`backfill/store-members-to-memberships.ts`, shared with the one-off
  backfill); it writes a `membership.storefront-join` Activity entry. A
  storefront invite needs `member:invite` in the business as well as the
  `StoreOwner` check, and the Storefront team role as the business has it
  must be within the inviter's reach. Removing someone from the team deletes
  their `StoreMembers` rows in that business's storefronts, in the removal's
  serializable transaction. What anyone does inside a storefront still comes
  from their storefront role.
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
  rejects an untrusted **or missing** `Origin` (falling back to `Referer`) on
  POST, PUT, PATCH and DELETE (#50). **A frontend's server-side call to the
  API sends `origin: requestOrigin(await headers())`** (`@saroh/auth/origins`),
  as `apiFetch` and `adminFetch` do. A new server-side client that forgets it
  gets a 403 on every write. So does a Playwright test that writes through
  `request`: put `origin: urls.APP_URL` in its headers.
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
- **Adopted** (2026-09-26, ADR-011) — **A business's customers are not
  users.** A customer account on a merchant site is a per-business
  `CustomerAccount` linked to a Contact, never a Better Auth `User`. Its
  session is a host-only `__Host-` cookie on the site's own host, never on
  `.saroh.app`. The site's server routes send the token to the API, and the API
  accepts it only for the business that host resolves to. A workspace session
  never signs anyone in on a merchant site.
- **Current** (round-2 plan A, A2) — **Site-account routes are
  server-to-server only.** Every `public/site-accounts/*` route sits behind
  `SiteRelayGuard` (`modules/site-accounts/site-relay.ts`): saroh.app signs
  the visitor's address, the host it served and the time with
  `SITE_RELAY_SECRET`, and anything unsigned, forged or older than 60
  seconds is a 401. The business comes from that host, and limits count the
  relayed address, never the caller's.
- **Current** (round-2 plan A, A3) — **A signed-in customer route sits
  behind `CustomerSessionGuard`** (`modules/site-accounts/customer-session.guard.ts`)
  and takes the customer from `@CurrentCustomer()`. The guard checks the
  relay, then the `x-customer-session` token against a live session of an
  ACTIVE account on that very site (another business's site, or another site
  of the same business, is a 401). It sets `request.customerContext`, never
  `organizationContext`, so no staff check can mistake a customer for a
  member; `OrgRlsInterceptor` reads its `organizationId`, so the route runs
  under that business's RLS. In saroh.app, every call to these routes goes
  through `lib/customer-session.ts` (`siteAccountsFetch`, `accountFetch`),
  and every state-changing action calls `siteOrigin()` (`lib/origin.ts`)
  first — `lib/origin.test.ts` fails when one doesn't.
- **Adopted** (2026-09-26, DEC-039) — **New staff permissions wait for the
  matrix review** (`docs/plans/2026-09-26-permission-matrix.md`). Until then,
  build against today's actions.
- **Adopted** — **Write business rules down.** Plan limits, role actions and what
  a disabled module preserves belong in the ADRs and runbooks
  (`docs/architecture/runbooks/MODULE_ROLLOUT.md`), not only in code.
