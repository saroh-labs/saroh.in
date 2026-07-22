# Architecture Decision Log

Unless an entry says otherwise, its status is **Proposed — requires audit review**.

## DEC-001 Canonical product domain

**Status: Accepted — 2026-07-17**

- Context: runtime subdomains use `saroh.in`, while repository/package metadata and some branding use `saroh.io`.
- Options: `.in`; `.io`; use both as peers.
- Decision: `saroh.in` is canonical for product, cookies, OAuth and public URLs. `saroh.io` is not a peer product domain and may only redirect or serve legacy/reserved purposes.
- Consequences: simpler cookie/security model; metadata and links require cleanup.
- Migration: inventory DNS/OAuth/email links, redirect `.io`, then normalize docs/packages.

## DEC-002 Canonical app naming

**Status: Accepted — 2026-07-17**

- Context: package names (`auth`, `application`, `web`) and stale documented apps do not match directories.
- Options: short functional names; domain names; keep mixed names.
- Decision: use domain-based application names as the canonical module and deployment identity, such as `accounts.saroh.in`, `api.saroh.in`, `app.saroh.in`, `sites.saroh.in`, and `saroh.in`. Do not rename `app.saroh.in` to a conceptual `dashboard` application or `saroh.in` to `marketing`.
- Consequences: architecture and deployment boundaries remain visible directly from names, making domain-level modular decisions easier. Internal package metadata and Turbo filters should be aligned with the domain names instead of using ambiguous aliases such as `auth`, `application`, or `web`.
- Migration: normalize package names, scripts and documentation incrementally while preserving directory paths and deployed URLs.

## DEC-003 Better Auth migration

**Status: Accepted — 2026-07-17**

- Context: runtime source uses Better Auth; docs still claim NextAuth remains.
- Options: dual auth; Better Auth only; return to NextAuth.
- Decision: Better Auth is the only authentication system and is hosted exclusively by `api.saroh.in`. `accounts.saroh.in` owns sign-in, signup, verification, password recovery and related account interfaces, but does not own a separate authentication server or direct database boundary.
- Consequences: one session/identity model; API availability affects session reads.
- Migration: final dependency/source scan, update callbacks/docs and delete stale NextAuth content.

## DEC-004 API boundary

**Status: Accepted — 2026-07-17**

- Context: dashboard already calls Nest API; renderer/marketing have stubs.
- Options: frontend Prisma; mixed API/server actions; Nest modular monolith.
- Decision: `api.saroh.in` and its NestJS modular monolith own all authenticated and public business commands, queries and database access. Next.js server actions and server components may act as thin typed API clients but must not import Prisma or implement an alternative business-data boundary.
- Consequences: consistent authorization and observability; explicit contracts required.
- Migration: keep existing dashboard adapters, add OpenAPI/typed client, replace stubs through API.

## DEC-005 Multi-tenancy, Organization and Project model

**Status: Accepted — 2026-07-17**

- Context: Store is the current tenant and Workspace is optional/future. The product may also introduce Projects beneath a business boundary.
- Options: Store tenant; Workspace tenant; Organization tenant; multiple nested tenant roots.
- Decision: Organization replaces Workspace terminology and becomes the sole mandatory tenant and business/organization boundary. A user can join multiple Organizations through Membership. An Organization can own multiple Sites and Stores. Project is an optional grouping beneath Organization for related sites, forms, campaigns, assets, clients, brands or initiatives; it is not a separate tenant, membership, billing or ownership root.
- Consequences: legal/business ownership, membership, billing and audit boundaries become clearer. Small organizations do not need a Project before using the platform. Project-specific access may later be layered onto Organization membership without changing data ownership or the tenant root.
- Migration: create one Organization for each existing tenant, dual-write legacy ownership, switch authorization, constrain organization ownership, then resolve Store and Project semantics.

## DEC-006 RBAC

**Status: Accepted — 2026-07-17**

- Context: roles are strings with scattered checks.
- Options: role strings; fixed roles mapped to permissions; fully custom policy engine.
- Decision: Organization membership starts with `OWNER`, `ADMIN`, and `MEMBER`, mapped centrally to typed permissions. OWNER and ADMIN can access everything in the Organization, including every Project. Teams group existing Organization members. MEMBER users receive Project access directly or through Teams, initially using Project roles such as `MANAGER`, `EDITOR`, and `VIEWER`. Organization membership is always checked before Project grants, and removing membership revokes all Team and Project access.
- Consequences: owners and administrators retain recovery and audit access, while operational users can be constrained to selected Projects. Team and direct grants require deterministic precedence rules and centralized API policies.
- Migration: translate legacy owner/member roles, introduce Organization membership first, then add Team, TeamMember and ProjectAccess records. Custom Organization roles remain deferred until real demand.

## DEC-007 Database access

**Status: Accepted — 2026-07-17**

