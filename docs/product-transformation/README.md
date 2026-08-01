# Product transformation

Repository-backed plan for turning Saroh into a commerce-led operating system.

Audit cycle completed 2026-07-31 against `development` @ `9aa1899`.
**No application code, schema, migration, dependency, environment or deployment
configuration was modified during this cycle.**

## Documents

| Document                                                       | What it is                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`current-state-audit.md`](./current-state-audit.md)           | What the code actually does, with file paths and confidence levels. Includes corrections to the first pass. |
| [`security-remediation.md`](./security-remediation.md)         | Nine findings with evidence, impact, alternatives and acceptance criteria.                                  |
| [`domain-boundaries.md`](./domain-boundaries.md)               | Current vs proposed boundaries; Customer Core; the `Project`/`Store` question.                              |
| [`product-north-star.md`](./product-north-star.md)             | Positioning, first launch persona, success measures.                                                        |
| [`information-architecture.md`](./information-architecture.md) | Current IA, proposed IA, capability visibility, command centre.                                             |
| [`implementation-backlog.md`](./implementation-backlog.md)     | Prioritised, sequenced work with hard prerequisites.                                                        |

Written as the work reaches them, to avoid documents that restate the brief:
`idempotency-design.md` (during SEC-001) · `customer-core-plan.md` and
`module-dependencies.md` (during ARCH-001) · `rls-rollout.md` (during SEC-004) ·
`global-commerce-readiness.md` and `launch-readiness.md` (Phase 4).

## Findings that changed the plan

Six, of which two are corrections to this project's own earlier pass.

1. **Customer Core mostly exists — it is called `Contact`.** Org-scoped, and
   already owns bookings, messages and consent. Appointments and Communications
   depend on the CRM _module_, not CRM _data_. Extraction is repackaging.
2. **The real identity problem is `Customer` vs `Contact`.** Commerce customers
   are Store-scoped with a **nullable** `organizationId`, reconciled manually.
   Harder than assumed — and it blocks RLS.
3. **RLS is far more built than "inert" implied** _(correction)_ — 113 policies,
   65 tables, a correct transaction-local proxy. But the policies **fail open**
   when the tenant GUC is unset, and the runtime role has `BYPASSRLS`.
4. **The publication pipeline is real and already versioned** _(correction)_ —
   `getSiteData` is dead legacy code with zero callers. The gap is brand fields,
   not the pipeline.
5. **Money is `Decimal(_,2)`, not minor units** — hard-codes a two-decimal
   assumption that JPY and KWD do not fit.
6. **The outcome vocabulary already exists** in `/onboarding/modules` and is
   discarded the moment onboarding ends. Highest value-per-effort in the backlog.

## Decisions required from the product owner

| #   | Decision                                                                                             | Blocks                             |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Commerce-**led** or commerce-**only**? The code is genuinely module-neutral.                         | IA, marketing, onboarding defaults |
| 2   | `Project` vs `Store` — which container do merchants see? Three options in `domain-boundaries.md` §4. | ARCH-003                           |
| 3   | Fix the unified-customer claim, or stop making it? It is currently false.                            | LAUNCH-001, SEC-005 priority       |
| 4   | Waitlist or open signup?                                                                             | Launch readiness, marketing CTAs   |
| 5   | Pricing shape — base + capabilities + usage?                                                         | Entitlements, packaging            |
| 6   | Money: migrate to minor units, or keep `Decimal` with a per-currency exponent?                       | GLOB-002                           |

## Ground rules

- `api.saroh.in` stays the only database-facing service.
- Modularity is preserved internally; the _interface_ becomes outcome-driven.
- Disabling a capability never deletes merchant data.
- Merchant sites never inherit Saroh's brand.
- No security defect gets papered over with UI work.
- Every recommendation cites repository evidence.
