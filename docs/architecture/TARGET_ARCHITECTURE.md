# Target Architecture

## Recommendation

Use a modular monolith: Next.js applications for channel-specific UI, one NestJS API as the authorization and business boundary, PostgreSQL as the system of record, Prisma as the shared persistence implementation, and Better Auth as the only identity system. Do not split into microservices. Introduce durable jobs and an outbox behind ports only for work that is genuinely asynchronous.

`saroh.in` should be the canonical product/runtime domain for Saroh's own surfaces. `api.saroh.in` hosts Better Auth and business APIs; `accounts.saroh.in` is an authentication UI; `app.saroh.in` is the customer dashboard; `saroh.app` (`*.saroh.app`)/custom domains serve published sites.

## Ownership model

```text
User (global identity)
  └─ Membership ─> Organization (one business/organisation; tenant boundary)
                     ├─ BusinessProfile
                     ├─ Projects (optional grouping; never a tenant root)
                     ├─ Sites ─> Pages ─> PageVersions/Sections ─> Publications
                     ├─ Media and Domains
                     ├─ Forms ─> Submissions
                     ├─ Contacts ─> Leads ─> Pipeline/Stages/Activities/Tasks
                     ├─ Services ─> Availability ─> Bookings
                     ├─ Products ─> Orders ─> Payments/Refunds
                     ├─ Communications/Campaigns/Notifications
                     ├─ Integrations/WebhookDeliveries
                     ├─ AnalyticsEvents/Aggregates
                     ├─ Subscription/Entitlements
                     └─ AuditLogs
```

User is never the owner of business data. Organization owns every business entity. Membership links a user to an Organization and carries role/permission grants. A Project may group related resources but does not replace Organization ownership. A Site is a publishing property; the current Store concept should become an Organization-owned commerce channel, not a parallel tenant.

Public actors (visitors/customers) are not Organization members. Their access is constrained through explicit public publication, form and checkout commands.

## Module boundaries

| Module            | Owns                                                                                                                                 | Important ports/contracts                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Identity          | Better Auth user/account/session/verification                                                                                        | `IdentityReader`, auth HTTP handlers                                                                  |
| Organizations     | Organization and business-profile lifecycle; sole tenant/billing boundary                                                            | `OrganizationContext`, onboarding and switching commands                                              |
| Projects          | optional grouping of Organization-owned sites, forms, campaigns, assets, clients, brands or initiatives                              | Project service; never a second tenant root                                                           |
| Membership/RBAC   | Organization invitations and OWNER/ADMIN/MEMBER roles; Teams; direct/Team Project access with MANAGER/EDITOR/VIEWER roles            | centralized `authorize(actor, action, resource)`; OWNER/ADMIN see every Project                       |
| Sites             | site metadata and lifecycle                                                                                                          | site command service, public publication reader                                                       |
| CMS               | pages, sections, posts, drafts, versions, publication                                                                                | versioned content schema and renderer contract                                                        |
| Media             | objects, metadata, Organization ownership, processing state                                                                          | S3-compatible `ObjectStorage`; Cloudflare R2 initially; signed upload and media-processing jobs       |
| Domains           | hostname claims, verification, routing                                                                                               | DNS/deployment provider port                                                                          |
| Forms             | forms, fields, consent, submissions                                                                                                  | public submission command with anti-abuse                                                             |
| Contacts          | people/companies and deduplication                                                                                                   | contact repository/application service                                                                |
| Leads/pipelines   | lead, stage, activity and transitions                                                                                                | pipeline command service/event emission                                                               |
| Tasks             | assignments, due dates, status                                                                                                       | task commands and notifications                                                                       |
| Services/bookings | services, schedules, availability, appointments                                                                                      | availability calculator, calendar port                                                                |
| Products/orders   | catalog, inventory, cart and order lifecycle                                                                                         | transactional order command service                                                                   |
| Payments          | Organization customer-payment intents, attempts, refunds and reconciliation, separate from Saroh billing                             | `MerchantPaymentProvider`; Razorpay and Cashfree initially; verified webhook inbox                    |
| Communications    | Organization messages, templates, campaigns, consent and delivery ledger; separate Saroh identity/test email                         | Organization-owned email/WhatsApp provider ports and jobs; constrained self-test sends                |
| Notifications     | in-app/user notifications and preferences                                                                                            | notification dispatcher                                                                               |
| Analytics         | Organization customer/business events and aggregates, isolated from Saroh product analytics                                          | versioned consent-aware event intake, scheduled rollups and optional Organization-provider forwarding |
| Subscriptions     | versioned Saroh plans, Organization subscription/billing state and entitlements, isolated from Organization merchant payments        | server-side `EntitlementService`; separate Razorpay/Cashfree `BillingProvider` adapters               |
| AI                | Deferred until core Organization, publishing, CRM, booking, commerce, communications, analytics and subscription foundations operate | no provider, dependency or schema decision yet; revisit before Stage 8                                |
| Audit             | immutable security/business audit records                                                                                            | audit writer and query service                                                                        |
| Integrations      | connections, encrypted credentials, webhook inbox/outbox                                                                             | provider registry, idempotency ledger                                                                 |
| Feature flags     | typed rollout flags, global defaults, Organization overrides and audit history                                                       | server-side `FeatureFlagService`, managed through `admin.saroh.in`; emergency environment overrides   |