- Context: API/auth are current Prisma consumers; future leakage is possible.
- Options: shared Prisma everywhere; API-only; separate service DBs; application isolation with or without PostgreSQL RLS.
- Decision: Prisma is importable only by API/infrastructure. Repositories and application services require authenticated Organization context. Business tables carry `organizationId`, with compound constraints preventing cross-Organization relationships. PostgreSQL RLS is required as defense in depth, using transaction-local Organization context; it supplements rather than replaces API authorization.
- Consequences: automated development is protected from missed tenant predicates at both application and database layers. Connection-pool and background-job context must be designed and tested carefully to prevent stale or missing Organization context.
- Migration: add CI forbidden-import rules and Organization-aware repositories/constraints; build a transaction-context harness and adversarial two-tenant tests; enable RLS policies before expanding tenant-sensitive product modules.

## DEC-008 Background jobs and event architecture

**Status: Accepted — 2026-07-17**

- Context: notifications/webhooks/AI require retries; none exist.
- Options: synchronous only; PostgreSQL jobs; Redis/BullMQ; RabbitMQ; broker-first microservices; job port plus transactional outbox.
- Decision: use a transactional PostgreSQL outbox and PostgreSQL-backed durable job runner first, behind a narrow `JobQueue` interface. Jobs carry Organization context, idempotency keys, retry policy and audit metadata. BullMQ/Redis is the planned scaling path for measured concurrency, scheduling, rate limiting or long-running workload needs. RabbitMQ is deferred until independent services and complex routing are demonstrated requirements.
- Consequences: reliable atomic event capture with minimal initial infrastructure; workers and database capacity must be monitored. Moving job execution to Redis later does not remove the PostgreSQL outbox.
- Migration: introduce the outbox and job abstraction with enquiry notification, add an inbox for external webhooks, then reuse across communications, payments, media, analytics and AI.

## DEC-009 File storage abstraction

**Status: Accepted — 2026-07-17**

- Context: Spaces env/dependency exists without a shared lifecycle.
- Options: direct AWS SDK calls; one `ObjectStorage` port; external media SaaS; proxy uploads through API.
- Decision: Cloudflare R2 is the initial object store, accessed through an S3-compatible `ObjectStorage` port. The API authorizes uploads and issues short-lived signed URLs; browsers upload directly. Media metadata and ownership remain in PostgreSQL, object keys are Organization-aware, and workers perform validation/processing. DigitalOcean Spaces is the planned compatible alternative when needed.
- Consequences: low-cost initial storage, direct-upload scalability and provider portability. Application modules cannot depend on R2-specific APIs, bucket names or public URLs.
- Migration: replace existing loose Spaces environment usage with typed R2 configuration and the shared port; inventory/backfill existing objects before any provider migration.

## DEC-010 Payment-provider abstraction

**Status: Accepted — 2026-07-17**

- Context: schema anticipates providers but no workflow/webhooks exist. Organization customer payments and Saroh subscription billing have different owners, credentials and lifecycles.
- Options: provider-specific domain; generic lowest-common-denominator; domain intents with provider adapters.
- Decision: Organization customer payments use an Organization-owned merchant-payment domain with PaymentIntent/Attempt/Refund records, encrypted Organization provider configuration, provider adapters, signed webhook inbox and idempotent reconciliation. Razorpay and Cashfree are the first India-focused adapters; international providers are added later. Saroh subscription billing uses separate records, credentials, webhooks and a separate `BillingProvider` contract.
- Consequences: Organizations control their payment providers and records without mixing merchant money with Saroh revenue. Two initial adapters require shared contract tests while preserving provider-specific capabilities and metadata.
- Migration: map existing transaction/config rows to Organization ownership, implement Razorpay and Cashfree against one `MerchantPaymentProvider` contract, and keep platform subscription data out of these tables.

## DEC-011 Communication providers

**Status: Accepted — 2026-07-17**

- Context: SMTP auth mail exists; business communication does not.
- Options: direct provider calls; universal messaging abstraction; channel-specific ports behind communication domain; Saroh-managed delivery versus Organization-owned providers.
- Decision: Organization business communications use Organization-scoped providers and credentials behind separate `EmailProvider` and `WhatsAppProvider` ports, with shared Message/Delivery/Consent workflows and jobs. Real messages require the Organization to connect its own provider. Saroh-owned email may be used only for a constrained template test sent to the currently authenticated user's verified account email; it cannot target arbitrary recipients or act as the Organization's production sender. Identity/security email remains separate and Saroh-owned.
- Consequences: sender cost, reputation and compliance stay with each Organization while users can preview/test templates before provider setup. The test-send path requires strict recipient, rate-limit and labeling controls.
- Migration: retain the identity email sender, add the restricted self-test flow, then add Organization provider connections and business delivery records.

## DEC-012 Analytics event model

**Status: Accepted — 2026-07-17**

