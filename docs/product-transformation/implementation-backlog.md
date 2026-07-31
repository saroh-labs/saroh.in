# Implementation backlog

> Derived from [`current-state-audit.md`](./current-state-audit.md), 2026-07-31.
> Ordered by priority, then by dependency.

**Priority:** P0 security/data-integrity/launch-blocker · P1 activation or major
architectural correction · P2 growth/efficiency · P3 optimisation.

**Effort:** S ≤1 day · M ≤1 week · L ≤3 weeks · XL >3 weeks.

**Kind:** `BUG` confirmed in repo · `INFER` needs validation ·
`PROD` product recommendation · `FUTURE` opportunity.

---

## Phase 0 — Security and operational correctness

_Nothing in Phase 1+ should start before P0 items land. These protect data and
prevent silent wrong behaviour._

---

### SEC-001 · Idempotency primitive, and fix the two replay defects

**P0 · BUG · L**

**User problem.** An operator retries a rollout change during an incident; the
API reports success and the flag does not move. A support session that was
revoked can be replayed back into what looks like an active grant.

**Technical problem.** Idempotency is per-endpoint string concatenation. The key
identifies a _retry_ but nothing proves the retry is _identical_, so a different
payload under the same key is silently swallowed. See audit §2.1, §2.2.

**Proposed solution.** A shared primitive, then migrate both call sites onto it:

- `IdempotencyService` + interceptor/decorator.
- Record: operation, method, scope (tenant or platform), client key, **canonical
  request fingerprint**, status (`processing|completed|failed`), stored response,
  resource ref, expiry.
- Same key + same fingerprint → replay the stored response.
- Same key + **different** fingerprint → `409`, never a silent success.
- Concurrency via a DB unique index; loser waits or returns the winner's result.
- Replay must not bypass domain preconditions (the `admin-access` bug).

**Affected.** `apps/api.saroh.in/src/common/*` (new), `modules/feature-flags/`,
`modules/admin/`, `packages/database` (new model + migration).

**Migration.** New `IdempotencyRecord` table. Existing `AdminAuditEvent.
idempotencyKey` unique index stays as a backstop.

**Security.** Stored responses must not retain secrets; reuse the audit
metadata redaction rules.

**Testing.** Identical replay · mismatched-fingerprint 409 · concurrent duplicate
· failed execution not cached as success · replay after resource state change
(the revoked-session case) · audit written exactly once.

**Acceptance.** The two reproductions in audit §2.1/§2.2 both fail to reproduce;
mismatched replay returns 409; concurrent duplicates never 500.

---

### SEC-002 · Make admin authorization fail closed

**P0 · BUG · M**

**Technical problem.** `platform-permission.guard.ts:32` returns `true` when
route metadata is absent, and the contract test is a hand-maintained method list
that a new handler is simply missing from. Audit §2.3.

**Proposed solution.**

- Deny when a route under `/admin/*` has no permission metadata.
- Explicit `@PlatformIdentityOnly()` (or similar) for the deliberate exceptions
  (`/admin/me`).
- Replace the hand-maintained spec with a test that **reflects over
  `AdminController.prototype`** and asserts every `@Get/@Post/@Put/@Delete`
  handler carries either permission metadata or the explicit marker.

**Alternatives considered.** A global default-deny guard across the whole API —
rejected for now: the public surfaces (`/public/*`) are deliberately guardless
and would need blanket opt-outs, widening blast radius beyond this fix.

**Acceptance.** Adding a route without metadata fails a test, not production.

---

### SEC-003 · Wire or delete support-access enforcement

**P0 · BUG · M**

**Technical problem.** `AdminAccessService.authorize()` has zero production
callers; the ledger asserts a control that does not exist. `expire()` is
unreachable, so sessions never expire. Audit §2.4.

**Proposed solution.** Either wire `authorize()` into a guard that every future
org-data admin route must carry, **or** delete it and the audit events that
imply it. Do not leave the ledger claiming an unenforced control. Preferred:
wire it, as a `@RequireOrganizationAccessSession()` guard, since §4 of the brief
needs it. Add the expiry sweep as a job.

**Also fix here:** allow a `staff:grant`-holder to revoke another staff member's
session; move `deny()` off the swallowing `recordRead()` path (audit §2.5).