Modules expose application services and DTOs, not Prisma models. Cross-module changes use explicit commands in the same database transaction where synchronous consistency matters. Domain events are recorded to an outbox in that transaction and processed asynchronously when side effects can lag.

## API and data-access rules

- Only NestJS business modules and infrastructure packages may import `@saroh/database`; Better Auth may use it inside the API process.
- Frontends never import Prisma or accept a client-supplied Organization ID as proof of access.
- API resolves the authenticated actor, validates Organization membership, selects an active Organization context, then authorizes each command/query. OWNER and ADMIN see every Project; MEMBER Project access is direct or Team-derived.
- Repositories require `organizationId` in their public methods. Avoid unscoped `findUnique(id)` for business data.
- Prefer schema constraints that encode Organization ownership (compound keys where practical). Add negative tenant-isolation tests for every module.
- PostgreSQL RLS is required as defense in depth after transaction-local Organization context is proven; it does not replace application authorization.

## Authentication and session flow

Better Auth remains mounted at API. Accounts provides UI only. Production cookies use `.saroh.in`, Secure, HttpOnly and appropriate SameSite settings. OAuth callback domains, trusted origins and CORS are derived from one typed configuration. Middleware remains an optimistic cookie-presence gate; API/server session validation is authoritative. Remove all NextAuth docs and dependencies after a final lockfile/source scan.

## Jobs, providers and webhooks

Start with a `JobQueue` port, PostgreSQL transactional outbox and PostgreSQL-backed durable job runner when the first notification workflow ships. Jobs carry stable IDs, Organization IDs, retry policy and idempotency keys. BullMQ/Redis is the planned scaling path; RabbitMQ is reserved for demonstrated distributed-routing needs. Use an inbox table for verified incoming webhooks. Merchant payment, Saroh billing, R2-compatible storage, Organization email/WhatsApp, DNS/deployment and analytics providers implement narrow interfaces; credentials are encrypted and access is audited. AI remains deferred.

## Observability and security

Every request receives a correlation ID and structured log fields (`actorId`, `organizationId`, optional `projectId`, route, outcome) without secrets/PII payloads. Use consistent problem-detail errors. Record security-sensitive actions in immutable audit logs. Apply rate limits to auth, forms, uploads, test sends and webhooks. Enforce feature flags, entitlements and authorization independently in application services. CI runs secret scanning, dependency audit, migrations, types, lint, tests and builds.

## Incremental schema migration strategy

1. Inventory production schema and repair migration history without destructive resets.
2. Add Organization/BusinessProfile and a deterministic Organization backfill for each existing store owner.
3. Add mandatory Organization ownership to new models first; add nullable `organizationId` to legacy business tables and dual-write from API.
4. Backfill in batches and verify orphan/cross-tenant queries.
5. Switch reads/authorization to Organization membership behind an admin-controlled feature flag.
6. Add NOT NULL, foreign-key and compound uniqueness constraints only after verification.
7. Retain Store as an optional Organization-owned commerce channel, separate from Site; keep compatibility adapters during transition.
8. Enable the required RLS policies with explicit transaction-local Organization context, background-job context, adversarial isolation tests and rollback tests.

No existing schema should be altered until this audit and the Store semantic decision are reviewed.
