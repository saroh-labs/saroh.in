# Security remediation

> Written as an audit (2026-07-31), before any fix. Every finding is stated
> with evidence, impact and acceptance criteria. The **Status** column and the
> status line under each finding are a later pass (#135, 2026-09-26), checked
> against the code on `development`, not against earlier claims. Evidence below
> each status line is the original audit and still describes the code as it
> was then.
>
> Companion to [`current-state-audit.md`](./current-state-audit.md).

---

## Summary

| ID      | Finding                                                | Priority | Status (2026-09-26)                                                                               |
| ------- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| SEC-001 | Idempotency replay silently discards a mutation        | **P0**   | **Fixed** — `2136ec13` (flags, 409 on a changed request); access-session replay `d44751c9` (#135) |
| SEC-002 | Admin authorization fails **open** on missing metadata | **P0**   | **Fixed** — `acd624c6`                                                                            |
| SEC-003 | Support-access enforcement is not wired                | **P0**   | **Fixed**, one criterion open — `a44fc2ee` (#139), `b6a08df2`; no job sweeps lapsed sessions yet  |
| SEC-004 | RLS policies fail open; enforcement disabled           | **P1**   | **Open** — built and tested (`88022d72`, `a5115ef9`, #53), not switched on in any environment     |
| SEC-005 | `Customer.organizationId` nullable — RLS blocker       | **P1**   | **Open** — rows backfilled and writes stamp it (`56e0be6e`); the column is still nullable         |
| SEC-006 | No cross-tenant negative tests                         | **P1**   | **Fixed** for the HTTP path — app-layer specs in 49 files, RLS isolation spec (#53); see below    |
| SEC-007 | Staff cannot revoke another staff member's session     | **P2**   | **Fixed** — `4c39646d`                                                                            |
| SEC-008 | Access denials audit through a swallowing path         | **P2**   | **Fixed** — `4c39646d`, `b6a08df2`                                                                |
| SEC-009 | Concurrent duplicate idempotency keys surface as 500   | **P2**   | **Fixed** — `2136ec13` (P2002 → 409)                                                              |

No item is left reproduced and unfixed. The two **Open** rows aren't
reproductions of a live defect. SEC-004 is a rollout still waiting on an
operator step (`docs/architecture/RLS_ROLLOUT_AND_OPS.md` §1), and SEC-005 is
a schema constraint still to add. Both are listed there as pre-flights.

---

## SEC-001 · Idempotency replay silently discards a mutation

> **Status: Fixed.** The flag mutations go through `IdempotencyService`
> (`common/idempotency/idempotency.service.ts`, `2136ec13`): the same key with
> the same fingerprint replays, and a changed request gets `409`. Opening an
> access session kept its own key and still short-circuited. Replaying a
> revoked session answered `201`, which is the second reproduction above. The
> #135 pass fixed it (`d44751c9`, `admin-access.service.ts`): a replay now re-checks the
> organization, refuses a session that has been revoked or has lapsed, and
> refuses the same key with a different reason (`409`). Tests are in
> `admin-access.service.spec.ts`. Acceptance 1–6 hold.

**P0 · CONFIRMED (reproduced live 2026-07-31) · Effort L**

### Evidence

`apps/api.saroh.in/src/modules/admin/admin.controller.ts:190-195`

```ts
idempotencyKey: [user.id, "flags.global.set", flagKey, dto.idempotencyKey].join(
    ":",
);
```

`apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.ts:82`

```ts
if (await wasAlreadyAudited(tx, controlPlaneAudit)) return;
```

The key encodes actor, operation, target and client key — but **not the value
being written**. A second call with the same key and a different `enabled` is
treated as a duplicate and dropped.

Reproduced against a running API:

```
PUT enabled=false key=K → flag=false
PUT enabled=true  key=K → 200 {"ok":true}, flag STILL false, no audit row
```

The same class of bug exists at `admin-access.service.ts:107-110`, where the
replay returns **before** the organization existence and lifecycle checks:

```ts
const replay = await tx.adminAccessSession.findUnique({
    where: { idempotencyKey },
});
if (replay) return replay; // checks at :112-126 never run
```

Reproduced: open → revoke → replay same key → `201` with the same session id and
original `expiresAt`, still revoked in the DB, no audit event.

### Impact

- **User.** An operator's rollback appears to succeed and does nothing.
- **Business.** During an incident, the flag that is meant to disable a broken
  feature stays on while the tooling reports success. Time-to-mitigate becomes
  unbounded because the operator has no signal that anything is wrong.
- **Security / data integrity.** A revoked support-access session can be
  presented as an active grant. The audit ledger is left with a gap — the second
  intent was never recorded at all.

The admin UI happens to avoid the flag case by minting `crypto.randomUUID()` per
click (`flag-card.tsx:89`), but the API is the contract and any script,
integration or retry wrapper hits it.

### Recommended change

Replace per-endpoint key concatenation with a shared primitive:

- `IdempotencyService` plus an interceptor/decorator.
- Record: operation · method · scope (tenant or platform) · client key ·
  **canonical request fingerprint** · status (`processing|completed|failed`) ·
  stored response · resource ref · expiry.
- Same key + same fingerprint → replay the stored response.
- Same key + **different** fingerprint → `409 Conflict`. Never a silent success.
- Concurrency via a DB unique index; the loser waits for or returns the winner's
  outcome.
- Replay must re-check domain preconditions — it must not short-circuit past
  lifecycle validation as `admin-access` does today.

The distinction that fixes this: **the key identifies a retry; the fingerprint
proves the retry is identical.**

### Alternative considered

_Add `enabled` to the flag key and the session state to the session key._
Rejected — it fixes two call sites and leaves the pattern in place for the next
one. Two of three confirmed idempotency defects are already in different
modules, which is the argument for a primitive rather than a patch.

### Dependencies

None. Can start immediately.

### Acceptance criteria

1. Both reproductions above fail to reproduce.
2. Same key + different payload returns `409`, never `200`.
3. Concurrent duplicates never produce a 500.
4. A failed execution is not cached as a success.
5. Replay after the target resource changed state re-validates, not short-circuits.
6. Audit rows are written exactly once per accepted mutation.

---

## SEC-002 · Admin authorization fails open on missing route metadata

> **Status: Fixed** (`acd624c6`). `PlatformPermissionGuard` refuses a route
> with no permission metadata and names the fix. `@IdentityOnly()` is the
> explicit marker (`/admin/me`). `admin.controller.permissions.spec.ts`
> discovers every route from Nest's router, not from a list.

**P0 · CONFIRMED (read) · Effort M**

### Evidence

`apps/api.saroh.in/src/common/guards/platform-permission.guard.ts:32`

```ts
if (!required || required.length === 0) return true;
```

The comment above it correctly explains the intent (`/admin/me` is
identity-only), but the mechanism is absence-of-metadata rather than an explicit
marker — so _forgetting_ metadata is indistinguishable from _choosing_ to omit it.

The guard test that should catch this is a hand-maintained list:

```ts
// admin.controller.permissions.spec.ts:12-25
type AdminMethod = keyof Pick<AdminController, "me" | "getMetrics" | ...>;
```

A newly added handler is simply absent from `AdminMethod`, and the spec still
passes green.

### Impact

- **User.** None today.
- **Business.** None today.
- **Security.** Every current route is correctly annotated, so nothing is
  exposed **right now**. The defect is that the _default_ is unsafe: the next
  developer who adds `@Get("organizations/:id")` returning tenant detail and
  forgets the decorator exposes it to every staff member — including `AUDITOR`
  (read-only) and `BILLING` — with no error, no log and a green test suite.

This is a latent P0, not an active breach. It is P0 because the cost of fixing
it now is a day, and the cost of discovering it later is a tenant-data
disclosure.

### Recommended change

1. Deny when a route under `/admin/*` carries no permission metadata.
2. Introduce an explicit marker (e.g. `@PlatformIdentityOnly()`) for deliberate
   exceptions, so the intent is declared rather than inferred from absence.
3. Replace the hand-maintained spec with one that **reflects over
   `AdminController.prototype`**, enumerates every `@Get/@Post/@Put/@Delete`
   handler, and asserts each carries either permission metadata or the explicit
   marker.

### Alternative considered

_Global default-deny across the whole API._ Rejected for this cycle: the
`/public/*` surfaces (enquiry, payments, waitlist) are deliberately guardless
and would each need a blanket opt-out, widening the blast radius well beyond
this fix. Worth revisiting once the admin surface is proven.

### Dependencies

None.

### Acceptance criteria

1. Adding a route without metadata fails a test, not production.
2. `/admin/me` still works, via an explicit marker.
3. The reflective test fails if the marker is removed from `/admin/me`.

---

## SEC-003 · Support-access enforcement is not wired

> **Status: Fixed, with one criterion open.** `OrganizationAccessSessionGuard`
> and `@RequireOrganizationAccessSession()` gate the business page, and
> `authorize()` has a production caller (`a44fc2ee`, #139). Denials fail
> closed when they can't be audited (`b6a08df2`). **Still open: acceptance 2.**
> No job sweeps lapsed sessions. A session is marked expired the first time
> someone uses it after `expiresAt`, and `authorize()` refuses it either way,
> so a lapsed session grants nothing. But the row keeps saying "open" until
> it's touched.

**P0 · CONFIRMED · Effort M**

### Evidence

A repo-wide search for `.authorize(` returns the definition in
`apps/api.saroh.in/src/modules/admin/admin-access.service.ts:175` plus five
calls — **all inside `admin-access.service.spec.ts`**. No production caller.

Because `expire()` is only reachable from `authorize()`
(`admin-access.service.ts:273`), sessions are **never marked expired**: rows sit
at `revokedAt: null` past `expiresAt` indefinitely.

### Impact

- **User.** None today.
- **Business.** The audit ledger records `organization.access.open` events that
  assert a reason-bound, time-limited, read-only support control. In a
  compliance review those records describe a control that does not exist. That is
  worse than having no control, because it is a documented false assurance.
- **Security.** No org-detail endpoint exists yet, so nothing is being read
  ungated today. Combined with SEC-002, the next org-data route added is ungated
  **and** unaudited by default.

### Recommended change

Wire it — do not delete. The brief's §6 requires this control.

1. A `@RequireOrganizationAccessSession()` guard that every org-data admin route
   must carry, validating: active · unexpired · unrevoked · matching
   organization · read-only scope.
2. A scheduled job to sweep expired sessions, so `expire()` is reachable and
   state is truthful.
3. Fix the two related defects below in the same change.

If the decision is instead to defer support tooling, **delete the
`organization.access.*` audit events too** — the ledger must not claim controls
that are not enforced.

### Alternative considered

_Leave `authorize()` unwired until an org-detail endpoint exists._ Rejected —
the ledger is already making the claim. The mismatch is the problem, not the
missing endpoint.

### Dependencies

Benefits from SEC-001 (the session replay bug is an idempotency bug).

### Acceptance criteria

1. No `/admin/*` route can read tenant data without a valid session.
2. Expired sessions are marked expired by a job, not left dangling.
3. Attempting to use a revoked or wrong-org session is denied **and audited**.

---

## SEC-004 · RLS policies fail open; enforcement disabled

> **Status: Open (rollout).** Every business-owned table now has an
> empty-string-safe, FORCEd policy (`88022d72`, and #53 for the last 16).
> `rls-coverage.test.ts` fails CI on a table without one (acceptance 4). The
> enforcement proxy and interceptor are built (`a5115ef9`), and the whole
> integration suite passes under a NOBYPASSRLS role with enforcement on (#53).
> Acceptance 1 is **not** met in any environment: the runtime role still
> bypasses RLS and `RLS_ENFORCEMENT` is off. The runbook is
> `RLS_ROLLOUT_AND_OPS.md` §1. Acceptance 3 (an explicit system context for
> jobs) isn't built. Jobs still rely on "no context means every row".

**P1 · CONFIRMED · Effort XL**

### Evidence

`packages/database/prisma/migrations/20260718123258_rls_org_isolation/migration.sql:25`

```sql
CREATE POLICY "org_isolation" ON "Store"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
```

**113 policies across 65 tables** follow this shape. When the GUC is unset the
policy permits everything.

Enforcement is additionally disabled twice over: the `RLS_ENFORCEMENT` flag is
off (the proxy is a pass-through) and the runtime role retains `BYPASSRLS`.

Per `packages/database/src/rls-proxy.ts`, the permissive branch is
**deliberate**: "background jobs and public endpoints run with NO org id in the
ALS … the policies' permissive branch → cross-org access, as the job worker
requires."

### Impact

- **Security.** Today, tenant isolation rests **entirely** on application-layer
  `organizationId` scoping. RLS contributes nothing.
- **Security (after enabling).** RLS would protect the org-scoped HTTP path
  only. Jobs, webhooks and public endpoints remain outside it by design. A future
  code path that forgets to establish context gets silent full-table access
  rather than an error.
- **Assurance.** The brief's §7 asks for RLS tests covering jobs, webhooks and
  public endpoints. Under this design such tests would pass **trivially and
  misleadingly** — they bypass RLS by construction.

### Recommended change

Phased, and **not** before SEC-005.

1. Backfill and require `Customer.organizationId` (SEC-005).
2. Replace absence-of-context with an **explicit system context** for the job
   worker, so "no context" can eventually mean deny rather than allow.
3. Enable `RLS_ENFORCEMENT` in a non-production environment; remove `BYPASSRLS`
   from the runtime role; separate roles for migration and break-glass.
4. Roll out per table group, highest-risk first: Customers, Contacts, Orders,
   Payments, Bookings, Messages, Sites.
5. Keep application-layer scoping — this is defence in depth, not a replacement.
6. Add a policy-coverage report so a new tenant table cannot ship unprotected.

### Alternative considered

_Skip RLS; rely on application scoping._ Defensible — the scoping is
consistent and guard-enforced. Rejected because the platform stores payment,
message and customer data for multiple businesses, where a single missed
`where` clause is a cross-tenant disclosure. The machinery is already built; the
remaining work is operational.

### Dependencies

**Hard prerequisite: SEC-005.**

### Acceptance criteria

1. Runtime role has no `BYPASSRLS`.
2. Cross-tenant read/write/update/delete/relation-traversal are all denied at
   the database, proven by tests (SEC-006).
3. The job worker's cross-org access is explicit and auditable, not implicit.
4. A newly added tenant table without a policy fails a coverage check.

---

## SEC-005 · `Customer.organizationId` is nullable

> **Status: Open.** Acceptance 1 holds in migrated environments: every
> commerce row was backfilled from its store, and the write paths stamp
> `organizationId` (`56e0be6e`, migration `20260830120000`). Acceptance 2 is
> not met, because `Customer.organizationId` (and `Cart`, `Order`,
> `Inventory`) is still `String?`. The RLS runbook counts NULL rows as a
> pre-flight before enforcement. Acceptance 3 (auto-link to a contact) is not
> built.

**P1 · CONFIRMED · Effort M**

### Evidence

`packages/database/prisma/schema.prisma:473-478`

```prisma
model Customer {
  storeId        String        // required
  organizationId String?       // OPTIONAL
  @@unique([storeId, email])
}
```

### Impact

- **Security.** A tenant policy keyed on `organizationId` cannot protect rows
  where it is null. This single column blocks RLS for customer data — the most
  sensitive table in the system.
- **User.** One person shopping at two of a merchant's stores is two records.
- **Business.** The marketing site's claim that one customer record sits behind
  an order and a booking is currently false.

### Recommended change

Staged, each step independently shippable and reversible:

1. Backfill `organizationId` from `Store.organizationId`.
2. Make the column required; add an index.
3. Auto-link on write — creating a `Customer` whose email matches an org
   `Contact` creates the `CustomerIdentityLink` automatically; keep the manual
   path for genuine ambiguity.
4. Only then consider collapsing `Customer` into `Contact`.

### Alternative considered

_Collapse `Customer` into `Contact` immediately._ Rejected for this cycle —
it touches live commerce data and order history in one migration. Steps 1–2
deliver the RLS unblock at a fraction of the risk.

### Dependencies

None. **Blocks SEC-004.**

### Acceptance criteria

1. No `Customer` row has a null `organizationId`.
2. The column is `NOT NULL` in the schema.
3. A customer created through commerce is linked to a matching contact with no
   manual action.

---

## SEC-006 · No cross-tenant negative tests

> **Status: Fixed for the org-scoped HTTP path.** 49 spec files assert that a
> read or write from another organization is refused or finds nothing (e.g.
> `orders.service.org-scope.spec.ts`, `catalogue.org-scope.db.spec.ts`). The
> RLS isolation spec proves it at the database for the tables #53 covered.
> The whole suite also runs under enforcement in CI. Jobs, webhooks and public
> routes still run with no org context by design. Their tests prove scoping
> in the application, not in the database; see SEC-004 acceptance 3.

**P1 · CONFIRMED · Effort M**

### Evidence

675 unit tests, 72 suites, plus a DB-backed integration project. **No test
attempts a cross-tenant read or write.** Isolation is the platform's core safety
property and nothing asserts it.

### Impact

- **Security.** A regression that breaks tenant scoping would ship green.

### Recommended change

DB-backed integration tests (this cannot be unit-tested with a mocked Prisma —
the guarantee is a database guarantee):

- Two organizations, overlapping data.
- Attempt read, write, update, delete, and relation traversal across the
  boundary.
- Cover the job worker, webhook processing and every `/public/*` endpoint.
- Assert `/public/*` derives the owning org **server-side** and ignores any
  client-supplied org.

### Alternative considered

_Defer until RLS is on._ Rejected — the tests are what make the RLS rollout
safe, and they have value against the current application-layer scoping too.

### Dependencies

Requires a provisioned test database (currently absent locally).

### Acceptance criteria

1. Each cross-tenant attempt is denied.
2. Tests fail if scoping is removed from a service.

---

## SEC-007 · Staff cannot revoke another staff member's session

> **Status: Fixed** (`4c39646d`). Revocation is scoped to the organization, not the opener: any staff member with `organization:view-as` can close a colleague's session, and the audit records who revoked whose.

**P2 · CONFIRMED · Effort S**

`admin-access.service.ts:233-240` requires `session.actorUserId ===
input.staff.userId`. A Platform Owner holding all 22 permissions cannot close a
compromised engineer's active support session. Combined with SEC-003 (sessions
never expire), incident response degrades to revoking the whole `PlatformAdmin`
grant or running SQL by hand.

**Change.** Allow a holder of an appropriate permission (`staff:grant` or a new
`support:revoke`) to revoke any session, with the actor recorded.

**Acceptance.** A Platform Owner can revoke another staff member's session and
the audit records who revoked whose.

---

## SEC-008 · Access denials audit through a swallowing path

> **Status: Fixed** (`4c39646d`, `b6a08df2`). `deny()` no longer goes through the swallowing `recordRead`: an unauditable denial fails the request.

**P2 · CONFIRMED · Effort S**

`admin-access.service.ts:303` routes denials through
`AdminAuditService.recordRead()` (`admin-audit.service.ts:84-96`), which catches
every error and only logs. The docstring justifies that for _reads_ — an audit
outage should not turn a successful read into a failure — but `deny()` reuses it
for `NOT_FOUND`, `ORGANIZATION_MISMATCH`, `STAFF_MISMATCH`, `STAFF_REVOKED`.

**Impact.** Under DB pressure the 403 is still returned and a compromised
account probing sessions across organizations leaves no ledger row — precisely
the signal the ledger exists to capture.

**Change.** Treat denials like mutations: fail closed.

---

## SEC-009 · Concurrent duplicate keys surface as 500

> **Status: Fixed** (`2136ec13`). `IdempotencyService` maps the unique-key race (`P2002`) to `409`.

**P2 · CONFIRMED · Effort S**

`wasAlreadyAudited` (`feature-flags.service.ts:292-303`) is SELECT-then-INSERT
inside an interactive transaction under READ COMMITTED. Two concurrent requests
with the same key both read null, both insert, and the loser hits
`AdminAuditEvent_idempotencyKey_key`. Prisma throws `P2002`, which is not an
`HttpException`, and the exception filter has no Prisma mapping — so it
genericises to `500`.

Invariant 7 (no duplicate mutations) **does** hold, but it is upheld by the
unique index rather than the application. The operator sees a server error where
`409` or an idempotent `200` is correct, and retries.

**Change.** Subsumed by SEC-001. Map `P2002` explicitly if SEC-001 slips.

---

## Suggested P0 order

```
SEC-002  (M) ─ smallest blast radius, closes the latent exposure
   ↓
SEC-001  (L) ─ the primitive; fixes both replay defects
   ↓
SEC-003  (M) ─ depends on SEC-001 for the session replay half
```

SEC-004/005/006 are Phase 1 and gated on SEC-005 landing first.
