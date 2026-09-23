---
title: "feat: The admin console — one operator surface for the whole instance"
type: feat
status: active
date: 2026-09-23
origin: docs/plans/2026-07-27-admin-control-plane-design.md
supersedes:
    - docs/plans/2026-07-27-admin-control-plane-design.md
    - docs/plans/2026-07-27-admin-control-plane-implementation-plan.md
issues: [127, 129, 130, 131, 132, 133, 134, 135, 139]
---

# feat: The admin console — one operator surface for the whole instance

## Summary

`admin.saroh.in` becomes the one place an operator controls everything on a
Saroh instance: every business on it, every person in those businesses, who on
the operator's own team may do what, which modules and plans each business
holds, and whether the machinery behind it all is working.

Today it is three screens — a counters dashboard, feature flags and an audit
ledger — over a control plane where **14 of 22 staff permissions have no
endpoint behind them**. Granting a colleague admin access means running SQL.
Nothing can suspend a business, read a queue, or tell you who is waiting on the
waitlist.

So this is not a re-skin. It is roughly **one part screens to three parts API
and schema**, and the access model is its spine: every new endpoint declares
the permission it needs, and the console only ever shows what the caller's
grant allows.

A design exists for the console's shape — `Saroh Admin Console.dc.html` in the
claude.ai design project `1fef6fb9-c3b1-4c04-bfc2-86d09cb32a65`, alongside
`support.js` to render it. It is a reference, not a specification; where this
plan differs from it, the difference is recorded below.

## Problem frame

**Who.** The people who run an instance. On saroh.in that is the maintainer and
a small support team. On someone else's instance it is whoever installed it.
The console does not assume it is Saroh's own.

**What they need to do, in the order a real day asks for it:**

1. Someone emails for help → find their business, see everything about it,
   change the one thing that is wrong.
2. A colleague joins or leaves → give or take away access, with an expiry.
3. Something looks broken → find out what, and retry it safely.
4. A new capability is ready → roll it out to one business, then all.
5. Someone is waiting to be let in → see the queue, invite a batch.

**Why now.** ADR-007 shipped a module (`COURSES`) whose rollout flag had to be
set with a database query, and the billing work put money on the instance with
no operator view of it. The gap is now costing time on every release.

## Requirements

### Access — who may do what, and how that is controlled

- **R1.** Staff access is granted, amended, expired and revoked **in the
  console**, never in SQL. A grant carries roles, a written reason, and an
  optional expiry. The last active Platform Owner cannot be removed, revoked or
  expired.
- **R2.** The permission vocabulary stays a **closed list in the repository**
  (`admin-permissions.ts`), so what a role may do is reviewable in a diff and
  identical on every instance. Grants live in the database; the vocabulary does
  not.
- **R3.** Every endpoint declares the permission it requires. An endpoint that
  declares none is refused (already true — `PlatformPermissionGuard` fails
  closed); this plan adds nothing that relies on a default.
- **R4.** Reading a business's own data requires a **reason-bound, time-boxed,
  READ_ONLY access session**, as today. Opening, reading under, closing,
  expiring and being denied are all audited. No silent impersonation: a view-as
  session is visible to the operator on screen and attributable in the ledger.
- **R5.** Every operator action is attributable to a person, carries a reason
  where it changes another business's state, and is written to the admin ledger
  in the same transaction as the change.

### People — the operator's team and every merchant's team

- **R6.** A **person directory across the instance**: find someone by email,
  see every business they belong to and their role in each, whether their email
  is verified, when they were last active, and their open sessions. Email
  search requires `organization:pii:read`.
- **R7.** An operator with `organization:people:write` can change a member's
  role, remove a member, and resend or withdraw an invitation in any business —
  attributed to the operator, never disguised as the merchant.
- **R8.** An operator can end a person's sessions when an account is
  compromised.

### Businesses

