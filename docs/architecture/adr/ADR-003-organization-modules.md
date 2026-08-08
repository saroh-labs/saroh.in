# ADR-003 — Organization modules (capabilities) (S-modules / #110)

**Status:** Accepted — 2026-07-22
**Implements:** [Modular Product and UX Design](../../plans/2026-07-22-modular-product-ux-design.md) · [Modular Capabilities Implementation Plan](../../plans/2026-07-22-modular-capabilities-implementation-plan.md) (Task 1)
**Builds on:** [ADR-001](./ADR-001-organization-tenant-root.md) (Organization is the sole tenant root)
**Blocks:** #113 (persistence/backfill), #114 (lifecycle/readiness/deactivation), #115 (APIs + Settings → Modules), #116 (Project selection + shell), #117 (domain enforcement).

Saroh must serve service, commerce, and hybrid businesses without assuming business size determines product need. Capabilities become **modules** an Organization enables deliberately, and a Project may select from its Organization's enabled set. This ADR fixes the module _model_ and the _typed registry_; it changes no schema and performs no migration.

---

## 1. Context

The platform already has two orthogonal control planes:

- **Feature flags** (`FlagKey`, S1-012) — Saroh-controlled rollout / emergency shutdown.
- **Entitlements** (`EntitlementService`, S7-005) — commercial rights and numeric limits per plan.

Neither expresses "this Organization has chosen to run Appointments." Reusing feature flags would conflate Saroh rollout with a customer's business configuration; reusing entitlements would conflate what a plan _permits_ with what an Organization has _turned on_. We need a third, customer-owned concept: **module installation**.

## 2. Decision — four independent gates

A capability operation is available only when **all four** independent checks pass, in this order of concern:

1. **Rollout flag** — Saroh's kill switch for the module surface (`ModuleDescriptor.rolloutFlag`, a `FlagKey`). Default **false**, so modules dark-roll out.
2. **Module installation** — the Organization has enabled the module (a persisted record, #113), and, for Project-scoped work, the Project has selected it.
3. **Entitlement** — the Organization's plan permits it (`ModuleDescriptor.entitlementKey`, optional).
4. **Authorization** — the actor may perform the action (`ModuleDescriptor.requiredAction`, an `OrgAction`).

These stay four separate decisions on purpose. Collapsing any pair re-creates the confusion above and makes emergency rollback, pricing changes, and permission changes entangle.

## 3. The typed registry

One server-owned registry (`apps/api.saroh.in/src/modules/capabilities/module-registry.ts`) is the single source of truth. Frontends receive a **serialized projection** and must never maintain their own dependency or permission maps.

Initial modules (`MODULE_KEYS`): **Website, CRM, Appointments, Commerce, Payments, Communications, Automations, Insights.** **AI is excluded** (DEC-015) and the registry validator rejects it explicitly.

Each `ModuleDescriptor` declares: `label`, `description`, `rootRoutes`, `requiredAction` (`OrgAction`), `dependencies` (hard enable-time), `projectSelectable`, `rolloutFlag` (`FlagKey`), optional `entitlementKey`, and `readinessAdapter` / `deactivationPolicy` identifiers (resolved in Task 4).

`validateModuleRegistry` rejects: unknown/`AI` keys, duplicate keys or labels, dependencies outside `MODULE_KEYS`, direct or transitive dependency cycles, routes not beginning with `/`, a Project-selectable module whose dependency is not selectable, and rollout/entitlement/action keys absent from their typed registries. The shipped registry self-validates at import time.

### First-version dependencies

Hard enable-dependencies are conservative. Broader OR-style relationships are **readiness** concerns (Task 4), not enable-time dependencies:

| Module         | Hard enable dependency | Readiness (derived, Task 4)                            |
| -------------- | ---------------------- | ------------------------------------------------------ |
| Website        | —                      | Site/template/domain setup                             |
| CRM            | —                      | Pipeline exists                                        |
| Appointments   | CRM                    | Service and availability exist                         |
| Commerce       | —                      | Store/channel and catalog exist                        |
| Payments       | —                      | Appointments **or** Commerce enabled; provider healthy |
| Communications | CRM                    | Organization provider healthy for real sends           |
| Automations    | CRM                    | A supported trigger/action pair exists                 |
| Insights       | —                      | At least one event-producing module active             |

Payments intentionally has **no** hard dependency: enabling it must not force _both_ Commerce and Appointments. Its "needs Appointments or Commerce" rule is an OR evaluated at readiness time.

## 4. Lifecycle vs readiness

Persisted **lifecycle** (`ModuleLifecycle`) is `DISABLED | ENABLED | ARCHIVED`. Operational **readiness** (`ModuleReadiness`: `DISABLED | SETUP_REQUIRED | ACTIVE | ATTENTION_REQUIRED`) is **derived, never persisted** — recomputed from configuration and dependency health so it can never drift from reality.

## 5. Safe disabling

Disabling a module hides normal entry points and prevents **new** activity but never silently deletes data or abandons public/financial obligations (checkout, bookings, publications, webhooks, refunds, legal/audit records). Each module declares a deactivation policy identifier that Task 4 resolves to the concrete safe-teardown behavior.

## 6. Project behavior

Organization enablement is authoritative; a Project can never activate a module its Organization has disabled. Project selection controls which enabled modules appear in a Project and which new records may be created there. It does **not** retroactively claim that existing Organization-owned records are Project-isolated — per-domain `projectId` ownership is a separate, deliberate migration (#117). OWNER/ADMIN retain Organization-wide access.

## 7. Backfill

Existing Organizations are backfilled (#113) from **evidence of current use** (e.g. an org with Sites gets Website enabled) so deployed functionality does not disappear on rollout. Backfill is idempotent.

## 8. Consequences

- A new customer-owned control plane exists without overloading flags or entitlements.
- Dark rollout is the default (rollout flags start false).
- Frontends depend only on a serialized projection; dependency/permission logic stays server-side.
- Follow-on tasks (#113–#117) implement persistence, availability composition, readiness/deactivation adapters, APIs, the capability-aware shell, and domain enforcement.