- Context: no analytics pipeline.
- Options: derive from operational tables; third-party only; canonical append-only events plus aggregates.
- Decision: Saroh owns a versioned, append-only canonical event model and derived aggregates. Organization customer/business events carry `organizationId`, optional `projectId`, site/source, subject identifiers, event/version, timestamp, attribution and consent context. Payloads exclude secrets and minimize or pseudonymize visitor PII. Organization analytics is logically and access-control separated from Saroh product-usage/operational analytics. Organizations may optionally forward permitted events to their own analytics providers without making those providers the system of record.
- Consequences: site views, enquiries, lead changes, bookings, orders, revenue and communication outcomes can form trustworthy funnels. Event retention, consent, deletion/anonymization, schema evolution, ingestion abuse and aggregate isolation require explicit policies. Operational PostgreSQL storage is acceptable initially; jobs build aggregates and storage can evolve behind the analytics boundary when measured volume requires it.
- Migration: define the envelope and taxonomy first; begin emitting at site publication/view and enquiry creation; add deterministic aggregate reconciliation tests; never fabricate historical events from current rows.

## DEC-013 Feature flags

**Status: Accepted — 2026-07-17**

- Context: tenant migration and staged modules need controlled rollout.
- Options: environment flags; server-managed flags; external feature-flag SaaS.
- Decision: use a typed server-side `FeatureFlagService`, backed by PostgreSQL and controlled through `admin.saroh.in`. Flags support a hard-coded safe default, global database default and Organization overrides; percentage/cohort targeting may be added later. Every change records operator, reason, timestamp, owner/risk metadata and optional expiry. API services enforce flags, not only the UI. Environment overrides have highest precedence and are reserved for emergency kill switches.
- Consequences: controlled betas, migration rollout and emergency response do not require code changes. Admin access is security-sensitive. Flags remain distinct from subscription entitlements, user authorization and Organization configuration, and temporary flags need expiry/removal discipline.
- Migration: introduce the registry/admin audit flow for Organization authorization rollout, then add Organization overrides and safe cleanup checks.

## DEC-014 Subscription entitlements

**Status: Accepted — 2026-07-17**

- Context: no subscription model; future modules need limits.
- Options: UI gating; scattered plan checks; feature flags as plans; centralized entitlements.
- Decision: use versioned Plan, Organization Subscription and Entitlement models with a server-side `EntitlementService`; UI mirrors results but cannot enforce them alone. Entitlements represent booleans and limits such as sites, members, bookings or message volume. Saroh platform billing supports Razorpay and Cashfree through a separate `BillingProvider` contract, Saroh-owned credentials, billing records and webhooks. These remain isolated from Organization merchant-payment provider connections even when the same vendor is used.
- Consequences: commercial rights are consistent, testable and independent of temporary feature flags. Multiple Saroh billing adapters require idempotent subscription/invoice reconciliation and clear provider failover/selection rules.
- Migration: assign every existing Organization an explicit free or grandfathered entitlement set, then introduce Saroh billing accounts/subscriptions without reading Organization merchant-payment records.

## DEC-015 AI provider abstraction

**Status: Deferred — revisit after Stages 0–7 are operating**

- Context: AI is roadmap-only.
- Options considered for later: direct SDK per feature; generic text endpoint; job-based AI domain with provider adapters.
- Decision: do not design or implement AI now. Do not add AI provider dependencies, schemas, product promises or disconnected AI interfaces while the core platform is incomplete.
- Consequences: engineering remains focused on Organization tenancy, publishing, CRM, bookings, commerce, communications, analytics and subscriptions. The eventual AI design can use real workflows, privacy constraints, entitlement requirements and operational evidence rather than speculation.
- Migration implications: none now. Reopen this decision only after Stages 0–7 are operating and before beginning Stage 8; at that point evaluate provider abstraction, asynchronous jobs, provenance, metering, redaction and human approval.

## DEC-016 Organization modules (capabilities)

**Status: Accepted — 2026-07-22** — see [ADR-003](./adr/ADR-003-organization-modules.md)

- Context: Saroh must serve service, commerce, and hybrid businesses by _business need_, not size. There is no customer-owned notion of "this Organization runs Appointments"; feature flags (rollout) and entitlements (commercial rights) do not express it.
- Options: overload feature flags; overload entitlements; add a third, customer-owned module-installation concept with a typed registry.
- Decision: introduce Organization **modules** as a separate control plane. A capability is available only when four independent gates pass — rollout flag, module installation (Organization-enabled, Project-selected), entitlement, and authorization. A typed server-owned registry (Website, CRM, Appointments, Commerce, Payments, Communications, Automations, Insights) is the single source of truth; frontends consume a serialized projection. AI is not a module (DEC-015). Lifecycle (`DISABLED|ENABLED|ARCHIVED`) is persisted; readiness (`SETUP_REQUIRED|ACTIVE|ATTENTION_REQUIRED`) is derived. Disabling stops new activity without deleting history or abandoning public/financial obligations.
- Consequences: rollout, pricing, configuration, and permission changes stay independent; modules dark-roll out (rollout flags default false); dependency and permission logic stays server-side. Follow-on work (#113–#117) adds persistence/backfill, availability composition, readiness/deactivation adapters, module APIs, the capability-aware shell, and domain enforcement.
- Migration: backfill existing Organizations from evidence of current use (idempotent) so deployed functionality does not disappear; per-domain `projectId` ownership is a separate, deliberate migration before Project filtering.
