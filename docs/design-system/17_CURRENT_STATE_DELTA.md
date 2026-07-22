# 17 · Current-State Delta — post-remediation re-audit

> **Status:** Delta against the 2026-07-20 capstone ([00_FINAL_REPORT](./00_FINAL_REPORT.md),
> baseline **5.3/10**). Re-audited 2026-07-22 against `development`. Every row
> traces to a commit. This supersedes the "current state" of the July-20 audit
> where marked; it does **not** re-open the closed remediation issues #91–#102,
> #108, #109. **AI stays deferred (`DEC-015`)** — see the roadmap correction below.

## 1. Findings re-audit (old audit → now)

| Audit finding (July 20)                                   | Status                  | Evidence                                                                                                                               |
| --------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Flat horizontal nav overflows at 8+ items (D-05)          | ✅ Resolved             | Persistent left `AppSidebar` + `MobileNav` drawer — `components/shared/app-sidebar.tsx`, `mobile-nav.tsx`                              |
| Object-named nav, not goal-based (D-02)                   | ✅ Resolved             | Goal groups in `nav-items.tsx` (Customers/Appointments/Website/Insights); now also module-gated (#116)                                 |
| No command palette / >2-click fallback                    | ✅ Resolved             | ⌘K `CommandMenu` (`command-menu.tsx`)                                                                                                  |
| Inconsistent page headers / empty states                  | ✅ Resolved             | Shared `PageHeader` + `EmptyState` adopted across index pages (#96, sites/leads/etc.)                                                  |
| Ad-hoc tables                                             | ✅ Resolved (lists)     | DataTable on customers/products (`32164e0`); remaining lists tracked in the backlog                                                    |
| Unvalidated forms                                         | ✅ Resolved (pattern)   | RHF + zod + `@saroh/ui` Form is the standard (#109)                                                                                    |
| No dark-mode control                                      | ✅ Resolved             | `ThemeToggle` in the header                                                                                                            |
| Brand CTA not surfaced                                    | ✅ Resolved             | `Button variant="brand"` in the gallery + used on primary CTAs (#97)                                                                   |
| Capabilities are always-on; no per-Organization choice    | ✅ Resolved (this epic) | Settings → Modules + capability-aware shell — #115, #116 (ADR-003)                                                                     |
| No unified place to see a module's setup state            | ✅ Resolved             | Module catalog groups by readiness; setup checklist from API blockers (#115)                                                           |
| Nav can't reflect enabled capabilities                    | ✅ Resolved (dark)      | `filterNavGroups` fail-open projection wired through the shell (#116)                                                                  |
| Per-Project capability scoping in the UI                  | ◑ Partial               | Project module selector + settings page (#116); an **active-Project switcher in the shell is deferred** (needs active_project context) |
| Action-oriented Home (next actions, not a store list)     | ✗ Still present         | Home is not yet the action surface — epic #111 Task 4                                                                                  |
| Unified customer workspace (CRM+bookings+orders+messages) | ✗ Still present         | Not built — epic #111 Task 5                                                                                                           |
| Provider/dependency health surfacing (ATTENTION_REQUIRED) | ✗ Still present         | Readiness adapters return SETUP/ACTIVE only; attention/provider-health signals are a per-module follow-up (#123)                       |
| Global capability-aware quick-create                      | ✗ Still present         | Not built — epic #111 Task 2                                                                                                           |

## 2. Task success measures

Baselines to hold the UX epic accountable. Clicks are counted from Home for an
OWNER on desktop; time and error-rate are to be instrumented via `agent-browser`
runs against a seeded stack (no live measurement in this environment yet).

| Journey                            | Clicks (now)                    | Target           | Notes                                        |
| ---------------------------------- | ------------------------------- | ---------------- | -------------------------------------------- |
| Enable a module                    | 2 (Settings → Modules → Enable) | ≤ 2              | Shipped (#115). Add from onboarding (#119).  |
| Publish a site                     | route exists (`/sites`)         | ≤ 4, 0 dead-ends | Empty state teaches; measure end-to-end.     |
| Create + progress a lead           | `/leads` + pipeline move        | ≤ 5              | DnD pipeline exists; count for a first lead. |
| Create a service + booking         | `/services`, `/bookings`        | ≤ 6              | Two-object flow; onboarding should seed.     |
| Create a product + fulfil an order | `/stores/[id]`, orders          | ≤ 7              | Commerce workspace (#122) should compress.   |
| Connect a provider                 | payments/comms settings         | ≤ 4              | Provider health surfacing is #123.           |
| Find one customer's history        | ✗ no single surface             | 1 destination    | Unified workspace (#120) is the target.      |

**Method:** capture clicks/time-to-complete/error-count per journey with
`agent-browser` at 390×844 and 1440×1000, before and after each Release, and
record deltas here. Success = every core journey ≤ target with zero
inaccessible-action leakage and a defined empty/loading/error/permission state.

## 3. Roadmap corrections

- **AI removed from the active UX milestone.** The July-20 plan's Milestone 5
  and backlog **D-38** include an AI surface; this conflicts with
  [`DEC-015`](../architecture/DECISIONS.md) (AI deferred until Stages 0–7
  operate). D-38 / M5-AI are **deferred**, not scheduled, and must not gate
  accessibility, responsive, or performance work.
- **Need-based, not size-based.** Replace any "small vs large business"
  framing with need-based module selection: an Organization enables the modules
  its work requires, independent of size (ADR-003 / DEC-016). Onboarding asks
  _what the business needs to do_, never _how big it is_.
- The modular-capabilities epic (#110) is code-complete; its UX surfaces
  (Settings → Modules, capability-aware nav) are the foundation the remaining
  cross-product UX releases (#118–#125) build on.