**Acceptance.** No `/admin/*` route can read tenant data without an active,
unexpired, correct-organization, read-only session; denials are durably audited.

---

### OPS-001 · Fix environment/database ambiguity

**P0 · BUG · S**

**Technical problem.** Root `.env` points at `neondb`; the API points at
`saroh-dev`. Root-level `pnpm db:seed` / `db:migrate:deploy` hits the wrong
database. Audit §5.

**Proposed solution.** One documented ownership model: the API owns
`DATABASE_URL`; root scripts either delegate to it or refuse to run without an
explicit `--env` argument. Add a guard that refuses to seed/migrate when the
target DB name does not match an allowlist for the current `NODE_ENV`.

**Acceptance.** No command can migrate or seed a database the caller did not
name explicitly.

---

### OPS-002 · Baseline observability

**P0 · PROD · M**

Structured logs already exist with correlation IDs. Add: error aggregation
(Sentry or equivalent), request/latency/error-rate metrics, queue depth and
job-failure metrics, health/readiness endpoints wired to a probe, release
version metadata.

**Constraint.** No PII, secrets, session tokens, payment credentials or message
contents in telemetry.

**Acceptance.** A failed job, a 5xx spike and a stuck queue are each detectable
without SSH.

---

### OPS-003 · Production migration readiness

**P0 · PROD · S**

Two admin migrations plus the waitlist migration are applied to dev only.
Production has no migration-status visibility and no documented deploy order.

**Acceptance.** `prisma migrate status` runs in CI against each environment;
deploy docs state the order and the rollback position.

---

### DATA-001 · Realistic seed data

**P0 · PROD · S**

The dev DB has 0 contacts, 0 services, 0 bookings, 3 products, 2 orders. This
blocks demos, screenshots, and any UX work on populated states — every screen
under review is an empty state.

**Acceptance.** One command produces a believable multi-module organization;
another removes it cleanly.

---

## Phase 1 — Product architecture and terminology

---

### ARCH-001 · Extract Customer Core from `Contact`

**P1 · PROD · M** _(much cheaper than the brief assumes — see audit §1.1)_

**User problem.** A merchant who only wants bookings is told they need a CRM,
and sees pipeline concepts they will never use.

**Technical problem.** `Contact` already _is_ the org-level person record owning
bookings, messages and consent. Only the module registry couples Appointments
and Communications to CRM.

**Proposed solution.** Introduce a `CUSTOMERS` core capability that is always on
and not user-selectable; retarget `APPOINTMENTS`, `COMMUNICATIONS`,
`AUTOMATIONS` dependencies from `CRM` to it; scope the `CRM` module to
`Lead`/`Pipeline` only. **No table rename in this item** — naming is ARCH-003.

**Risk.** Low. Registry + readiness change; no data migration.

**Acceptance.** Enabling Appointments does not enable Sales-CRM surfaces.

---

### ARCH-002 · Unify `Customer` and `Contact` identity

**P1 · BUG+PROD · L**

**User problem.** The marketing site now claims "the same customer record is
behind an order and a booking". Today that is **false** unless a human pressed a
link button. Audit §1.2.

**Technical problem.** `Customer` is Store-scoped with a **nullable**
`organizationId`; reconciliation is manual via `CustomerIdentityLink.
linkedByUserId`.

**Proposed solution, staged:**

1. Backfill and make `Customer.organizationId` **required** _(also unblocks
   RLS — see SEC-004)_.
2. Auto-link on write: creating a `Customer` with an email matching an org
   `Contact` creates the link automatically; keep manual link for ambiguity.
3. Read model: one customer view merging commerce + CRM + bookings.
4. Only then consider collapsing the models.

**Risk.** Medium-high — touches live commerce data. Each step independently
shippable and reversible.

**Acceptance.** A person who books and then orders appears once, with no manual
action.

---

### ARCH-003 · Resolve `Project` vs `Store`

**P1 · PROD · M**

**Technical problem.** Two competing sub-org containers: module selection hangs
off `Project`, commerce data off `Store`. `Project` has no other domain meaning
(audit §1.4).

**Proposed solution.** Decide whether `Store` is a _kind of_ Project, or Project
disappears into Organization for single-location merchants. **Analysis and ADR
first — no rename before the migration consequences are written down.** Expose a
concrete label (Store / Location / Brand) in the UI regardless of the internal
model.

