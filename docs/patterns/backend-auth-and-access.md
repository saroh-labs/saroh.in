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

| Question                              | Decided by                          | Where                                                                                                                                                                                             |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is this a signed-in user?             | Better Auth, running in the API     | `packages/auth/src/server.ts` (emailOTP, GitHub and Google sign-in, cross-subdomain cookie); `BetterAuthGuard`                                                                                    |
| Which organization, with which role?  | The API, from the session           | `OrganizationGuard` → `OrganizationContextService`                                                                                                                                                |
| May this role take this action?       | Policy                              | `authorize(ctx, action)` in `organization-policy.ts`                                                                                                                                              |
| Is the capability switched on?        | The API                             | `ModuleEnforcementGuard` and `@RequireModule` (ADR-003)                                                                                                                                           |
| Does the plan allow it?               | Entitlements                        | `EntitlementService` (`check`, `can`)                                                                                                                                                             |
| Is this person Saroh staff?           | The API                             | `PlatformAdminGuard`, `PlatformPermissionGuard`                                                                                                                                                   |
| May this operator do this?            | The permission vocabulary           | `admin-permissions.ts` (code); grants in `PlatformAdminRoleAssignment` (data)                                                                                                                     |
| Is this business open for this write? | Its lifecycle, by the route's class | `assertWorkspaceWrite` (`organization-lifecycle.gate.ts`) in `OrganizationGuard` and `StoreLifecycleGuard`; `assertOrganizationOpen` / `assertOrganizationWindingDown` on public writes (DEC-120) |
| What does its state close?            | The lifecycle table                 | `organization-lifecycle.policy.ts` (#921): activity, billing, public site, members' door                                                                                                          |

The frontends, `admin.saroh.in` included, decide none of these. They render
what the API allows.

## The roles — **Current**

`OrgRole` has four values (`common/types/organization-context.ts`), and
`organization-policy.ts` maps each to a closed set of actions.

| Role       | What it may do                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER`    | Everything, including `org:delete`.                                                                                                                                                                                                                                                                                     |
| `ADMIN`    | Everything except the owner-only powers: `org:delete`, `org:address:update` and `billing:manage` (it reads Plan and billing with `billing:read`).                                                                                                                                                                       |
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
  store-scoped order list and read send totals (and the store-scoped
  customer list each customer's spend), so they take `order:read`
  (`requireOrderRead`): a role with `order:stage` but no `order:read` is
  refused, and so is store access alone (#868) — `store:read` shows the
  storefront, never what it has sold. A new read inside Commerce must ask for
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
  role that writes to its storefront still does (DEC-048), but never its
  money (DEC-106, below).
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
  `lib/organizations/money-by-permission.test.ts` (app).
- **Current** (DEC-106, 2026-10-07) — **Storefront roles follow permissions
  for money too.** A storefront Admin, Manager or Editor still takes and
  changes its storefront's orders (DEC-048), but recording or taking a
  payment, refunding or cancelling, and reading the store-scoped lists that
  send amounts are asked of the business role's permissions only —
  `StoresService.moneyAllows`, and `orderWriteOrganization(…, { money })`,
  which leaves before the storefront-role fallback (`order:refund` always
  does). With ORG_AUTHORIZATION off the storefront's owner keeps it; on the
  organization path a `StoreOwner` row is no shortcut. Refused in Order
  Detail's words ("Your role can't record payments — …"). A storefront role
  that should take payments needs a business role carrying `order:edit`.
  Guarded by the same two scans.
- **Current** (10 Oct 2026) — **A location's read says what the caller
  may do there.** `GET stores/:id` carries `abilities` (`edit`,
  `takeOrders`, `takePayments`, `changeOrders`), from
  `StoresService.abilities`, which asks the very functions the writes'
  guards ask (`canWrite`, `orderWriteOrganization` with `money` as
  `OrdersService.create` passes it). It is never a second policy: a rule
  changed in a guard changes the answer, and
  `stores.service.abilities.authorization.spec.ts` and
  `location-abilities.db.spec.ts` fail if the two disagree. The app reads
  it (`lib/stores/abilities.ts`) to offer a location Admin, Manager or
  Editor New order at their location (paid on collection, never the
  money) and its name and description to edit. A Viewer gets neither. The
  three writing roles are the same today (`WRITE_ROLES`). Catalogue writes
  a location role may make are not offered: the product screens are the
  business's (`requireCan("store:write")`), not a location's.
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
  the extras, filtered by `extraActionsFor` (known actions only, never an
  owner-only power, and for a Reviewer only `site:read`, `site:comment`,
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
- **Current** (DEC-155, 13 Oct; was DEC-105) — **Everyone uses one team
  seat, whatever their role.** `billing/seats.ts` says who: every
  `Membership` (Owner, Admin, Member, Reviewer, any role the business made),
  every open invitation, and everyone on the diary who takes bookings with
  no login (an ACTIVE `StaffMember` with no membership, DEC-111). There is
  no separate or free allowance for Reviewers or other people who only look,
  and no `reviewers` row. Only what adds a person asks the plan (`members`):
  an invite, and a diary person with no login. A change of role, of a role's
  permissions or of someone's extras never changes the count and never asks.
  Don't classify by permission to decide a seat, and don't add `usesSeat`
  back to a view.
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
- **Current** (#868, owner decision 2026-10-08) — **A diary person given a
  login is Calendar only by default.** Someone taking bookings with no login
  (DEC-105) is invited from Team by naming them (`staffId` on the invite,
  `OrganizationInvitation.staffId`); with no role picked the invite is at
  **"Calendar only"** (key `calendar-only`: `org:read`, `module:read`,
  `booking:read`, `booking:write`, `service:read` — no customers, team,
  set-up or money), and the owner may pick any role within reach instead.
  Like Storefront team it is an ordinary role row, made on first use
  (`ensureCalendarOnlyRole` in `@saroh/database`: a business's first diary
  person, an invite or accept at it, the seed) and by the migration
  `20261031100000_calendar_only_role` for businesses already on the diary;
  with no row the policy resolves the key to that list, never the floor.
  Accepting links the diary person to the new membership in the accept's
  transaction (`linkDiaryPerson`; a login already on the diary as someone
  else keeps that). Linking an existing member to a diary person
  (`PATCH staff/:id`) changes no role: a role held is never lowered. **What it reaches is narrowed by the key**, like DEC-074's
  locations: `bookings/own-diary.ts` (`ownDiaryOf`, `ownBookingsWhere`,
  `assertOwnBooking`, `bookingStaffFor`) gives the person's own bookings —
  those they take, and nobody's for a service they take — to the bookings
  list, the bookings calendar, a booking's detail (another's is a 404), the
  business calendar (others' time off unnamed), a class's waitlist, the
  diary's people (themselves only) and Home (no business-wide booking
  counts; off the diary, no bookings rather than everyone's); a move,
  cancel, outcome or pay link on another's booking is a 403 ("Your role
  changes only your own bookings."), and a booking by hand is with
  themselves. They hear no business-wide booking alerts. A new booking read
  or write spreads the same. **Seats:** they use one, as everyone does
  (DEC-155); an open invite naming a diary person with no login
  is that person, counted once (`countedOnDiary` in `billing/seats.ts`, read
  by metering, the invite's meter check and Team's count line).
  `calendar-only-role.spec.ts`, `diary-invite.spec.ts`, `own-diary.spec.ts`,
  `organization-members.diary.spec.ts`, `calendar-only.db.spec.ts`.
- **Current** — **The last OWNER cannot be demoted or removed.** The S1-006
  invariant, enforced in `organization-members.service.ts` inside a serializable
  transaction — it is about the state of the roster, not what a role may do, so
  no role→action map can express it.
- **Current** (DEC-131, 10 Oct 2026) — **Anyone in a business can leave it.**
  `POST organizations/:id/leave` (`OrganizationMembersService.leave`) asks
  no permission, only membership, which `OrganizationGuard` has proven: the
  membership removed is the caller's own, in the context's organization,
  never an id from the request. It takes what a removal takes (`detach`,
  shared with `remove`: the sites they review, their share links, their
  location roles and any location invitation still waiting) and writes
  `membership.remove` with `metadata.left`, which Activity reads as "left
  the team". The last Owner is refused (400, `LAST_OWNER_CANT_LEAVE`), with
  the check repeated inside the transaction. It is a wind-down write, so a
  closing business lets its people go. `remove` still asks `member:remove`.
  `organization-leave.db.spec.ts`.
- **Current** (DEC-131, amended 2026-10-11) — **Only the Owner changes
  what the business pays Saroh.** The API reads Plan and billing to
  `billing:read` (Owner and Admin by default, and grantable) and changes it
  with `billing:manage`, which is owner-only: it is in `OWNER_ONLY_ACTIONS`
  with `org:delete` and `org:address:update`, and that one list is what
  keeps it from everyone else.
    - An Admin doesn't hold it (the built-in map leaves the list out).
    - A role a business makes can't be given it: `ownerOnly` in the
      catalogue, so the role editor never offers it and `vetActions` drops
      it from a save.
    - A stored list that names it anyway is read without it:
      `roleCapabilities` drops owner-only powers from every row but the
      Owner's, as it drops an unknown string.
    - It is never an extra (`extraActionsFor`; a 400 on the write).
    - Every write that changes what is paid asks it before reading
      anything: `POST …/billing/change-plan` (a coupon rides on it),
      `PUT …/billing/addons/:id`, `POST …/billing/checkout/confirm`,
      `POST …/billing/subscribe`, `POST …/billing/cancel` and
      `POST …/launch-offer`. `billing/plan-owner-only.spec.ts` names every
      write route of the billing controller, so a new one fails until it is
      listed and its guard proven.
      The refusal is 403 "Only the owner can change the plan." with
      `ROLE_DENIED` and the permission in `details`. Saroh's emails about a
      bill go to who holds `billing:manage` (`billingRecipients`), so to the
      Owners and no longer an Admin (to confirm, DEC-131). Every Owner of a
      business may: nothing marks one of them as the payer. The app's Settings
      tab, the page and every plan prompt ask the same two
      (`lib/billing/plan-access.ts`), never the role's name. Operators acting
      from the admin console run under their own context and are not part of
      this.

## Rules

- **Current** (10 Oct 2026) — **A refusal by role is a sentence, with the
  permission in `details`.** `authorize()` throws a 403 whose message is
  "Your role can't do this. An owner or admin can change that in Settings ›
  Team." and whose envelope carries `details: { code: "ROLE_DENIED", action }`
  (`roleDenial(action)` in `organization-policy.ts`). An owner-only power
  never points at Settings › Team, where no role can be given it: it reads
  "Only the owner can do this.", and for `billing:manage` "Only the owner
  can change the plan." (`roleDeniedMessage`, 2026-10-11). Never a role's
  key or a permission's in the message: it reaches the screen. An endpoint that says
  its own sentence (`requireBookingPower`, `customer-access.ts`) keeps it. A
  spec pins which permission refused with
  `rejects.toMatchObject({ response: roleDenial("site:update") })`, not by
  reading the message. The app reads it in `lib/api/role-denied.ts`
  (`frontend-error-feedback.md`).
- **Current** — **Signing in lands on the app, not on a list of Saroh's
  hosts** (UX audit, 10 Oct). With no `?redirect=`, accounts sends a sign-in,
  a Google sign-in, a signed-in visit to a sign-in page, `/` and its 404 and
  error pages to `getAppUrl()` (`apps/accounts.saroh.in/lib/return-to.ts`);
  the app's front door sends someone with no business to setup, opens the one
  they have, or asks which. A new account goes straight to setup, by code or
  by Google. `/apps` is for Saroh staff: the page asks the API
  (`GET /admin/me`, `isStaff`), sends everyone else on to the app, and
  nothing links to it.
- **Current** (DEC-129, 10 Oct 2026) — **A merchant signs up and signs in
  with an emailed code; a password is optional.** `/signup` takes the email,
  then the code; `/login` leads with "Email me a code" and keeps "Use a
  password instead" (`/login?with=password` opens on it). Both are Better
  Auth's `emailOTP` endpoints, never a session of our own making:
  `emailOtp.sendVerificationOtp({ type: "sign-in" })`, then
  `signIn.emailOtp`. Asking for a code answers the same, and sends the same
  email, whether or not the address has an account, so no screen says who is
  registered; the code makes the account when there was none. One code step
  for every page (`apps/accounts.saroh.in/components/auth/code-step.tsx`),
  its rules and words pure in `lib/sign-in-code.ts`, in the words of the
  customer site's sheet. The limits are constants in
  `@saroh/auth/constants` that the server's plugin and the screen both read
  (code lifetime, 5 wrong tries, 3 a minute, the Resend wait), and
  `packages/auth/src/sign-in-code.test.ts` runs the real library on
  `authOptions()` with a database in memory: change the auth options or
  upgrade the library and it says what broke. A first password is set on
  the account page with a code to the account's address
  (`lib/password.ts`), never on the session alone. The name is asked in
  setup; an invitee's sign-up asks for it.
- **Current** — **The old password sign-up endpoint still answers the same
  for an address that has an account** (`requireEmailVerification`): no
  page calls it now, but it is the library's and stays on, so the owner of
  the address is still emailed "You already have a Saroh account"
  (`onExistingUserSignUp` → `existingUserSignUpHook` in
  `packages/auth/src/server.ts`, `sendExistingAccountEmail` in the API). A
  failed send never changes the answer.
- **Current** — **Derive the organization; never accept it.** `:organizationId`
  or `x-organization-id` is a hint the guard re-validates against real
  membership. Public routes derive the organization from the resource (a Site),
  never from the request.
- **Current** — **Cross-tenant lookups are 404.** A 403 confirms that the row
  exists. 403 is for a known resource the caller may not act on: a role denial, a
  plan entitlement, an invitation sent to someone else.
- **Current** — **Gate on the server first** (§21, §29). A hidden nav item is a
  usability aid. `ModuleEnforcementGuard` covers 19 controllers across all eight
  modules and stays dark until `MODULE_ENFORCEMENT` is set (`shadow` logs
  what it would refuse, refusing nothing);
  `module-annotations.spec.ts` pins what is gated and what must never be
  (refunds, consent withdrawal, public checkout, published sites, webhooks).
  History reads in a gated domain (orders, store customers, bookings, plans and
  subscriptions, class packs, courses) are left off and their writes gated per
  handler, so a module switched off keeps its records readable; cancelling an
  order, booking, subscription or enrolment already made is wind-down and
  stays open too (#117, DEC-057, `history-reads.gate.spec.ts`).
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
- **Current** (DEC-158) — **A cap inside one thing is not a meter.** A
  catalogue row whose cap is on what ONE thing holds (`variants`: a
  product's variants) says so in `MODULE_MAP` (`within`) and is checked
  through `planMeter.itemCap(org, row)` and `assertItemRoom(cap, has,
adding)` (`billing/item-limits.ts`), under that thing's own lock. It is
  never added to `METERED_LIMIT_KEYS`: it has no count across the
  business, so no usage, notice or pause. Only a write that adds is
  refused; one that adds nothing always passes, so a thing past its cap
  stays editable. A cell without a number, a cell that leaves the row out
  and a version without the row all cap nothing.
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
  behind the switch. The `storefronts` floor counts what `shopLocations`
  counts and is asked where a storefront becomes a SHOP, never on creating
  an online one (DEC-109, `billing/legacy-location-floor.ts`). Team members count everyone, a Reviewer included
  (DEC-155), so a change of role is never metered. Over after a downgrade,
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
  `admin-machinery`, `admin-waitlist`, `admin-metrics`, `admin-usage`
  (storage per business, #798), `admin-billing` (Saroh's invoices and
  subscriptions, DEC-163), and the pricing
  catalogue's `ImpactService`) read across every
  business with no organization context, so the `org_isolation` policies take
  their permissive branch. Each says **CROSS-TENANT READ** in its doc comment,
  returns what decides whether to act — never a business's customers, orders
  or messages — and reads personal data only behind `organization:pii:read`.
  A tenant path never calls one.
- **Current** (DEC-121) — **Customers' reports about a business** are read
  with `organization:read` (the reporter's email only with
  `organization:pii:read`) and marked done with `reports:resolve`, which
  Platform Owners and Support hold. Closing a report changes nothing for
  the business, so it never asks for `organization:lifecycle:write`.
- **Current** (DEC-137) — **Messages from saroh.in/contact** belong to no
  business and every row is personal data (a name, an email, the writer's
  words), so the whole list (`GET /admin/contact-messages`) needs
  `organization:pii:read`. It is read-only and adds no permission. The
  public write (`POST /public/contact-messages`) is guardless, rate-limited
  per visitor and answers nothing back; rows go after 12 months.
- **Current** (DEC-163) — **Saroh's own billing across businesses**
  (`/admin/billing/*`: every Saroh invoice, its PDF, the month's GST CSV,
  every business's Saroh subscription, its checkouts and the provider's
  events) needs `saroh-billing:read`, which only Platform Owners and Billing
  hold — never Support, Operations, Release manager or Auditor. The route
  declares it and `AdminBillingService` checks it again
  (`assertSarohBillingReader`); every read is audited. A tenant path never
  calls it; the business's own invoice list stays its own.
- **Current** (DEC-166) — **Acting on Saroh's own billing** needs
  `saroh-billing:act`, which only Platform Owners and Billing hold: mark a
  Needs-action row resolved, end a business's autopay (its own Cancel
  plan, run through `CheckoutService` under an operator context holding
  `billing:manage` alone, so its history shows Saroh support), re-check a
  double charge's refund, sync its Razorpay customer again, record a hand
  refund on an invoice. Each is a POST with a reason and an idempotency
  key, checked on the route and again in the service
  (`assertSarohBillingActor`), and on the admin ledger. No support-access
  session: Support, even with one open, is refused (403).
- **Current** (DEC-169, admin console U18) — **The Account manager role sees
  only its own.** `ACCOUNT_MANAGER` holds `accounts:read`,
  `saroh-leads:read` and `saroh-leads:write`, never `organization:read`,
  `accounts:assign`, `team:write` or `staff:grant`
  (`admin-permissions.spec.ts`). Every read of leads, contact logs, a team
  view's businesses, the overview, module state, search or a member page
  calls `scopeForStaff(staff, permission)` (`modules/admin/staff-scope.ts`):
  `{kind: "all"}` when any role the person holds grants that permission
  unscoped, `{kind: "own", platformAdminId}` when only the Account manager
  role grants it. For own scope, `maySeeOrganization` answers yes only while
  the business's open `AccountManagerLink` names them (U19). Each such route has a spec:
  an Account manager reading something not theirs gets 403. A teammate's tax
  id is sealed under `STAFF_PII_ENC_KEY` and shown only as set, or its last
  4 characters to `team:pay` holders, each read on the ledger. The role
  CHECK in the migrations equals `AdminRole` (`admin-role-check.spec.ts`).
  Team permissions no route requires yet are listed in `AWAITING_ENDPOINT`
  with the unit that wires them; `admin.controller.permissions.spec.ts`
  fails on any other unused permission.
- **Current** (DEC-169, admin console U19) — **Who brought a business in**
  is decided once, in its create transaction, by `recordManagerInTx`
  (`modules/organizations/account-manager.ts`) under a savepoint: anything
  that fails is rolled back to it and logged (`account_manager_link_failed`),
  and the business is made with no manager. The first proof wins: the
  `?am=` link (`saroh_am` cookie, sent by the workspace as
  `managerLinkCode`/`managerLinkSetAt`), then a code the owner typed
  (`managerCode`), then the owner's **self**-verified email
  (`emailVerifiedBySelf`) on a lead the manager owns, recorded before the
  business's `createdAt`. Only a teammate holding the Account manager role
  now counts (unrevoked grant, unrevoked and unexpired assignment), never
  for their own business; an unknown or revoked code names nobody, silently.
  `AccountManagerLink` is append-only (a trigger lets an open link only be
  ended), one open link per business (partial unique index), the manager a
  bare `platformAdminId`, the proof in `evidence` (code, cookie time, lead
  and when its email was recorded; never an email), and it carries the
  org-isolation policy. A business referral (DEC-156) is recorded beside it.
- **Current** (DEC-169, admin console U25) — **Staff give a business its
  manager; a link ends with the role.** `accounts:assign` (Support and
  Platform owner only; never an Account manager, refused on the route and
  again in `AdminAccountManagersService`) gives a business a manager
  (`POST admin/organizations/:id/manager`), moves it, ends the link
  (`DELETE …/manager`, a reason) or shares businesses out
  (`POST admin/team/share-out`). Each takes a reason and an idempotency key
  and is on the ledger against the business (`account-manager.assigned`,
  `.reassigned`, `.ended`; `.shared-out` for the whole share-out). A move
  ends the open link and starts a new ASSIGNED one in one transaction, so a
  business brought in becomes assigned once moved, and the old link keeps
  its evidence. Only someone holding the Account manager role now, who
  doesn't own the business, can be given it; a deleted business takes
  nobody. Share out evenly gives businesses with no manager that Saroh still
  bills (active or suspended), paying ones first, to whoever is an Account
  manager **and** on commission and looks after the fewest, stopping at
  their capacity (`admin/share-out.ts`). Every write on one business holds
  its `account-manager:<id>` lock. **A link lasts only while its manager
  holds the role**: revoking their access, or an amend that takes the role
  away, ends their links in the same transaction (`manager-links.ts`); the
  hourly `account-managers.link-sweep` ends any left (an assignment that
  ran out, or a change made outside the console) at the moment the role
  ended, named on the ledger as `system:manager-link-sweep`. A change of
  the role's expiry alone keeps them.
- **Current** (DEC-169, admin console U20) — **Saroh's own sales leads**
  (`/admin/saroh-leads`, `modules/saroh-leads/`) belong to no business:
  `SarohLead` is in `NOT_TENANT_OWNED`, and `SarohContactLog` (a call or
  visit, on a lead or a business) carries the org-isolation policy. Reads
  need `saroh-leads:read` and writes `saroh-leads:write`, each scoped by
  `scopeForStaff`: an Account manager reaches only the leads they own
  (another's, or an unowned one, is a 403), and only Support and Platform
  owner give unowned leads out (`assign`, a reason, never to oneself:
  there is no claim). The first to record an email owns the lead (its
  email and sign-up email are unique, merged by the waitlist's key); a
  manager adding one that is taken is told whose. Won names a business
  (an Account manager only one owned by the lead's email), Lost a reason.
  A saroh.in question ("A question before signing up") and a waitlist
  entry (not a tool's email gate) make or merge a lead after their own
  write and never fail it (`lead-intake.ts`); an unconverted website lead
  goes with its enquiry's 12 months once no waitlist entry holds it, and
  with a waitlist entry its owner asked to remove (`lead-retention.ts`).
  Every write is on the ledger with no email in its metadata.
- **Current** (admin console U9) — **Sign-in help** (`people:sign-in-help`,
  Platform owners and Support, with `organization:pii:read`;
  `admin/admin-sign-in-help.service.ts`). Every write takes a reason and an
  idempotency key and is on the admin ledger in its transaction.
    - **Send a sign-in code** goes through the API's own Better Auth
      (`auth.api.sendVerificationOTP`, type `sign-in`, via
      `common/auth/sign-in-code-sender.ts`), never a mail of the console's.
      At most 3 to one person and 20 from one staff member an hour, counted
      from the ledger under `admin-sign-in-code:<userId>`; a refusal is a
      429 saying when, on the ledger as DENIED.
    - **Mark verified** sets `emailVerified` and stamps
      `User.emailVerifiedByStaffAt`. **Staff-verified is never the
      person's own**: self-verified is `emailVerified &&
emailVerifiedByStaffAt === null`, read through `emailVerifiedBySelf`
      (`common/auth/email-verification.ts`). An account manager's
      attribution and a staff invite's acceptance read that, never
      `emailVerified` alone. The stamp is cleared when the person next
      proves the mailbox with a code (`@saroh/auth` `onMailboxProven`, on
      `/sign-in/email-otp` and `/email-otp/verify-email` only) and when staff
      change the address.
    - **Change sign-in email** (`PUT people/:id/email`) is the takeover
      path, so: an address another account uses is refused (409); an owner
      of a business on a paid plan (live subscription billed by a provider
      or on a priced plan) is changed only by a Platform owner (403,
      DENIED on the ledger); the new address starts unverified and every
      session ends; the old address is told with the new one masked; and a
      `SignInEmailChange` row holds the new address for 24 hours. While it
      holds, Better Auth sends it no code (`verification-otp.ts`) and starts
      the person no session by any way in (`@saroh/auth` `mayStartSession`,
      `sign-in-holds.ts`). A second, different staff member may confirm
      (`POST people/:id/email/confirm`, CHECKed in the migration), which
      sends the code at once; otherwise `people.sign-in-email.release`
      sends it when the hold ends.
- **Current** (admin console U24, R32) — **Staff invites** add a teammate
  with no Saroh account (`admin/admin-staff-invites.service.ts`). Create,
  resend and withdraw need `staff:grant` (`POST/DELETE admin/staff/invites…`,
  a reason and an idempotency key, on the ledger); an invite never carries a
  role with a permission the sender lacks (`rolesBeyondReach`, DENIED on the
  ledger). `StaffInvite` stores only the token's sha256; the token is in the
  email alone, valid 7 days, and a resend replaces it. The link opens
  accounts' `/staff-invite/open`, which swaps the token for an httpOnly
  cookie scoped to `/staff-invite` and redirects to the clean address (no
  referrer, left out of error tracking by `lib/untracked-pages.ts`). The
  preview is `POST /public/staff-invites/preview` and the accept
  `POST /staff-invites/accept` on the session alone (`modules/staff-invites/`,
  outside `AdminModule`), both with the token in the body. Accepting needs
  the session's email to be the invite's and `emailVerifiedBySelf`, and the
  last sender to still hold `staff:grant` and reach every role; it then makes
  the grant (reopening a revoked one), the roles and the profile with a ledger
  row in `guardedStaffChange`. A second accept by the same person answers
  `already-joined` and writes nothing; anyone already on the team is refused
  (`ALREADY_ON_TEAM`).
- **Current** (admin console U5) — **A staff override is a gift.** The
  offer sheet gives a plan until a date, a custom price (`pricing:override`
  and `pricing:publish`), one module, a higher limit or a longer trial
  (`subscription:override`; a trial only while TRIALING and not billed by a
  provider), each checked first by `POST organizations/:id/overrides/preview`
  (`admin-offer-preview.ts`), which runs the write's checks and reads the
  business through `CatalogueAccessService.resolve(…, whatIf)` without
  writing anything. Taking a module away (`kind: "remove"`) is a Platform
  owner's alone and refused for a row the plan they pay for, or an add-on
  they bought, includes (`assertMayTakeAway`, in the write and the dry run).
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
- **Current** (#921, DEC-021 amended) — **What each lifecycle state does is
  one table**, `organization-lifecycle.policy.ts`: activity, billing, the
  public site and the members' door, per state. Read it through its
  accessors (`activityOpen`, `billingMayCharge`, `publicSiteOnline`,
  `membersMayOpen`, `SITE_ONLINE_ORGANIZATION`, `BILLING_ORGANIZATION`),
  never a list of state names of your own. **A deleted business
  (`DELETED_RETAINED`) is closed to its members** — owners too, 403
  `ORGANIZATION_DELETED` from `assertMembersMayOpen`, asked wherever a
  membership becomes access (the organization context, the storefront
  authorizer) and left out of the person's list of businesses — and **its
  site is offline**: every public site read filters on
  `SITE_ONLINE_ORGANIZATION` or sits behind `PublicSiteOnlineGuard` (every
  `public/sites` controller). A new state, a new `public/sites` controller or
  a new membership door fails `organization-lifecycle.policy.spec.ts` until it
  is decided.
- **Current** (DEC-120, owner 9 Oct) — **A closing business winds down;
  every write route has a lifecycle class.** A route is `new` unless it
  carries `@LifecycleWrite("wind-down")` (finishes, cancels or refunds
  something already made, or takes money already owed) or
  `@LifecycleWrite("takeout")` (the owner's data download).
  `lifecycleAllows(status, class)` decides: ACTIVE takes all three,
  `PENDING_DELETION` wind-down and takeout, SUSPENDED takeout only,
  deleted none. `OrganizationGuard` asks on org-scoped writes and
  `StoreLifecycleGuard` on `stores/:storeId/…` (every store-scoped
  controller carries it; it tells only someone who works there).
  `organizations/lifecycle-wind-down.spec.ts` names every write route of the
  order, booking, payment, invoice, membership, class pack and course
  controllers as wind-down or refused: **a new write route there adds its
  name to one list.** Public writes ask `assertOrganizationOpen` (new) or
  `assertOrganizationWindingDown` (paying an order or invoice already
  sent, a customer signing in), and **a customer is never told why**: the
  refusal names no state, and the site's shop, booking page, packs and plans
  read the lifecycle through `orders/checkout-paused.ts`
  (`takingNewActivity`) and say what a paused site says (#800).
- **Current** (DEC-122) — **A legal hold keeps a business's data, in
  every state.** `Organization.legalHoldAt`, read only through
  `organizations/legal-hold.ts`. An operator places one with
  `organization:lifecycle:write` — with the suspension, or on a business
  already suspended, closing or deleted (`AdminLifecycleService
.placeLegalHold`) — and only a Platform Owner lifts it
  (`organization:legal-hold:lift`, which no other role carries), each with
  a reason, on the admin ledger with it and on the business's history
  without it. It is not a lifecycle state: `LEGAL_HOLD_DECISIONS` in
  `organization-lifecycle.policy.ts` says, per state, whether a hold may be
  placed and whether a held business may be moved there (never to active,
  never towards deletion), and a new state is a compile error there too.
  While held, a privacy removal and "Download your data" are refused with
  `details.code` `LEGAL_HOLD` and the words "This business's data is on
  hold. Write to contact@saroh.in.", each refusal audited DENIED; every
  job that deletes leaves the business alone (`backend-jobs.md`).
- **Current** (DEC-120) — **Download your data is the owner's, by role.**
  `data-export/`: `POST`/`GET organizations/:org/data-exports` and
  `POST …/:id/link`, `isOwner` in the service (no new permission, DEC-039),
  one being made at a time, each ask and each link audited
  (`organization.data_export.requested` / `.downloaded`). A link is signed
  and short-lived; no key or link is ever stored on a view.
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
- **Current** (ADR-011; DEC-142) — **What a customer sees leaves through
  the allow-list, and someone else's row is a 404.** Every answer of an
  account route is built by a named-field serializer in
  `site-accounts/customer-view.ts` or one of the three files it re-exports
  (`account-bookings-view.ts`, `account-packs-view.ts`,
  `account-details-view.ts`), never by spreading a row;
  `customer-view.spec.ts` feeds each one a row carrying staff notes,
  another attendee and internal ids and checks none comes out. Every read
  is scoped to the session's business **and** contact, so another
  customer's order, booking or invoice is a 404, never "not yours". A new
  thing a customer may see is a new serializer there, with its case in the
  spec.
- **Adopted** (2026-09-26, DEC-039) — **New staff permissions wait for the
  matrix review** (`docs/plans/2026-09-26-permission-matrix.md`). Until then,
  build against today's actions.
- **Adopted** — **Write business rules down.** Plan limits, role actions and what
  a disabled module preserves belong in the ADRs and runbooks
  (`docs/architecture/runbooks/MODULE_ROLLOUT.md`), not only in code.
