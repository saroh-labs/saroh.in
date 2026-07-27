# Saroh Admin Control Plane Design

**Date:** 2026-07-27
**Status:** Approved
**Delivery model:** Vertical control-plane slices

## Purpose

Turn `admin.saroh.in` into Saroh's internal team control plane. It must give the
team complete, role-appropriate control over organization support, platform
operations, staff governance, billing, and feature rollouts without weakening
tenant isolation or obscuring who performed an action.

The current admin app already provides staff-only access, aggregate platform
metrics, and audited feature-flag changes. This design builds on that boundary
rather than creating a second administration path.

## Product decisions

- This is an internal team product, not a customer-facing administration area.
- Staff authorization uses fixed system roles with multiple roles per person.
- The fixed roles are Platform Owner, Support, Operations, Billing, Release
  Manager, and Auditor.
- Role permissions are enforced by the API. UI visibility is not an
  authorization boundary.
- Customer troubleshooting uses expiring, audited, read-only "view as
  organization" sessions. Staff never silently become a customer user.
- The team receives full control through explicit admin actions.
- There is no two-person approval workflow in the first version. Sensitive
  actions still require a fresh staff session, typed confirmation, and a reason.
- Implementation proceeds as complete vertical slices: shared foundation,
  Organizations, Operations, Governance, then Releases.

## 1. Control-plane architecture and security boundary

`admin.saroh.in` remains a separate internal application. It communicates only
with `/admin/*` endpoints on `api.saroh.in`; it never imports
`@saroh/database`, bypasses the API, or reuses tenant-facing authorization
shortcuts.

The existing `PlatformAdmin` grant remains the staff identity foundation.
Multiple fixed role assignments are added per staff member. Roles map to typed
permissions in API code, such as `organization:read`,
`organization:members:write`, `jobs:retry`, `subscription:override`,
`staff:grant`, and `flags:publish`. The API checks permissions on every
endpoint. `ADMIN_ALLOWLIST` remains a visible, logged break-glass path with
Platform Owner capability.

A new append-only `AdminAuditEvent` records control-plane reads and mutations:
actor, permission used, target type and ID, optional Organization ID, reason,
outcome, request ID, safe metadata, and timestamp. Sensitive mutations write
their audit event in the same transaction and fail closed if the audit write
fails. Secrets, credentials, raw webhook bodies, signatures, and unrestricted
customer payloads never enter audit metadata.

Opening an Organization requires a short reason and creates an expiring
`AdminAccessSession`. This gives related diagnostic reads a clear support-case
boundary without demanding the same reason on every tab. "View as
organization" uses that session, is read-only, expires automatically, and
shows an unmistakable staff banner. Any mutation returns to an explicit admin
action so the staff actor remains attributable.

## 2. Organization support workspace

The Organization directory is the team's main entry point. Staff can search by
Organization name, slug, ID, domain, or member email. Search is server-paginated
and can be filtered by lifecycle, plan, module, creation date, and operational
health. Search by member email and other personally identifying fields requires
`organization:pii:read`.

Each Organization has a 360-degree workspace:

- **Overview:** lifecycle, plan, owners, Projects, modules, usage, recent
  activity, and outstanding warnings.
- **People:** members, invitations, roles, sessions, and ownership. Authorized
  staff can resend or revoke invitations, change roles, transfer ownership,
  revoke sessions, or disable access.
- **Modules:** rollout, installation, entitlement, readiness, dependencies, and
  configuration health. Actions cover enable, disable, archive, repair, and
  safe cache refreshes.
- **Operations:** failed jobs, webhook deliveries, domains, storage, providers,
  and recent errors, with scoped retry and recheck actions.
- **Billing:** subscription, plan, invoices, limits, provider state, credits,
  and time-bounded entitlement overrides.
- **Audit:** tenant and control-plane histories, visibly separating customer
  actions from staff actions.

