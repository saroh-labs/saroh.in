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
- **Current** (DEC-098, 2026-10-07) — **Money follows permissions, never
  role names.** Seeing amounts, taking a desk payment, marking an invoice
  paid, recording an order's payment and refunding are asked of the role's
  permissions only — `allows(ctx, …)` in the API, `permits(org, …)`
  (`lib/organizations/permits.ts`) in the app, which permits nothing when
  no permissions came back. Built-in roles keep their default permissions.
  A role that may take desk payment (`booking:write` + `invoice:write`,
  `mayTakeDeskPayment`) sees the diary's figures; anyone else gets
  `toTake: true|false` in place of `take`, and the app shows Take payment
  (and Mark paid, Paid in cash) **disabled with why**, never hidden.
  Guarded by `organizations/money-by-permission.spec.ts` (API) and
  `lib/organizations/money-by-permission.test.ts` (app). Storefront roles
  (DEC-048) are their own bundle and not covered.
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
  Accepting stores the role as invited — a built-in, or a role the business
  made while it still exists (else MEMBER) — never the built-in it maps to
  (UX-004, `invite-custom-role.db.spec.ts`).
- **Current** (F19) — **Granting is bounded by reach.** Nobody gives a role a
  permission they don't hold, or changes, renames or removes a role that can
  already do more than they can — their own role included. Members (who can
  be put in which role) and roles (what a role may be given) both ask
  `withinReach` / `outOfReach` in `organization-policy.ts`, on the target's
  resolved set (implied holds count); the refusal is a 403 naming the
  permissions in the owner's words. Any new write of a permission list
  (F17's extras) asks the same helper.
- **Current** (F17, DEC-039) — **A person can hold extra permissions beyond
  their role.** `Membership.extraActions` (action keys, default empty).
  `resolveCapabilities(roleKey, stored, extras)` unites the role's set with
  the extras, filtered by `extraActionsFor` (known actions only, never
  `org:delete`, and for a Reviewer only `site:read`, `site:comment`,
  `site:approve` — DEC-006), then runs `withImplied` over the union; with no
  extras it returns exactly the role's set. Every place that resolves a
  person passes their extras: `OrganizationContextService.resolve` and
  `listForUser`, `StoresService`'s membership check, and the members
  service's reach checks. `PUT organizations/:id/members/:userId/extra-actions`
  replaces the list, under `member:role:update` and the reach rule for every
  actor, Owner included: never your own list (403), never someone whose role
  and current extras exceed yours (403), and nothing afterwards beyond what
  you hold, implied holds counted (403 "Your role can't give a permission
  you don't have: …"); an owner-only power or a non-review power for a
  Reviewer is a 400. An extra the role already grants is not stored. Changing
  or removing someone also counts their extras; moving someone to Reviewer
  drops their non-review extras. Each change writes
  `membership.extras.update` (given and taken, keys and labels), which
  Settings › Activity reads as "gave Ravi Refund orders". Giving an extra
  asks the plan's `roles` row ("Custom roles", UX-030; Pro only, DEC-099) —
  taking one away never does. So does giving an invented role a permission
  it didn't have; taking one away or renaming never asks.
- **Current** (DEC-105) — **Seats follow permissions, never role names.**
  `billing/seats.ts` decides who uses a team seat: anyone whose role and
  extras hold a permission outside `VIEW_ONLY_ACTIONS` (every `…:read`,
  `customer:sensitive`, `order:export`, `site:comment`, `site:approve`), or
  who takes bookings (an ACTIVE `StaffMember`). Everyone else is view-only
  and counts toward the `reviewers` row ("View-only people"). Metering,
  inviting, changing a role, giving an extra and re-permissioning a role all
  classify through it, and the member, invitation and role views carry
  `usesSeat` so Team never guesses from a key.
- **Current** (F16, DEC-048) — **A storefront's people are on the team.**
  Accepting a storefront invite (`members/members.service.ts`) also makes a
  `Membership` in the store's business, in the same transaction, in the
  narrow **"Storefront team"** role (key `storefront-team`: `org:read`,
  `member:read`, `module:read`, `media:read`, `store:read`,
  `product-review:read`, and since DEC-074 `order:stage` for its own
  storefronts — no customers, bookings or money), unless
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
- **Current** (DEC-074) — **A location's team works only its storefronts'
  orders.** Storefront team holds `order:stage` (migration
  `20261019120000_storefront_team_orders` added it to existing roles), and
  every order lookup spreads `orderLocationWhere(ctx)` /
  `orderLocationSql` (`orders/order-location.ts`), keyed on the role, like
  `reviewerScope`: another storefront's order is a 404 to read, and every
  move asks `assertOrdersAtOwnLocation` (a 403). A new order read or move
  spreads the same; Home, the calendar and New order alerts follow it.
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
- **Current** (DEC-070) — **What is being set up never decides access.**
  `Organization.kind` (BUSINESS, SOLO, WORK) picks words and defaults only.
  It is served on the `org:read` summary and the organization list, changed
  with `org:update`, and read elsewhere only through `organizationKind(db,
orgId)` (`organizations/organization-kind.ts`).
  `organization-kind.readers.spec.ts` scans the source and fails on a read off
  its allow-list, in `common/guards`, a `capabilities/module-*` file, an
  entitlement, or inside an `assert*`.
- **Current** — **Three control planes, never conflated** (ADR-003): feature flags
  are Saroh's rollout, entitlements are what a plan permits, modules are what an
  Organization has chosen.
- **Current** (plans catalogue U5, U12) — **Access is read from the pricing
  catalogue, in one place.** `CatalogueAccessService.resolve` (billing)
  turns a business's subscription (or a due pending move, or Free) into
  plan@version, applies its live overrides — a `plan` override first (how
  grandfathering works), then remove, grant, limit, raise — and its add-ons
  (`resolveAccess`, `@saroh/pricing-catalog`). `EntitlementService` reads
  its limit map (`check`, `can`), module availability its registry step
  after the rollout gate, behind the `PLAN_ENFORCEMENT` kill switch, and
  `GET …/billing/access` its rows. A legacy `business`/`pro` subscriber
  reads as Grow and keeps its own row for the keys no catalogue row sells,
  so it never resolves as Free; a business with no subscription row and no
  plan override reads `FREE_ENTITLEMENTS` until the backfills reach it
  (`docs/architecture/PRICING_ROLLOUT.md`). Never read `Plan.entitlements`
  directly for access.
- **Current** (plans catalogue U13) — **A plan limit is checked where the
  write happens, behind the kill switch.** A write that adds a metered
  thing calls `planMeter.roomInTx(tx, org, row)` on its own transaction
  before writing (or `withRoom` when it had no transaction, `assertRoom`
  when it can't share one), and a write a switch row governs calls
  `planMeter.assertIncluded(org, row)` (`billing/metering.service.ts`).
  Off (`PLAN_ENFORCEMENT`), neither reads anything nor opens a
  transaction. On, a business off the catalogue is never refused, and a
  plan that can't be read lets the write through (logged,
  `plan_meter_unresolved`). The refusals are 403 with `details.code`
  `PLAN_LIMIT_REACHED` (with the limit, the count, `upgradeTo` and the
  design's notice) or `MODULE_LOCKED`; the booking page gets 409
  `BOOKINGS_PAUSED`, which names no plan. What each limit counts is
  `billing/metering.ts`, the one place: orders and bookings that stand
  (never an unpaid online checkout or a pay-now hold; bookings only those
  customers made on the site, `Booking.bookedOnline` — the team's own are
  never capped, and the booking page reads `paused` before its form,
  DEC-095), in the business's
  month in its zone (many businesses at once: `billing/metering-across.ts`,
  the same rules). The site's checkout is never refused (a soft cap,
  OQ-8); a payment once captured never is (OQ-7). A catalogue cell marked
  `soft` (storage, site visits) is soft wherever it's checked — counted and
  told, never refused — whatever the call site passes. Websites (`sites`)
  and places customers visit (`locations` → `shopLocations`, metered when a
  storefront's kind becomes SHOP) are the catalogue's where `enforcedRow`
  answers for the row; elsewhere the old one-website and `storefronts`
  floor (`LEGACY_FLOOR_ENTITLEMENTS`) still applies, so nothing new locks
  behind the switch. Team members never count a Reviewer, so moving
  someone off Reviewer is metered. Over after a downgrade,
  existing things stay readable and editable; only adding is refused. A
  new write that adds a metered thing, or a new switch row, gets its call
  and a row in `billing/plan-limits.db.spec.ts`.
- **Current** (plan shape of 5 Oct) — **A plan without online payments
  stops new money online, never what a business already has.** The
  `payments` and `subscriptions` rows (registry PAYMENTS) are asked where a
  new online payment or subscription starts, through
  `billing/online-payments-plan.ts`: a first provider connection, a pay
  link that charges (invoice, order, booking), a workspace intent, the
  site's checkout (`checkoutReadiness`: online off, so it takes payment at
  the handover instead — "Free takes money offline", 2026-10-06), the
  booking page,
  packs, plan joins, and subscribing someone. The business hears 403
  `MODULE_LOCKED`; a customer hears 409 `NOT_PAID_ONLINE` naming no plan.
  Renewals never ask: the renewal and charge jobs, a renewal invoice's pay
  link and pay page (`subscriptionId` set), autopay on it, and re-entering a
  connected provider's keys all go on. PAYMENTS itself stays available
  (`PLAN_LOCKS_ACTIONS_ONLY`), since it holds refunds, renewals and
  invoices; invoicing has no registry and needs none (DEC-070).
  `billing/online-payments-plan.db.spec.ts`.
- **Current** (6 Oct 2026, "Online needs a paid plan; Free takes money
  offline") — **Check an online-money feature where it is configured, never
  at the customer's moment.** A feature that takes money online is set up
  only on a plan with the `payments` row, and the check sits on the write
  that sets it up (403 `MODULE_LOCKED`). Nothing a business set up may
  become unbookable or unbuyable after a downgrade: the customer's side
  quietly falls back to the offline way and keeps the stored setting for an
  upgrade. Deposits are the first (`bookings/deposit-plan.ts`): setting a
  service's `depositMode` to anything but NONE needs the row (NONE, or the
  deposit it already has, never asks, so the editor's full-form save keeps
  working); whenever the business can't take money online — that plan,
  Payments off, or no provider (`takesOnlinePayment`, the one predicate) —
  the booking page serves no `depositCents` and books the service "pay at
  the desk", with the stored deposit untouched. Staff bookings never ask. The app locks the control
  with the way up (`depositLock`). `bookings/deposit-plan.db.spec.ts`.
  Memberships are the second (`subscriptions/plan-writes.ts`,
  `plan-drafts.ts`): creating a membership plan, starting or publishing a
  draft and selling an archived plan again need the `subscriptions` and
  `payments` rows (`assertPlanStartsSubscriptions`). Changing a plan's
  wording (also publishing a live plan's changes), archiving, discarding
  and deleting a draft never ask, so a downgraded business tidies up. A
  membership has no offline fallback on the site, so there the plan
  **leaves the site**: `public-plans` answers no plans and `offered: false`
  (no card, no "Ask about joining"); the editor's canvas says why. Members
  already on a plan keep renewing; staff can't add new ones (`subscribe`).
  The app swaps "New plan" for the notice and drops "Sell again"
  (`membershipPlansLock`). `subscriptions/membership-plan-lock.db.spec.ts`.
- **Current** (DEC-068) — **Turning a module on creates its minimum in the
  switch's own transaction.** `PUT …/modules/:key { status: "ENABLED", setup }`
  checks `module:manage` and then the action for each thing it creates
  (`store:create`, `service:write`, `pipeline:manage`, `site:create`); without
  `setup` it behaves as before. The API never turns a dependency on — the app
  enables each first. Whether Saroh has rolled a module out is one function,
  `moduleRolledOut`, which also treats a `hidden` module (Automations) as not
  rolled out. `modules/capabilities/README.md` has the payloads.
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
  `admin-machinery`, `admin-waitlist`, `admin-metrics`, and the pricing
  catalogue's `ImpactService`) read across every
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
