# Implementation backlog

> Audit-only cycle. **Nothing here is implemented.**
> Derived from [`current-state-audit.md`](./current-state-audit.md), revised
> 2026-07-31 after the full audit.

**Priority** P0 security/data-integrity/launch-blocker · P1 activation or major
architectural correction · P2 growth/efficiency · P3 optimisation.

**Effort** S ≤1 day · M ≤1 week · L ≤3 weeks · XL >3 weeks.

**Kind** `BUG` confirmed · `INFER` needs validation · `PROD` recommendation ·
`FUTURE` opportunity.

Security items carry full detail in
[`security-remediation.md`](./security-remediation.md) and are summarised here.

---

## Revisions from the first pass

| Item       | Was                              | Now                             | Why                                                                        |
| ---------- | -------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `SITE-001` | "Replace the site-data stub" — M | **Delete dead code** — S        | `getSiteData` has zero callers; the real pipeline works (audit §7)         |
| `SITE-003` | "Add versioned snapshots" — M    | **Rollback UI only** — S        | Versioning already exists; `Publication` is immutable, republish = new row |
| `SEC-004`  | "Enable RLS"                     | **Fix fail-open design first**  | Policies permit all when the GUC is unset (audit §8.3)                     |
| `GLOB-002` | "Verify minor units" — M         | **Money is `Decimal(_,2)`** — L | Hard-codes a 2-decimal assumption; JPY/KWD do not fit (audit §14)          |
| —          | —                                | **`OPS-005` added**             | `/health` returns static `ok`; cannot fail, so it is not a probe           |
| —          | —                                | **`SEC-006` added**             | No cross-tenant negative tests exist at all                                |

---

## Phase 0 — Security and operational correctness

_Nothing in Phase 1+ should start before these land._

| ID       | Title                                    | Pri | Kind | Effort |
| -------- | ---------------------------------------- | --- | ---- | ------ |
| SEC-002  | Admin authorization fail-closed          | P0  | BUG  | M      |
| SEC-001  | Idempotency primitive + two replay fixes | P0  | BUG  | L      |
| SEC-003  | Wire support-access enforcement          | P0  | BUG  | M      |
| OPS-001  | Environment/database ambiguity           | P0  | BUG  | S      |
| OPS-003  | Production migration readiness           | P0  | PROD | S      |
| DATA-001 | Realistic seed data                      | P0  | PROD | S      |
| OPS-002  | Baseline observability                   | P0  | PROD | M      |
| OPS-005  | Real health/readiness probe              | P0  | BUG  | S      |

### SEC-002 · Admin authorization fail-closed

**P0 · BUG · M** — full detail in `security-remediation.md` §SEC-002.

`platform-permission.guard.ts:32` returns `true` on missing metadata; the
contract test is a hand-maintained list. Nothing is exposed today, but the
default for the next route is ungated.
**Depends on** nothing. **Do first** — smallest blast radius of the three P0s.
**Acceptance** adding a route without metadata fails a test, not production.

### SEC-001 · Idempotency primitive

**P0 · BUG · L** — full detail in `security-remediation.md` §SEC-001.

Key identifies a retry but nothing proves it is _identical_. Reproduced: same
key + opposite payload returns `200` and changes nothing. Same class of bug in
`admin-access` returns a revoked session as a fresh grant.
**Depends on** nothing. **Migration** new `IdempotencyRecord` table.
**Acceptance** both reproductions fail to reproduce; mismatch → `409`;
concurrent duplicates never 500.

### SEC-003 · Wire support-access enforcement

**P0 · BUG · M** — full detail in `security-remediation.md` §SEC-003.

`authorize()` has zero production callers; the ledger claims a control that does
not exist; `expire()` is unreachable so sessions never expire. Includes SEC-007
(cross-staff revocation) and SEC-008 (denials audit fail-closed).
**Depends on** SEC-001 for the replay half.

### OPS-001 · Environment/database ambiguity

**P0 · BUG · S**

**Problem.** Root `.env` → `neondb`; API `.env` → `saroh-dev`. Root-level
`pnpm db:seed`/`db:migrate:deploy` targets the wrong database (audit §9).
**Impact.** Data-integrity: a seed against the wrong DB is unrecoverable
without a restore.
**Change.** One documented ownership model; a guard that refuses to seed or
migrate unless the target DB name matches an allowlist for the current
`NODE_ENV`.
**Alternative.** Delete the root `.env` entirely — rejected, other tooling reads
it; the guard is the safer fix.
**Acceptance.** No command can migrate or seed a database the caller did not
explicitly name.

### OPS-003 · Production migration readiness

**P0 · PROD · S**

Three migrations are dev-only. No migration-status visibility in any pipeline;
two sat unapplied and undetected until this session.
**Acceptance.** `prisma migrate status` runs in CI per environment; deploy order
and rollback position are documented.

### DATA-001 · Realistic seed data

**P0 · PROD · S**