Suspension blocks new authenticated and public activity without deleting
records or abandoning payments, refunds, webhooks, and legal obligations.
Reactivation is reversible. Deletion is scheduled, never immediate: a Platform
Owner enters a reason, confirms the Organization slug, reviews a dependency
preview, and can cancel during the retention window.

The API returns capabilities with each read model so the UI can present allowed
actions, while independently authorizing every mutation. Actions use explicit
verbs, impact previews, reasons, idempotency keys, and durable operation
records.

## 3. Platform operations center

Operations answers what is failing, who is affected, and what can safely happen
next. Its overview combines queue health, dead-letter volume, webhook failures,
provider degradation, domain and publication errors, storage failures,
communication delivery rates, and API error trends. Metrics support time range
and Organization filters and link to the underlying redacted records.

Dedicated work areas cover:

- **Jobs:** queued, running, scheduled, failed, and dead-lettered work.
- **Webhooks:** provider, event type, verification state, processing outcome,
  and duplicate state.
- **Providers:** payments, billing, email, WhatsApp, storage, DNS, and
  deployment dependencies.
- **Deliveries:** outbound messages and notification attempts.
- **Incidents:** manually declared or system-detected degradation.

Operations staff can retry one item, safely bulk-retry matching failures, cancel
future work, replay dead letters, reprocess verified webhooks, refresh provider
health, and quarantine poison events. Before execution, the API provides a dry
run with eligible, skipped, and unsafe records. Replays reuse the original
idempotency key or create a linked replay key to prevent duplicate charges,
messages, and business records.

Long-running and bulk actions create an `AdminOperation` with progress,
per-item results, cancellation state, initiator, reason, and a redacted failure
report. Rate and concurrency limits prevent retry storms.

Incidents capture severity, affected capabilities and Organizations, timeline,
owner, internal notes, mitigations, and resolution. Flag changes and bulk
operations can link to the incident for a coherent operational history.

## 4. Team governance and fixed roles

Staff can hold multiple roles. Their effective permission set is the union:

| Role | Primary capabilities |
| --- | --- |
| Platform Owner | Complete control, staff governance, Organization lifecycle, and system configuration |
| Support | Organization lookup, access sessions, read-only view, member recovery, session revocation, and safe diagnostics |
| Operations | Jobs, webhooks, providers, incidents, retries, and operational Organization actions |
| Billing | Plans, subscriptions, invoices, credits, limits, and entitlement overrides |
| Release Manager | Flags, cohorts, schedules, staged releases, and rollback |
| Auditor | Read-only staff activity, platform audit history, and redacted exports |

Only Platform Owners grant or revoke staff access. Grants contain roles, a
business reason, and optional expiry. Revocation takes effect on the next API
request, ends active admin access sessions, and appends an immutable event. The
system prevents removing, revoking, or expiring the final active Platform Owner.

Permissions are resolved from the database on every control-plane request
instead of being copied into a long-lived session claim. Role changes therefore
take effect immediately. Better Auth remains the only authentication system;
its session-freshness and session-revocation primitives support sensitive staff
actions and account recovery.

The Team UI shows active, invited, expired, and revoked staff; roles; last admin
activity; active support sessions; and grant history. A permission matrix
explains each fixed role. Break-glass access is always visually distinct.

## 5. Release and rollout control

Feature Flags becomes a release-management workspace. Each registered flag has
display metadata: description, owning team, risk, affected modules, safe
default, rollout instructions, and optional cleanup date. Environment emergency
overrides remain highest precedence and appear as read-only warnings because
the UI cannot change deployment configuration.

A release advances through explicit stages:

1. Shadow
2. Internal Organizations
3. Named cohort
4. Percentage cohort
5. Global default
6. Complete and ready for flag removal

Cohorts are inspectable Organization sets. Named cohorts are curated manually
or by stable filters such as plan, region, or module installation. Percentage
rollout uses deterministic hashing of Organization ID and flag key, so
membership remains stable. An effective-value inspector explains why a selected
Organization receives its value.

