# Product Roadmap

The delivery rule is vertical: complete one customer journey before expanding horizontally. The first journey is account → Organization/business profile → templated site → publish → visitor enquiry → contact/lead → notification → pipeline update → follow-up.

## Stage 0: Repository stabilisation

- Objective/user value: make every change measurable and deployable; users receive fewer regressions.
- Scope: canonical naming decision, app inventory, deterministic install/build, ESLint replacement, per-package typecheck, isolated test DB, CI, migration reconciliation, env schemas, structured errors/logging baseline.
- Non-goals: new product capability or broad refactor.
- Backend/database: migration baseline, test DB harness, API lint, health/readiness and request IDs.
- Frontend: self-host fonts, repair build/lint scripts, expose real error states.
- Security/tests: secret/dependency scans; CI must run Prisma generate/migrate, types, lint, unit/integration tests and production builds.
- Migration concerns: inspect deployed DB before generating reconciliation migrations.
- Acceptance: clean clone passes documented gates on supported Node/pnpm; no dev DB used by tests.
- Dependencies/risks: access to deployed schema and deployment settings; avoid normalizing names before domain choice.

## Stage 1: Authentication, Organizations and tenant security

- Objective/user value: a user safely creates and switches between business Organizations.
- Scope: Better Auth cleanup, BusinessProfile, mandatory Organization ownership, invitations, OWNER/ADMIN/MEMBER permissions, Teams, optional Projects and Project access, Organization switcher, audit events and RLS.
- Non-goals: custom roles, SSO, 2FA or billing.
- Backend/database: Organization application service/policy; Team and Project grants; backfill legacy stores; transaction-local context, compound constraints, RLS and dual-read/write transition.
- Frontend: onboarding, business profile, Organization switcher and Team/Project access management.
- Security/tests: actor-derived context, no trusted client Organization ID, role/Team/Project matrix, negative cross-tenant and connection-pool RLS tests, cookie/CSRF E2E.
- Migration concerns: one Organization per existing store tenant initially; preserve store routes through adapters.
- Acceptance: a multi-Organization user switches safely; OWNER/ADMIN see every Project; MEMBER sees only directly/Team-granted Projects; cross-Organization SQL is blocked; NextAuth references are zero.
- Dependencies/risks: Stage 0 and Store semantic product decision.

## Stage 2: Site management, CMS and section-based page builder

- Objective/user value: create a site from a template and publish it.
- Scope: Site/Page/PageVersion/Section/Publication, template manifest/versioning, preview, custom subdomain and public renderer.
- Non-goals: arbitrary drag-and-drop, marketplace or collaboration editing.
- Backend/database: versioned schema validation, publication read model, cache invalidation, domain routing.
- Frontend: guided template choice, business-profile defaults, section editor, preview/publish.
- Security/tests: drafts private; renderer reads only immutable publications; sanitize rich content; domain ownership tests.
- Migration concerns: map current posts/custom domains where possible; templates must be versioned.
- Acceptance: Organization owner publishes a templated responsive site and a public visitor can load it.
- Dependencies/risks: Stage 1; schema evolution and renderer cache invalidation.

## Stage 3: Forms, contacts and CRM

- Objective/user value: turn site enquiries into trackable leads and complete the first target journey.
- Scope: form builder MVP, consent, submissions, contact dedupe, lead/pipeline/stages, activities/tasks, owner notification and manual follow-up logging.
- Non-goals: bulk imports, campaigns, advanced scoring or arbitrary automation.
- Backend/database: atomic submission → contact → lead transaction; outbox notification; pipeline commands.
- Frontend: enquiry section, inbox/contact/lead views and stage board.
- Security/tests: rate limiting, spam controls, PII redaction/retention, Organization isolation and idempotency tests.
- Migration concerns: distinguish existing commerce Customer from CRM Contact; do not overload the model.
- Acceptance: all 10 steps of the target journey work and are E2E tested.
- Dependencies/risks: Stages 1–2, jobs/notifications; duplicate identities and spam.

## Stage 4: Services and appointment booking