- **R9.** A **business directory**: search by name, slug or id; filter by
  lifecycle, plan, module and health; cursor-paged; never loading every row.
- **R10.** A **business page** gathering what the operator needs in one place:
  its facts and lifecycle, its people and roles, its modules, its plan and
  limits with usage against them, recent activity, both audit streams
  (the business's own and the operator actions taken on it, visibly separate),
  and operator notes.
- **R11.** Operator actions on a business, each behind a confirmation that
  states what will change: **suspend** (types the business name to confirm),
  **lift a suspension**, **change plan**, **start or extend a trial**, **raise a
  limit** (time-bounded), and **schedule deletion** with a retention window that
  can be cancelled. Suspension blocks new activity; deletion is never immediate.
- **R12.** Modules per business: enable, disable and repair, honouring the
  dependency rules the module registry already declares (ADR-003).

### The machinery

- **R13.** A **health board** whose checks keep their place whether green or
  red, each reading real data or saying plainly that it is not measured on this
  instance: the renewal job, the job queue, webhook deliveries, provider health,
  migrations applied, storage, version, and failed sign-ins.
- **R14.** Jobs and webhook deliveries can be inspected and retried or replayed.
  Anything bulk or destructive shows a **dry run first** — what would be
  affected, what would be skipped, what is unsafe — and executes as a durable,
  resumable operation with a record.
- **R15.** Provider health is rolled up across the instance, with a recheck.

### Releases and the front door

- **R16.** Flags carry metadata — what they are for, who owns them, and when
  they should be deleted — and an **effective-value inspector** that explains
  why a given business sees the value it sees.
- **R17.** The **waitlist** has an operator surface: who is waiting, by source
  and age, with a batch invite that sets `invitedAt`. (The model is finished and
  write-only today; `PRODUCT.md` makes this the gate on open signup.)

### The surface itself

- **R18.** The console is **unmistakably not a merchant surface**, while reusing
  every workspace primitive: `PageHeader`, `DataView`, `DataState`, the rail's
  three widths, the shared tokens and motion. It ships **dark-first** with its
  own single accent.
- **R19.** It works at 320px, 390px and 1440px, honours reduced motion, has no
  hover-only affordance, and every one of its states — loading, empty, denied,
  failed, partial — is one of the named product states.
- **R20.** Nothing in the console assumes Saroh's own instance: no hard-coded
  plan names, pricing or internal concepts. What differs per instance is read
  from that instance.

## Scope boundaries

**In scope:** everything in R1–R20.

**Deferred, deliberately:**

- **Incidents.** A `PlatformIncident` model and timeline. The July design has
  it; nothing in it is needed to answer "what is broken" for one instance, and
  it is a second tracker to maintain. Revisit when an operator asks for it.
- **Flag cohorts, percentage rollout and scheduled stages.** R16 stops at
  metadata and the inspector. Named-cohort and percentage rollout are real work
  and nothing is waiting on them.
- **Charging for Saroh itself.** The design shows "Saroh invoices" on a
  business page; Saroh's own pricing is not settled, and an instance that is
  self-hosted has no such invoices. Plan and limits are in scope; billing the
  merchant for Saroh is not.
- **Write-mode view-as.** Access sessions stay READ_ONLY. An operator who must
  change something uses an attributed operator action, not a disguise.
- **A fleet view across instances.** One console, one instance.

## Key technical decisions

- **D1. Extend the control plane, do not fork it.** `PlatformAdminGuard`,
  `PlatformPermissionGuard`, `AdminAccessSession` and the admin audit stream
  already exist and are sound. Every new endpoint mounts under `/admin/*`
  behind the same guards.
- **D2. Cross-tenant reads run outside organization context, explicitly.**
  Row-level security enforces `org_isolation` on 66 tables, and the admin plane
  is the one caller that legitimately reads across businesses. Each such query
  is written in one place per module, named as a cross-tenant read, and covered
  by a test that proves an ordinary tenant path still cannot do it.
  `docs/patterns/backend-auth-and-access.md` gets the rule.
- **D3. The permission vocabulary is code; grants are data** (R2). Adding a
  permission is a pull request. This is what lets an instance operator control
  access with confidence, and what keeps two instances comparable.
- **D4. Durable operations get a model.** `AdminOperation` plus per-item
  results, so a bulk retry survives a restart, can be resumed, and leaves a
  record. Dry run is the same code path with execution withheld.
- **D5. Both audit streams stay separate, and the business page shows both.**
  The business's own `AuditEvent` answers "what did this business do"; the
  admin `AdminAuditEvent` answers "what did an operator do to it". Merging them
  would lose which is which; showing only one loses the story.
- **D6. `DataView` moves into `@saroh/ui`.** It lives in `app.saroh.in` today.
  The console needs the same list behaviour, and a second copy would drift. The
  move is mechanical; the workspace keeps a re-export so no screen changes.
- **D7. The console's skin is a token override, not a second token set.** Same
  token names, same components; `apps/admin.saroh.in` sets dark as its default
  and overrides the accent. One accent per screen still holds.
- **D8. Health checks degrade honestly.** A check that cannot be measured on
  this instance renders as "not measured here" rather than a green tick or an
  invented figure. Storage and version are the likely cases on a self-hosted
  instance.

## Deferred to implementation

- Whether provider health rolls up by reusing `ProviderHealthService` per
  organization or needs its own cross-tenant query (D2 applies either way).
- Whether the job queue view needs its own index on `Job` beyond
  `[status, runAt]` at real volume.
- The exact shape of the entitlement usage read (limit vs usage per key) —
  depends on what `Plan.entitlements` actually carries per instance.

## Implementation units

Sequenced so no screen ships over a stub: each unit lands its API, its
permission, its tests and its screen together.

### U1. The console shell, dark-first

**Goal:** the frame every later screen mounts into (R18, R19).
**Files:** `apps/admin.saroh.in/components/admin-shell.tsx`,
`app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`; new
`components/console-nav.tsx`; `packages/ui/src/components/ui/data-view/**`
(moved from `apps/app.saroh.in/components/shared/data-view/**`, D6) with a
re-export left behind.
**Approach:** rail with the three widths the workspace uses, fed by one nav
source; `next-themes` with dark as the default; accent override per D7;
`PageContainer` widths; every screen on `PageHeader`.
**Test scenarios:** nav filtered by permission; the rail collapses to icons at
1100px and to a drawer below 760px; `check:routes` passes; the workspace's own
DataView tests still pass after the move.
**Verification:** the three existing screens render unchanged in shape, in dark,
at 320/390/1440.

### U2. Staff governance — grant, expire, revoke (issue #132)

**Goal:** R1, R2. Nobody needs SQL to give a colleague access.
**Files:** new `apps/api.saroh.in/src/modules/admin/staff.controller.ts`,
`staff.service.ts` (+ specs); `apps/admin.saroh.in/app/team/**`.
**Approach:** `GET /admin/staff`, `POST /admin/staff`, `PATCH
/admin/staff/:id`, `DELETE /admin/staff/:id`, all `staff:read` / `staff:write`.
Append-only assignments as the schema already models. The last active Platform
Owner is protected in the service, not the screen.
**Test scenarios:** the last owner cannot be revoked, expired or demoted —
by any route; an expired assignment stops working on the next request; a
grant writes its reason to the ledger; a non-owner cannot grant.
**Verification:** grant a second operator, expire them, revoke them; the ledger
tells the whole story.

### U3. The business directory (issue #129)

**Goal:** R9.
**Files:** `admin.controller.ts` (+ `admin-organizations.service.ts` new),
`apps/admin.saroh.in/app/businesses/page.tsx`.
**Approach:** `GET /admin/organizations` gains search, filters and cursor
paging behind `organization:read`; the existing id/name/slug shape stays for
the flag picker under an explicit `?for=picker`.
**Test scenarios:** search by slug, name and id; filter by lifecycle and
module; a page boundary does not drop or repeat a row; email search is refused
without `organization:pii:read`.
**Verification:** the seeded five businesses list with state, modules, plan,
people and last active.

### U4. The business page (issues #129, #130)

**Goal:** R10, and the read half of R12.
**Files:** `admin-organization-view.service.ts` (extend),
`apps/admin.saroh.in/app/businesses/[organizationId]/**`.
**Approach:** one read behind a reason-bound access session (R4) returning
facts, people, modules, plan and limits, recent activity and both ledgers
(D5). Panels degrade one at a time.
**Test scenarios:** no access session → refused, and the refusal is audited;
each panel's failure leaves the others rendered; a business on another instance
is a 404, not a 403.
**Verification:** open a seeded business; every panel carries real data.

### U5. Operator actions on a business (issue #130)

**Goal:** R11, R5, and the write half of R12.
**Files:** `admin-lifecycle.service.ts` (new; wires the existing
`assertOrganizationLifecycleTransition`), `admin-modules.service.ts` (new),
`apps/admin.saroh.in/components/business/action-panel.tsx`.
**Approach:** suspend / lift / schedule deletion / cancel deletion / change plan
/ trial / raise a limit, each `organization:lifecycle:write` or
`subscription:override`, each taking a reason, each audited in the same
transaction. Confirmation states the effect; suspend types the name.
**Test scenarios:** every illegal transition is refused with its reason; a
suspended business refuses new authenticated and public activity; deletion is
scheduled and cancellable; a raised limit expires.
**Verification:** suspend and lift a seeded business; the merchant workspace
reflects it.

### U6. People across the instance (issues #129, #130)

**Goal:** R6, R7, R8.
**Files:** new `admin-people.service.ts` + controller routes;
`apps/admin.saroh.in/app/people/**`.
**Approach:** find a person, list their memberships and roles, end their
sessions, change a role or remove them from a business, resend or withdraw an
invitation. PII behind `organization:pii:read`.
**Test scenarios:** email search refused without the permission; a role change
is attributed to the operator in both ledgers; ending a session actually ends
it; the last owner of a business cannot be demoted.
**Verification:** find the demo login, see its five businesses and roles.

### U7. Jobs and the queue (issue #131)

**Goal:** the job half of R13 and R14.
**Files:** new `admin-jobs.service.ts` + controller; `app/operations/jobs/**`.
**Approach:** queue and dead-letter reads behind `jobs:read`; retry behind
`jobs:retry`, always dry-run first, executing as an `AdminOperation` (D4).
**Test scenarios:** a dry run changes nothing; a retry is idempotent; a bulk
retry resumes after a restart; the renewal job's own chain is never
double-scheduled by a retry.
**Verification:** fail a job deliberately, see it, retry it.

### U8. Webhooks and providers (issue #131)

**Goal:** the rest of R13, plus R15.
**Files:** `admin-webhooks.service.ts`, `admin-providers.service.ts`, screens
under `app/operations/**`.
**Approach:** delivery list with status and error, replay behind
`webhooks:replay` with a dry run; provider roll-up and recheck behind
`providers:read` / `providers:recheck` (D2 applies).
**Test scenarios:** a replay cannot double-apply an already-processed event;
recheck records its result; a provider that is down renders as `failed`, not as
an empty list.

### U9. The health board (R13)

**Goal:** the screen the console opens on.
**Files:** `admin-health.service.ts`, `app/health/page.tsx`.
**Approach:** one read composing the checks from U7/U8 plus migrations,
storage, version and sign-in failures. Fixed order; each check keeps its place;
anything unmeasurable says so (D8).
**Test scenarios:** one failing check does not blank the board; an
unmeasurable check renders as "not measured here"; the board is legible at
320px.

### U10. Releases (issue #133, part)

**Goal:** R16.
**Files:** `flags.ts` (metadata per key), `feature-flags.service.ts`,
`app/releases/**`.
**Approach:** each flag declares what it is for, who owns it and when it should
go; an inspector explains a business's effective value and where it came from.
Cohorts and scheduling stay out (Scope boundaries).
**Test scenarios:** the inspector's explanation matches what the resolver
actually returns, including the unknown-key fail-closed path; a flag with no
metadata fails the check that every flag has a deletion plan.

### U11. The waitlist (issues #250, #261)

**Goal:** R17.
**Files:** `admin-waitlist.service.ts` + controller; `app/waitlist/page.tsx`.
**Approach:** who is waiting by source and age; batch invite sets `invitedAt`
and is audited.
**Test scenarios:** inviting twice does not re-invite; the count matches the
directory; the public POST stays guardless and unchanged.

### U12. Documentation and the decision record

**Goal:** the rules survive this plan.
**Files:** `docs/patterns/backend-auth-and-access.md` (D2, D3),
`docs/architecture/DECISIONS.md` (the console's framing, D7's skin, the
deferrals), `docs/architecture/adr/` if the framing warrants an ADR,
`apps/admin.saroh.in/AGENTS.md` (new), root `AGENTS.md` Triggers row.

## System-wide impact

- **Row-level security** gains its first deliberate cross-tenant reader (D2).
  The rule must be written down before U3, not after.
- **The audit ledger** grows a great deal busier. Its read path is already
  cursor-paged and audits itself.
- **`@saroh/ui`** gains `DataView` (D6), which every app may then use.
- **Unchanged:** merchant-facing behaviour, except where an operator
  deliberately changes a business's state (U5), which the merchant sees as the
  state change it is.

## Risks and dependencies

- **Issue #135 declares itself a gate** — seed data, fail-closed authz,
  idempotency, support-access wiring, probes — and says the waitlist stays shut
  until it lands. Parts of it are now done (fail-closed guards, #139's wiring).
  **Confirm what of #135 remains before U11**, and close it or re-scope it.
- **Issue #139 looks substantially implemented** (the guard calls `authorize()`,
  SEC-007 and SEC-008 are in the code) but is still open. Verify and close it
  rather than planning around it.
- **A console that can suspend a business is a console that can take a business
  down.** Every destructive action needs its confirmation, its reason and its
  reversal tested before it ships — U5's tests are not optional.
- **Cross-tenant queries at real volume.** The directory and people search read
  across every business; both need their indexes checked against seeded
  showcase volume, not five rows.
- **Fourteen permissions currently name nothing.** As each unit lands, its
  permission stops being decorative. Any left unreachable at the end should be
  removed from the vocabulary rather than left as a promise.

## Phased delivery

1. **The support path** — U1, U3, U4, U5. After this, an email from a merchant
   can be answered without a database client.
2. **Access** — U2, U6. After this, nobody needs SQL to grant access, and a
   compromised account can be dealt with.
3. **The machinery** — U7, U8, U9. After this, the console answers "what is
   broken" and can safely retry it.
4. **The rest** — U10, U11, U12.

Each phase is independently useful, and each ends with the console honestly
representing what exists — no screen for a capability that is not there.

## Sources

- Design reference: `Saroh Admin Console.dc.html` (+ `support.js`), claude.ai
  design project `1fef6fb9-c3b1-4c04-bfc2-86d09cb32a65`.
- Superseded: `docs/plans/2026-07-27-admin-control-plane-design.md` (Approved,
  Phase A landed) and its implementation plan.
- Prototype: `docs/prototypes/admin-control-plane-flow/`.
- Constraint: `docs/product-transformation/information-architecture.md:225` —
  the operator surface must never be mistaken for a tenant surface.
- Issues: #127 (parent), #129, #130, #131, #132, #133, #134 (release gate),
  #135 (Phase 0 gate), #139, plus #124 (saved views) and #103 (observability).
