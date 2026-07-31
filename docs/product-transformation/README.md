# Product transformation

Repository-backed plan for turning Saroh into a commerce-first operating system.

Started 2026-07-31 against `development` @ `3066a81`.

## Read these first

| Document                                                   | Status   | What it is                                                                                       |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| [`current-state-audit.md`](./current-state-audit.md)       | **Done** | What the code actually does, with file paths. Four findings that change the brief's assumptions. |
| [`implementation-backlog.md`](./implementation-backlog.md) | **Done** | Prioritised, sequenced work with acceptance criteria.                                            |

## Written when the work reaches them

The transformation brief lists twelve documents. The remaining ten are
deliberately **not** written yet — each one either restates the brief or
front-runs a decision the code has not been analysed for. Writing them now would
produce exactly the "documentation that merely repeats this prompt" the brief
warns against.

| Document                       | Written during | Blocked on                             |
| ------------------------------ | -------------- | -------------------------------------- |
| `security-remediation.md`      | Phase 0        | Nothing — starts with SEC-001          |
| `idempotency-design.md`        | Phase 0        | Design decided as part of SEC-001      |
| `domain-boundaries.md`         | Phase 1        | ARCH-001 outcome                       |
| `customer-core-plan.md`        | Phase 1        | Audit §1.1 changed the shape of this   |
| `module-dependencies.md`       | Phase 1        | ARCH-001                               |
| `product-north-star.md`        | Phase 1        | Positioning decision (see below)       |
| `information-architecture.md`  | Phase 2        | ARCH-001, ARCH-003                     |
| `rls-rollout.md`               | Phase 1–4      | ARCH-002 step 1 is a hard prerequisite |
| `global-commerce-readiness.md` | Phase 4        | Audit §1.3 shrank this to ~2 items     |
| `launch-readiness.md`          | Phase 4        | Everything above                       |

## The four findings that changed the plan

Detail in the audit; summarised because they alter cost and order.

1. **Customer Core mostly exists** — it is called `Contact`, and Appointments
   and Communications already bind to it. Extracting it is repackaging, not
   greenfield. _Cheaper and earlier than the brief assumed._
2. **The real problem is `Customer` vs `Contact`** — commerce customers are
   Store-scoped with a **nullable** `organizationId`, and reconciliation is
   manual. _Harder than the brief assumed, and it blocks RLS._
3. **Global readiness is nearly done** — currencies default to `USD`, bookings
   already store UTC + IANA timezone. One `INR` default and one `₹` remain.
   _Downgraded from a phase to two backlog items._
4. **`Project` has no domain meaning** — and competes with `Store`, which is
   where commerce data actually hangs. _Needs an ADR before any rename._

## Open decisions needed from the product owner

These are not engineering calls and block specific items:

1. **Positioning.** The brief says commerce-first. The code is genuinely
   module-neutral, and Appointments/CRM/Website are as built as Commerce.
   Committing to commerce-first is a _marketing and defaults_ decision, not a
   code one — confirm before `product-north-star.md`.
2. **`Project` vs `Store`.** Which is the container merchants see? Blocks
   ARCH-003.
3. **Waitlist vs open signup.** The marketing site says waitlist; the product
   looks launch-ready. Blocks LAUNCH-001.
4. **Pricing model.** Base + capabilities + usage, per the brief — needs
   confirmation before entitlements are reshaped.

## Ground rules held throughout

From the brief, and worth keeping visible:

- `api.saroh.in` stays the only database-facing service. No microservices, no
  second backend, no frontend reaching Postgres.
- Modularity is preserved internally; the _interface_ becomes outcome-driven.
- Disabling a capability never deletes merchant data.
- Merchant sites never inherit Saroh's brand — the `--site-*` layer stays
  separate.
- No security defect gets papered over with UI work.
- Every recommendation cites repository evidence.