0 contacts, 0 services, 0 bookings, 3 products, 2 orders. **Blocks all
populated-state UX work** — every screen reviewed was an empty state. Also
blocks demos and screenshots.
**Note.** `packages/database/src/seed.ts` exists but creates no credential, so
the seeded user cannot log in.
**Acceptance.** One command produces a believable multi-module organization;
another removes it cleanly.

### OPS-002 · Baseline observability

**P0 · PROD · M**

**Present already:** correlation IDs, structured JSON logger, redaction
(`authorization`, `cookie`, `x-api-key`, `password*`, `token`), guard-denial
logging. **Absent:** metrics, tracing, error aggregation.
**Change.** Error aggregation; request/latency/error-rate, queue-depth and
job-failure metrics; release version metadata.
**Constraint.** No PII, secrets, tokens, payment credentials or message contents
in telemetry.
**Acceptance.** A failed job, a 5xx spike and a stuck queue are each detectable
without SSH.

### OPS-005 · Real health/readiness probe

**P0 · BUG · S**

`modules/health/health.controller.ts` returns a static object — `status:"ok"`
unconditionally, with no DB or queue check. **It cannot fail**, so an
orchestrator will route traffic to an instance that cannot reach Postgres.
**Change.** Split liveness (process up) from readiness (DB reachable, migrations
applied, queue reachable).
**Acceptance.** Readiness fails when the DB is unreachable.

---

## Phase 1 — Product architecture and terminology

| ID       | Title                                          | Pri | Kind | Effort |
| -------- | ---------------------------------------------- | --- | ---- | ------ |
| ARCH-001 | Customer Core from `Contact`                   | P1  | PROD | M      |
| SEC-005  | `Customer.organizationId` NOT NULL + auto-link | P1  | BUG  | M      |
| ARCH-003 | Resolve `Project` vs `Store` (ADR)             | P1  | PROD | M      |
| SEC-006  | Cross-tenant negative tests                    | P1  | BUG  | M      |
| SEC-004  | RLS: fix fail-open, then enable                | P1  | PROD | XL     |
| ARCH-004 | Domain events                                  | P1  | PROD | L      |

### ARCH-001 · Customer Core from `Contact`

**P1 · PROD · M** _(cheaper than the brief assumes — audit §4.1)_

**User problem.** A studio that only takes bookings is told it needs a CRM.
**Technical.** `Contact` already is the org-level person record owning bookings,
messages and consent. Only the registry couples the modules to CRM.
**Change.** Always-on `CUSTOMERS` capability; retarget three `dependencies`
edges; scope `CRM` to `Lead`/`Pipeline`. **No table rename** — that is ARCH-003.
**Alternative.** Rename `Contact` → `Customer` now — rejected, collides with the
existing `Customer` model and forces ARCH-002 early.
**Risk.** Low; registry + readiness only, no data migration.
**Acceptance.** Enabling Appointments does not surface Sales-CRM.

### SEC-005 · `Customer.organizationId` NOT NULL + auto-link

**P1 · BUG · M** — detail in `security-remediation.md` §SEC-005.

Nullable tenant key on the most sensitive table. **Hard prerequisite for
SEC-004.** Staged: backfill → require → auto-link on write → _only then_
consider collapsing models.
**Acceptance.** No null `organizationId`; a commerce customer links to a
matching contact with no manual action.

### ARCH-003 · Resolve `Project` vs `Store`

**P1 · PROD · M**

Two competing sub-org containers (audit §5). Three options in
[`domain-boundaries.md`](./domain-boundaries.md) §4.
**Requires a product decision.** ADR before any rename; migration consequences
written down first.

### SEC-006 · Cross-tenant negative tests

**P1 · BUG · M**

No test attempts a cross-tenant read or write. Isolation is the core safety
property and nothing asserts it.
**Depends on** a provisioned test database.
**Acceptance.** Cross-tenant read/write/update/delete/traversal all denied;
tests fail if scoping is removed from a service.

### SEC-004 · RLS: fix fail-open, then enable

**P1 · PROD · XL** — detail in `security-remediation.md` §SEC-004.

113 policies across 65 tables already exist, with a correct transaction-local
proxy. Two blockers: policies **permit all** when the GUC is unset, and the
runtime role has `BYPASSRLS`.
**Depends on** SEC-005 (hard), SEC-006 (to make rollout safe).

### ARCH-004 · Domain events

**P1 · PROD · L**

Typed events emitted transactionally with their mutation (outbox), on the
existing durable queue, so Automations consume a stable contract. Event set
proposed in `domain-boundaries.md` §5.

---

## Phase 2 — Activation and merchant workspace

| ID       | Title                                  | Pri | Kind | Effort |
| -------- | -------------------------------------- | --- | ---- | ------ |
| UX-001   | Outcome-based navigation               | P1  | PROD | L      |
| UX-002   | Merchant command centre                | P1  | PROD | L      |
| UX-006   | Unified customer record screen         | P1  | PROD | M      |
| UX-003   | Empty-state system                     | P1  | PROD | M      |
| PROD-001 | Activation funnel instrumentation      | P2  | PROD | M      |
| UX-004   | Standard interaction patterns          | P2  | PROD | M      |
| UX-005   | Clear 28 lint errors in `app.saroh.in` | P2  | BUG  | S      |