- Objective/user value: publish services and accept appointments.
- Scope: services, availability rules, timezone-safe slots, booking lifecycle, confirmations.
- Non-goals: multi-resource scheduling, marketplace discovery or complex classes.
- Backend/database: availability engine, concurrency-safe booking and calendar provider port.
- Frontend: service editor, public booking flow and booking calendar/list.
- Security/tests: public abuse controls; no double booking; timezone/DST and cancellation tests.
- Migration concerns: immutable booking snapshots for service/time/price.
- Acceptance: visitor books an available slot and both parties receive durable confirmation.
- Dependencies/risks: Stage 3 communications foundation; calendar edge cases.

## Stage 5: Commerce and payments

- Objective/user value: sell products/digital services and reconcile payments.
- Scope: harden current catalog/order/inventory, checkout, Organization-owned Razorpay and Cashfree merchant-provider connections, webhooks, refunds and delivery hooks. Keep Saroh billing separate.
- Non-goals: multiple gateways, advanced tax/shipping or marketplace payouts.
- Backend/database: order state machine, payment attempts, idempotent webhook inbox and reconciliation jobs.
- Frontend: checkout, receipt and owner order/payment views.
- Security/tests: server-calculated totals, signed webhooks, replay protection and concurrency tests.
- Migration concerns: preserve existing Store/Product/Order data while attaching Organization ownership.
- Acceptance: paid order reconciles exactly once and refund is auditable.
- Dependencies/risks: Stages 1 and 0 test harness; financial correctness.

## Stage 6: Email, WhatsApp and automations

- Objective/user value: reliably follow up with leads/customers.
- Scope: Organization-owned email/WhatsApp providers, templates/messages, consent, transactional delivery, simple trigger/action automations and delivery ledger; Saroh only supports restricted self-test email.
- Non-goals: full marketing automation suite or multi-channel attribution.
- Backend/database: communication jobs, consent/preferences, provider webhooks and retries.
- Frontend: templates, message history and small automation builder.
- Security/tests: unsubscribe/consent, encrypted credentials, PII-safe logs and webhook tests.
- Migration concerns: keep Saroh identity/test email separate from Organization business messaging.
- Acceptance: lead follow-up is queued, delivered/retried and visible with status.
- Dependencies/risks: job/outbox and provider compliance.

## Stage 7: Analytics and reporting

- Objective/user value: understand traffic, enquiries, bookings and sales.
- Scope: canonical event model, first-party collection, funnel and business dashboards.
- Non-goals: general BI or session replay.
- Backend/database: consent-aware event intake, partitions/retention and aggregation jobs.
- Frontend: site and conversion dashboards with date/Organization/Project filters.
- Security/tests: never mix tenant aggregates; privacy/retention controls and aggregate fixtures.
- Migration concerns: version events; avoid using mutable operational rows as event history.
- Acceptance: published-site → enquiry funnel reconciles to source records.
- Dependencies/risks: Stages 2–6; event volume/cost.

## Stage 8: AI-assisted workflows

- Status/objective: deferred by DEC-015 until Stages 0–7 operate; no AI product work is currently authorized.
- Scope: none during the approved roadmap window. Reopen architecture discovery before any Stage 8 implementation.
- Explicit non-goals: AI dependencies, schemas, provider selection, product promises or disconnected demonstrations.
- Backend/database/frontend: none until the decision is reopened.
- Security/test/migration requirements: to be decided from real workflows, privacy constraints, entitlements and operations evidence.
- Acceptance: the platform contains no premature AI coupling; a later reviewed decision is required to activate Stage 8.
- Dependencies/risks: completion and operational review of Stages 0–7.

## Stage 9: Marketplace and extensibility

- Objective/user value: extend sites and business workflows safely.
- Scope: versioned template marketplace, integration manifests, scoped credentials/webhooks and review process.
- Non-goals: arbitrary server code or premature microservices.
- Backend/database: installation/permission model, compatibility contracts and revocation.
- Frontend: discovery, install/configure/update flows.
- Security/tests: sandboxing, least privilege, signing/review and compatibility suites.
- Migration concerns: preserve template versions and installed configuration.
- Acceptance: a reviewed extension installs, operates only within scopes and can be revoked cleanly.
- Dependencies/risks: mature modules/events/entitlements; ecosystem supply-chain risk.
