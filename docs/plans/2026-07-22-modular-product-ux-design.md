# Modular Product and UX Design

**Date:** 2026-07-22
**Status:** Approved

## Objective

Make Saroh useful to service businesses, commerce businesses, and hybrid businesses without assuming that business size determines product need. Capabilities are modular, enabled deliberately by each Organization, and optionally selected for individual Projects.

The design improves the existing product rather than replacing its domain architecture. Organization remains the tenant, Projects remain optional groupings, and OWNER/ADMIN retain access to every Project. AI remains deferred under `DEC-015`.

## Product model

Saroh has a shared business core and optional modules.

The always-available core contains Organization context, Projects, team/access management, customers, activity, settings, notifications, audit, subscription status, and module management. Optional modules initially include:

- Website and forms
- CRM and pipelines
- Appointments
- Commerce
- Payments
- Communications
- Automations
- Insights

Modules are chosen by business need. A small business may enable every module; a larger business may enable only one.

## Module scope and lifecycle

OWNER and ADMIN enable modules at **Settings → Modules** for the Organization. A Project may then select from the Organization's enabled modules. A Project can never activate a capability disabled by its Organization.

Persisted lifecycle states are `ENABLED`, `DISABLED`, and `ARCHIVED`. The UI derives operational readiness separately:

- **Setup required:** enabled, but required configuration is incomplete.
- **Active:** enabled and ready.
- **Attention required:** enabled, but credentials, verification, delivery, or another dependency is unhealthy.

Disabling a module hides normal entry points and prevents new activity but never silently deletes data or abandons public/financial obligations. Each module declares dependencies and a deactivation policy. Public checkout, bookings, publications, webhooks, refunds, and legal/audit records require explicit safe handling.

Module configuration is distinct from:

- **Feature flags**, which control Saroh rollout and emergency shutdown.
- **Entitlements**, which control commercial rights and limits.
- **Authorization**, which controls what the current actor may do.

An operation is available only when all four checks pass: rollout, module configuration, entitlement, and authorization.

## Project behavior

Organization-level enablement is authoritative. Project selection controls which enabled modules appear in a Project and which new records may be created there.

Project selection must not pretend that existing Organization-owned records are Project-isolated. Each domain receives optional `projectId` ownership and authorization in a deliberate migration before its records are filtered by Project. OWNER/ADMIN retain Organization-wide recovery and audit access; MEMBER queries use established direct/team Project grants.

## Information architecture

The primary shell is capability-aware:

- Home
- Customers
- Website, when enabled
- CRM, when enabled
- Appointments, when enabled
- Commerce, when enabled
- Communications, when enabled
- Automations, when enabled
- Insights, when enabled
- Settings

Organization and Project context are always visible. Navigation, command-menu actions, search, dashboards, and quick-create actions update when context or enabled modules change. Disabled modules are discoverable in Settings, not presented as broken or unauthorized routes.

## Shared customer experience

Service and commerce models remain separate in the domain layer, but the UX provides a unified operational view. A customer workspace can show CRM contacts, leads, bookings, orders, payments, messages, consent, and tasks.

Identity links must be explicit and auditable. Saroh must not merge people automatically on weak evidence such as similar names. Exact normalized identifiers may suggest a link, but a user confirms it unless the records originated from the same authenticated or transactional flow.

## UX principles

- Every screen answers: Where am I? What can I do? What should I do next?
- Every screen has at most one dominant primary action.
- Empty states teach and start setup; they are not decorative dead ends.
- Setup, active, attention, error, disabled, and permission states are visually and semantically distinct.
- Mobile, keyboard, contrast, reduced motion, loading, error recovery, and permission clarity are release criteria.
- Hybrid businesses see connected journeys, not duplicated products.
- Disabled modules preserve history and explain reactivation.

## Delivery releases

### Release 1: Modular foundation and navigation

Add the typed module registry, persistence, dependency and deactivation rules, Organization and Project APIs, Settings → Modules, module-aware navigation, and module-aware command actions.

### Release 2: Shared customer operations

Add an action-oriented Home, setup checklist, unified customer workspace, global quick-create, consistent states, and role-aware guidance.

### Release 3: Service and commerce excellence

Improve Appointments and Commerce in parallel. Both reuse customers, providers, payments, communications, automations, and analytics.

### Release 4: Operations and growth

Add provider health, templates, automation recipes, cross-module insights, Project dashboards, saved filters, bulk operations, imports/exports, and entitlement UX.

## Success measures

- A new Organization enables a relevant module and completes its first valuable action without support.
- Disabled modules do not clutter navigation or permit new domain activity.
- A hybrid business can understand one customer's enquiry, booking, order, payment, and communication history.
- Core tasks work on mobile and keyboard and have clear loading, empty, error, success, and permission states.
- Module disablement never loses records or leaves active public/financial workflows unexplained.
- No new capability bypasses Organization/Project authorization, feature-flag rollout, or entitlement enforcement.