Release Managers can schedule stages, set expiring overrides, pause rollouts,
and execute emergency rollback. A publication preview reports affected
Organizations, conflicting overrides, readiness warnings, and exact precedence.
Scheduled changes run as durable operations with complete author and execution
history.

Rollback appends a new change restoring a prior state; it never edits audit
history. Broad rollout increases require a fresh staff session and typed
confirmation. The workspace identifies stale flags, expired overrides, flags at
100 percent, and registry keys no longer referenced by code.

## 6. Admin experience and data flow

The desktop-first shell has six primary areas: Dashboard, Organizations,
Operations, Releases, Team, and Audit. Navigation is permission-aware, while
the API still protects direct routes. Global search and a command menu find
Organizations, users, operations, flags, and incidents.

Dashboard content is role-sensitive. Support sees Organizations needing
attention and support sessions; Operations sees failures and incidents; Billing
sees subscription exceptions; Release Managers see rollouts; Platform Owners
see cross-functional risk. Auditor access is read-only.

Search, filters, sorting, cursor, and time range live in the URL so views are
bookmarkable. Dense tables use server pagination, column controls, saved views,
keyboard navigation, and accessible status labels. Detail pages use stable tabs
and a persistent target header.

Server components read typed `/admin/*` API endpoints. Client components handle
interaction and pending state only. Mutation flow is:

`staff session -> permission guard -> validation -> impact check -> transaction
-> audit event -> durable result`

Every mutation carries an idempotency key and reason. Successful writes return
resource versions so stale screens cannot overwrite newer state. Long-running
work returns an operation ID and reports progress; short actions refresh only
the affected route.

Unauthorized, forbidden, validation, conflict, rate-limit, dependency outage,
and unexpected failures remain distinct. The UI never converts an API failure
to an empty state. Correlation IDs are visible for escalation without exposing
stack traces or secrets.

## 7. Persistence and safeguards

Control-plane persistence is separate and explicit:

- `PlatformAdminRoleAssignment`
- `AdminAuditEvent`
- `AdminAccessSession`
- `AdminOperation` and operation item results
- `PlatformIncident` and incident timeline events
- `FlagCohort`, cohort membership, rollout stage, and scheduled changes
- An explicit Organization lifecycle state

State transitions live in centralized services rather than general update
endpoints. Suspension, deletion, job replay, subscription override, access
revocation, and rollout publication each define legal transitions, impact
previews, idempotency behavior, and rollback boundaries.

Migration is additive. Existing active Platform Admin grants become Platform
Owner assignments. Current flag values and overrides do not change. New
capabilities ship behind control-plane flags and roll out to break-glass owners,
then the internal team, then the default admin experience.

## 8. Verification strategy

- **Unit:** permission matrix, role unions, state machines, deterministic
  cohorts, redaction, and impact calculations.
- **API integration:** authentication, every role boundary, immediate
  revocation, transactional auditing, pagination, conflicts, idempotency, and
  Organization isolation.
- **Operational:** duplicate-safe replay, webhook reprocessing, bulk
  cancellation, expiry jobs, rollback, and provider rate limiting.
- **Browser:** role-specific navigation and actions, access sessions, responsive
  tables, keyboard operation, destructive confirmations, failure recovery, and
  accessibility.

Structured metrics track authorization denials, admin action failures,
audit-write failures, support-session use, bulk-operation outcomes, and rollout
changes.

## Delivery sequence

1. Staff RBAC and global audit foundation.
2. Organization directory, access sessions, and 360-degree read model.
3. Organization support actions and read-only view-as-Organization.
4. Operations center and durable admin operations.
5. Team governance UI and staff lifecycle.
6. Advanced release and rollout management.

Each slice includes schema, API, admin UI, authorization, audit, tests, and
release controls before the next slice begins.