**UX-001** is the highest value-per-effort item in the whole backlog: the
outcome vocabulary already exists in `/onboarding/modules` and is discarded
after onboarding (audit §6.2). This is largely renaming and regrouping.

**UX-006** depends on SEC-005 — the screen cannot be built while the two
identity records are linked only manually.

**UX-003** depends on DATA-001.

---

## Phase 3 — Commerce and website

| ID       | Title                                         | Pri | Kind | Effort |
| -------- | --------------------------------------------- | --- | ---- | ------ |
| SITE-002 | Brand fields on the publication snapshot      | P1  | PROD | L      |
| SITE-001 | Delete dead `getSiteData`                     | P2  | BUG  | S      |
| SITE-003 | Publication rollback UI                       | P2  | PROD | S      |
| SITE-004 | Contrast validation on merchant brand colours | P2  | PROD | S      |
| SITE-005 | Storefront error states                       | P2  | PROD | S      |

**SITE-002** is the real gap. The pipeline, versioning and `--site-*` render
layer all exist; the snapshot simply carries no brand fields, so every
merchant's site renders in identical greys.

**SITE-003** is now S, not M — `Publication` is immutable and republish creates
a new row, so rollback is a pointer move. Only the UI is missing.

**SITE-004** can reuse the token contrast checker written for the design system.

---

## Phase 4 — Global readiness and launch

| ID         | Title                                   | Pri | Kind   | Effort |
| ---------- | --------------------------------------- | --- | ------ | ------ |
| GLOB-002   | Money representation                    | P1  | BUG    | L      |
| OPS-004    | CD pipeline                             | P1  | PROD   | M      |
| LAUNCH-001 | Reconcile marketing claims with reality | P1  | PROD   | S      |
| GLOB-001   | Last India-specific residue             | P2  | BUG    | S      |
| GLOB-003   | Provider adapter contracts              | P3  | FUTURE | L      |

### GLOB-002 · Money representation

**P1 · BUG · M** _(approach decided 2026-08-02; was L under the minor-units
option)_

Money is `Decimal(_,2)` with a fixed 2-dp renderer
(`apps/api.saroh.in/src/common/money.ts`). Safe from float error, but it
**hard-codes a two-decimal assumption**: JPY/KRW (0 dp) and KWD/BHD (3 dp) do
not fit.

**Decision.** Keep `Decimal`; carry a **per-currency exponent** and drive
formatting from it. Two decimals remains the common case and the default — this
is additive, not a migration. Rejected: converting every money column to integer
minor units, which touches all of commerce, payments and billing for a
correctness property `Decimal` already provides.

**Scope.** A currency-metadata table or constant (code → exponent, symbol,
position); `toMoneyString` takes the exponent instead of assuming 2; all
formatting derives from the org/store currency rather than a literal.
**Acceptance.** A JPY store renders `¥1200`, not `¥1200.00`; a KWD store renders
3 dp; an INR/USD store is unchanged.

### GLOB-001 · India-specific residue

**P2 · BUG · S** — one `@default("INR")` (`schema.prisma:2385`) and one
hardcoded `₹` (`create-service-form.tsx`). That is the entire remaining set.

### LAUNCH-001 · Reconcile marketing claims

**P1 · PROD · S** — the site says "waitlist" while the product looks built, and
now claims a unified customer record that SEC-005 has not delivered.

---

## Sequencing

```
Phase 0 ── SEC-002 ─→ SEC-001 ─→ SEC-003
           OPS-001, OPS-003, OPS-005, OPS-002, DATA-001   (parallel)
                 │
Phase 1 ──── ARCH-001 ──────────────→ UX-001, UX-002
             SEC-005 ─→ SEC-006 ─→ SEC-004
                │
                └─→ UX-006 (unified customer record)
             ARCH-003 (ADR — needs product decision)
             ARCH-004 ─→ Automations on stable events
                 │
Phase 3 ──── SITE-002 (brand fields) ─→ SITE-003, SITE-004
Phase 4 ──── GLOB-002, OPS-004, LAUNCH-001
```

**Hard prerequisites**

| Blocked  | Blocker          | Why                                                  |
| -------- | ---------------- | ---------------------------------------------------- |
| SEC-004  | SEC-005          | Nullable tenant key cannot be protected by policy    |
| UX-003   | DATA-001         | Cannot design populated states against an empty DB   |
| UX-006   | SEC-005          | Screen requires the identities to be linked          |
| OPS-004  | OPS-001, OPS-003 | Do not automate deploys that can target the wrong DB |
| ARCH-003 | product decision | Not an engineering call                              |
| SEC-006  | test database    | Not provisioned locally                              |