**Acceptance.** An ADR states what each container means and what merchants see.

---

### SEC-004 · Phased RLS rollout

**P1 · PROD · XL**

**Prerequisite: ARCH-002 step 1.** A nullable `Customer.organizationId` cannot
be protected by a tenant policy (audit §3.2).

Runtime role loses `BYPASSRLS`; separate roles for migration and break-glass;
**transaction-local** tenant context (pooled connections make session-local
unsafe); start with Customers, Contacts, Orders, Payments, Bookings, Messages,
Sites; keep application-layer scoping as well; add a policy-coverage report so a
new tenant table cannot silently ship unprotected.

**Testing.** Cross-tenant read/write/update/delete/relation-traversal negatives,
plus jobs, webhooks and public endpoints. **This coverage does not exist today**
(audit §6).

---

### ARCH-004 · Domain events

**P1 · PROD · L**

Typed event registry emitted transactionally with business mutations
(outbox-style) on the existing durable queue, so Automations consume stable
events instead of reaching into modules.

---

## Phase 2 — Activation and merchant workspace

- **UX-001 · P1 · L** — Outcome-based navigation. The vocabulary already exists
  in `/onboarding/modules` ("Sell products", "Show up online") but is abandoned
  after onboarding; the sidebar is the module registry rendered as nav
  (audit §4.2). Carry the onboarding language into the shell.
- **UX-002 · P1 · L** — Merchant command centre: attention, exceptions, next
  action. Home already lists next-best-actions; extend rather than replace.
- **UX-003 · P1 · M** — Empty-state system. Blocked on DATA-001 for anything
  populated.
- **UX-004 · P2 · M** — Standard patterns: filters, bulk actions, drawers,
  permission-denied. Partially present via `@saroh/ui` `DataTable`/`EmptyState`.
- **UX-005 · P2 · S** — Fix 28 pre-existing lint errors in `app.saroh.in`
  without behaviour change.
- **PROD-001 · P2 · M** — Activation funnel instrumentation.

---

## Phase 3 — Commerce and website experience

- **SITE-001 · P1 · M** — Replace the `getSiteData` stub
  (`fetchers.ts:51` returns `null` always).
- **SITE-002 · P1 · L** — Brand fields on the publication snapshot. The
  `--site-*` render layer already exists and is fed by defaults (commit
  `2b2add5`); nothing populates it. Logo, colours, fonts, radius, theme mode.
- **SITE-003 · P2 · M** — Versioned snapshots, draft vs published, rollback.
- **SITE-004 · P2 · S** — Contrast validation on merchant brand colours; the
  token checker written for the design system is directly reusable.
- **SITE-005 · P2 · S** — Storefront error states that do not leak tenant info.

---

## Phase 4 — Global readiness and launch

- **GLOB-001 · P2 · S** — Change the lone `@default("INR")`
  (`schema.prisma:2385`) and the one hardcoded `₹`
  (`create-service-form.tsx`). **This is nearly the whole of §9** — see audit §1.3.
- **GLOB-002 · P2 · M** — Verify money is stored in minor units everywhere;
  derive all formatting from org/store settings.
- **GLOB-003 · P3 · L** — Provider adapter contracts for payments and shipping.
- **OPS-004 · P1 · M** — CD pipeline, after OPS-001/003 make deploys safe.
- **LAUNCH-001 · P1 · S** — Reconcile marketing claims with reality: the site
  says "waitlist" while the product looks built, and now claims unified customer
  records that ARCH-002 has not delivered yet.

---

## Sequencing

```
SEC-001 ─┐
SEC-002 ─┼─ Phase 0 (parallel) ─→ ARCH-001 ─→ UX-001/002 ─→ SITE-001/002
SEC-003 ─┤                        ARCH-002 ─→ SEC-004
OPS-001 ─┤                          │
OPS-002 ─┤                          └─→ ARCH-003 (ADR first)
OPS-003 ─┤
DATA-001 ┘  (unblocks all UX work)
```

**Hard prerequisites:** ARCH-002 step 1 before SEC-004 · OPS-001/003 before
OPS-004 · DATA-001 before UX-003.
