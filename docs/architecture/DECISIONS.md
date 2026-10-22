# Architecture Decision Log

Unless an entry says otherwise, its status is **Proposed — requires audit review**.

> **2026-08-08:** merchant sites moved off `saroh.in`. The public renderer named
> `sites.saroh.in` below is now `apps/saroh.app`, served from `saroh.app`, and tenant
> sites hang off `*.saroh.app`. `saroh.in` stays canonical for Saroh's own surfaces
> (DEC-001) and the domain-as-application-name rule (DEC-002) is unchanged.

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
- **Correction — 2026-09-12 (#276).** There are now four Organization roles: `REVIEWER` joined `OWNER`, `ADMIN` and `MEMBER`. It is not a rung on that ladder. A reviewer holds exactly `site:read`, `site:comment` and `site:approve` — it does not get the read-only floor the other three share, so it sees neither the roster nor the org's stores, contacts or media. It exists because the person who signs work off is often not the person who wrote it, and inviting them must not mean handing over the business.
- **Correction — 2026-09-12 (#276).** A reviewer's `site:read` is narrowed per site by `SiteReviewer(siteId, userId)`, applied in `assertSiteInOrg` and `listSites`. A site nobody invited them to is a 404, not a 403: they are not told which other sites exist. "Reviewer" means the site they were asked about, never every site the business has.
- **Correction — 2026-09-12 (#276).** Membership is now assignable. `OrganizationInvitation` carries the role (and, for a reviewer, the sites) with a hashed token that expires in a week; the roster endpoints sit under `member:read`, `member:invite`, `member:role:update` and `member:remove`. The last OWNER cannot be demoted or removed — the S1-006 invariant, enforced in a serializable transaction at the write layer, because no role→action map can express the state of a roster.

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
- Implementation note (2026-09-11): built as one `CommsProvider` port with per-channel adapters (`email.provider.ts`, `whatsapp.provider.ts`) selected by a factory, rather than separate `EmailProvider` and `WhatsAppProvider` ports.
- Consequences: sender cost, reputation and compliance stay with each Organization while users can preview/test templates before provider setup. The test-send path requires strict recipient, rate-limit and labeling controls.
- Migration: retain the identity email sender, add the restricted self-test flow, then add Organization provider connections and business delivery records.
- Amended 2026-09-26 by [DEC-037](#dec-037-a-businesss-customers-sign-in-on-its-own-site-with-a-code-one-account-per-business): **Saroh's identity email also sends the sign-in codes for a business's customer accounts**, in the business's name. That is still identity mail. Every other message to a business's customers goes through the business's own provider, as before.
- Amended 2026-10-06 by [DEC-086](#dec-086-saroh-sends-a-businesss-customer-notifications-until-it-connects-its-own-email): **until a business connects its own email provider, Saroh's email sends its customer notifications** (booking confirmations and the like). Once it connects one, its provider sends them, as above.
- Reaffirmed 2026-10-07 (owner): **a business's messages to its customers go only through its own connected email provider**, review invitations included; Saroh's identity email keeps only sign-in codes and the email-changed notice (ADR-011). DEC-086 is reversed and its code stays off.
- Amended 2026-10-07 (owner) — **who sends what: whoever is speaking sends it.** (A) Saroh to its own users — sign-in, verification, password and email changes, account deletion, team invitations, Saroh's own billing mail, the waitlist — and (B) Saroh to a business about the business — enquiry alerts and the team alerts (new order, booking, failed payment, someone joined), which move from the business's provider to Saroh — go from **Saroh**. (C) A customer's sign-in on a business's site: with Saroh's built-in customer accounts, **Saroh** sends the codes (‹Business› via Saroh, ADR-011); a business that brings its own login system (Firebase, Auth0, Google or GitHub sign-in, phone OTP) has that system send its own, and Saroh sends nothing — a later feature. (D) A business to its customers — invoices, booking and order notices, waitlist offers, autopay mail, review invitations, marketing — only through **the business's own connected provider**; with none, nothing is emailed. The workspace asks owners and admins to connect their email provider so their customers get emails. Both are built: team alerts from Saroh (#849: `sendTeamAlertEmail`, fixed words and cleaned names only), and that prompt (#850: Home's Needs you and Settings › Providers, from `GET …/comms-providers/email-setup`; Connect for `comms:manage`, or on a plan that can't connect one, DEC-091, See plans for `billing:read`; gone once one is connected), whose note also says why an invoice or a review invitation can't be emailed.
- Amended 2026-10-20 by [DEC-172](#dec-172-merchant-sites-get-three-looks-on-one-engine-folio-and-quiet-fully-live-for-gyms) (owner): **Saroh's identity email also sends a customer's data-removal acknowledgement and its done notice**, beside the sign-in codes, because they are about the customer's own account.

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

## DEC-017 A Site owns a Post

**Status: Accepted — 2026-09-04** — see [ADR-004](./adr/ADR-004-site-owns-a-post.md)

- Context: `Post` and `PostCategory` hung off a `Store` from the original scaffold, so a business with a website and no commerce store could not write at all. Writing is not a commerce capability, and #164 had already corrected the same class of mistake for Sales.
- Options: leave it on the Store; move it to the Organization (the answer #164 gave for Sales); move it to the Site.
- Decision: the **Site** owns a post. A post is published to an audience at an address, so "which site does this appear on" is the ownership question; the Organization would leave that to a second column. `Post.authorId` becomes a `User` rather than a `StoreMembers` row, which had meant a store owner — never a member — wrote posts with no author at all.
- Consequences: `/stores/:storeId/posts` becomes `/organizations/:organizationId/sites/:siteId/posts`; authorization stops going through `StoresService` and uses the site policy (`site:read`, `section:write`), so posts obey the same rules as the pages beside them. The dashboard screens move from the store to the site. `ContentModule` no longer depends on `StoresModule`. Publishing to the public goes through a per-post, path-scoped `Publication`, keeping the invariant that the public reads only what publish wrote — designed here, built with the surface.
- Migration: `20260904210000_site_owns_a_post` — additive `siteId`, backfilled store → organization → oldest site, then narrowed. It **raises rather than guesses**: a post whose organization has no site, or a slug that would collide on its new site, stops the migration with a count instead of dropping rows. The three row-level-security policies that read `Post.storeId` (`Post`, `PostCategory`, and `Comment`, which reaches an organization through the post) are rebuilt against the site.

## DEC-018 One storefront and one website per business, for now

**Status: Accepted — 2026-09-22** — see [ADR-006](./adr/ADR-006-one-storefront-one-website.md)

- Context: an Organization can hold any number of Stores and Sites, and the workspace grew pickers, counts and "New storefront" buttons to match. For the small businesses Saroh serves — one shop, one website — every picker is a question with no reason behind it.
- Options: keep multi everywhere; add a unique constraint (one per organization) in the schema; keep the schema multi and cap creation.
- Decision: **cap creation at one storefront and one website per business**, in the API's only two creation paths (`StoresService.createForUser`, `SitesService.createFromTemplate`), refusing a second with a `409` and a plain sentence. One constant each, so it lifts in one line. The product cap sits beside the plan's `sites` entitlement (DEC-014) and is checked first; the lower wins. Storefront and website are not merged — mapping one to the other is future work for when there are several. Posts stay on the Site (ADR-004).
- Consequences: screens assume one; "New storefront" / "New site" appear only when there is none; pickers appear only when a business already has more than one; copy is singular. Businesses that already have several keep everything and can still use all of it.
- Migration: none. The schema is unchanged; the demo seed moves Northwind Supply's extra sites into their own demo businesses.

## DEC-019 Subscriptions, invoices, online classes, courses and class packs

**Status: Accepted — 2026-09-22** — see [ADR-007](./adr/ADR-007-subscriptions-invoices-classes.md)

- Context: gyms, studios and clinics sell memberships, courses and class packs and send invoices, and until now Saroh could list them but not run any of it; Saroh's own `Plan`/`Subscription` billing is a different thing and stays untouched.
- Options: build on Commerce (orders and storefronts); integrate a billing provider's subscriptions; model it on the Organization and Contact.
- Decision: **Organization-owned subscription plans, customer subscriptions, invoices, courses and class packs**, on the Contact, with no storefront needed. Invoices are simple (DRAFT → ISSUED → PAID or VOID; overdue derived; numbered per business on the caller's transaction). Subscriptions bill forward only, per period, from a self-rescheduling renewal job; no card on file. Courses are their own module (depends on Appointments); packs sit under Appointments; subscriptions and invoices under Payments, which keeps working without a connected provider (readiness opt-out). With Payments off nothing new is invoiced. Race safety comes from row locks plus Serializable, which the RLS proxy now preserves.
- Consequences: Billing (`/billing/…`), Courses (`/courses`) and Class packs appear in the workspace; contact deletion takes a person's holdings with it and cancels their future course and pack bookings; the booking capacity count includes seats an open course still holds.
- Migration: `20260922120000_subscriptions_invoices_classes` (tables, partial indexes, RLS) and `20260922190000_one_live_subscription_per_person`; rollout flag `MODULE_COURSES` must be added in each environment.
- Amended 2026-09-26 by [DEC-038](#dec-038-autopay-card-on-file-and-per-session-charges-run-on-the-businesss-own-payment-provider): **autopay and card-on-file come from the business's own payment provider** (mandates and provider subscriptions). Each period is still invoiced, and a pay link stays the fallback.
- Amended 2026-09-29 by [DEC-070](#dec-070-saroh-is-for-businesses-people-working-for-themselves-and-people-showing-their-work): **invoices are no longer under Payments.** Creating, issuing, sending, voiding, crediting and recording an invoice paid need only `invoice:*`; an online pay link still needs Payments and a connected provider (`payOnline`), and without one Send sends a link to view the invoice. "With Payments off nothing new is invoiced" now reads **nothing is invoiced automatically**: renewals wait, subscribing is refused, and a pack or course is recorded without an invoice.

## DEC-020 A Member sees the diary and the people on it

**Status: Accepted — 2026-09-22**

- Context: a Member was read-only over the org, its roster, stores and sites. A clinic's receptionist or doctor, added as a Member, could not see the appointments they work from — the showcase CarePoint Clinic made that plain.
- Options: keep Members off bookings; invent a clinic role; give every Member the diary.
- Decision: **every Member holds `booking:read`, `service:read` and `contact:read`** — a change for every business. Still no writes, no leads (`lead:read`), no pipeline (`pipeline:read`) and nothing about money (orders, invoices, subscriptions, packs, courses). The CRM module now asks for `contact:read` rather than `lead:read`, so a Member reaches Contacts; Leads and Pipeline rows ask for their own actions, and their API routes already refuse without them. A contact's page hides Edit, Add a lead and Delete, and its Leads section, from a viewer who lacks the action.
- Consequences: a business that wanted Members kept away from its customer list makes a custom role. Search returns contacts to a Member, never leads or orders.
- Migration: none; built-in role permissions live in code (`organization-policy.ts`).

## DEC-021 The admin console: one operator surface for the instance

**Status: Accepted — 2026-09-23** — see [the plan](../plans/2026-09-23-001-feat-admin-console-plan.md)

- Context: `admin.saroh.in` had three screens over a control plane where most staff permissions had no endpoint; granting access meant SQL, and nothing could suspend a business, read a queue or invite from the waitlist.
- Options: re-skin the three screens; fork a second admin API; extend the existing control plane.
- Decision: **extend the control plane** under the same guards, and make the console the one place an operator runs the instance: businesses (directory, a support-session business page, lifecycle, plan, trial, raised limits, modules, notes), people (search, sessions, roles, invitations), the team and its access, the machinery (health board, jobs, webhooks, providers, durable dry-run-first operations), releases (flag metadata and an inspector) and the waitlist. The console is **dark by default and does not follow the system**, with the same tokens and the same Saffron — dark is the whole of the difference. Suspension blocks new activity but keeps reads and the site. Only a failed webhook is replayed. A waitlist signup is marked invited only once its email left.
- Consequences: the permission vocabulary drops `incidents:read`/`incidents:write` (incidents are deferred and nothing required them) and gains `waitlist:invite` (Support and Owner). `DataView` and `PageContainer` move into `@saroh/ui`. Deferred: incidents, flag cohorts and percentage rollout, charging for Saroh itself, write-mode view-as, a fleet view; a business past its deletion window is not yet deleted by anything — the date is shown, and deleting it stays a manual step.
- Migration: `20260923120000_admin_console` (`EntitlementOverride` with RLS, `AdminOrganizationNote`, `AdminOperation`, `AdminOperationItem`); new optional env `ACCOUNTS_URL` for waitlist invitation links.
- Amended 2026-10-09 (owner, #921): **a deleted business stops billing, goes offline and keeps only its records.** The daily sweep (#907) takes a business past its window to `DELETED_RETAINED`; from then it has its Saroh billing subscription cancelled at the provider and none can start, its website(s) and custom domains are offline (Cloudflare hostnames removed), its members can't open it (staff still read it from the console), and its media files, payment-provider keys and pending jobs are removed or cancelled (`organization.deletion.cleanup`, retried until done and flagged "Deletion clean-up unfinished" on the console until it is). Orders, invoices, credit notes, customers and both audit trails are kept (ADR-008, GST). **During the window (`PENDING_DELETION`) no renewal is charged and nothing new that charges can start**: scheduling deletion ends Saroh's provider subscription with the period already paid (a trial at once), so a reinstated business keeps its plan to that period's end and then chooses again; the business's own renewals and autopay debits to its customers wait too. The site and the members' door stay as they were until the window ends. Suspension is unchanged: it stops activity and keeps billing, the site and the door. What each state does is one table, `organization-lifecycle.policy.ts`, and a test fails a new state until it is decided for billing, the public site and the members' door (DEV_LEARNINGS → "deleted" changed only a label).
- Amended again 2026-10-09 (owner, #921 follow-up): **refunds owed to customers hold a deletion back.** While a business still owes any refund — owed and not asked for, refused, being sent, or sent and not yet confirmed by its provider (`payments/refunds-outstanding.ts`, which reads Home's and Order Detail's own definitions, plus queued `payments.send-refund` jobs) — the sweep leaves it `PENDING_DELETION` past its window, notes it on the admin ledger once a day (`organization.deletion.waiting_on_refunds`) and the console flags it "Deletion waiting on refunds" with the list (amount, customer to a PII reader, order or invoice, provider reference); each daily run checks again. The clean-up never cancels a `payments.send-refund` job and deletes no keys while one is owed. **During the window the workspace shows a banner on every page** with the date, the refunds not yet back with customers ("These refunds haven't gone back to your customers yet. Finish each one, and check it in your ‹Provider› dashboard.", each linked to its order or invoice) and the customers' autopay memberships active at the provider, which deletion doesn't cancel there. Workspace writes stayed closed in the window until DEC-120 opened the ones that finish existing work. **The clean-up deletes the messaging keys too** (`CommunicationProvider`, email and WhatsApp) with the payment keys. **Every provider call on a business's way out logs one line**, `deletion_provider_call org=… provider=… call=… result=… ref=…` (ids only), and each clean-up run is an `organization.deletion.cleanup` ledger row with every step's result; the console's business page shows the deletion trail from the ledger. **Disconnecting a payment provider says it cancels no autopay memberships there**, with how many are active.
- Amended a third time 2026-10-09 (owner, DEC-120): **the window winds the business down rather than freezing it.** `PENDING_DELETION` reads `activity: "wind-down"` in the lifecycle table: nothing new starts, existing orders, bookings and memberships can be finished, cancelled and refunded, and an owner can download the business's data. Suspension is unchanged (no writes but the data download).
- Amended a fourth time 2026-10-10 (owner, DEC-122): **a deleted business keeps its data and files for 180 days, and a legal hold stops every deletion.** The 9 Oct amendment above had the clean-up delete a business's media on the day its window ended, and nothing ever removed its personal data. Now the clean-up only shuts access off (billing cancelled, hostnames removed, pending jobs cancelled, payment and messaging keys deleted at once, with the site offline and the members' door closed by the lifecycle table as before) and keeps every record and file; `organization.retention.erase` erases the files and the personal data 180 days after `deletedRetainedAt`, never invoices, credit notes or orders' tax facts (ADR-008). "Its media files … are removed" above no longer describes the clean-up. A business on legal hold is never deleted, cleaned up or erased, can't have a deletion scheduled and can't be reinstated; suspension itself is otherwise unchanged. The console's deletion trail shows "Data kept until ‹date›".

## DEC-022 Products: stock per variant, a photo set, and sections as the save unit

**Status: Accepted — 2026-09-24** — see [the plan](../plans/2026-09-23-002-feat-product-detail-settings-editor-plan.md) · epic #481

- Context: one inventory row per product could not say a 15 ml bottle ran out before a 50 ml one; a product had one picture; and the editor's single Save made a bad variant block a price fix.
- Options: stock on the variant row; a separate per-variant stock table; keep one count and warn in words.
- Decision: **stock per variant in its own table** (`VariantInventory`), with the product's `Inventory` kept 1:1 for products without variants and for promises made before the switch; an order line names its variant and moves that row. **A product has an ordered set of at most five photos** (`ProductImage`), the first mirrored to `Product.image` as the cover. **The editor saves by section** — Basics, Description, How to use, Made by, Photos, Visibility, Variants, Stock — each its own call with its own Discard and Save; Save all saves the ones that can and names the rest. The API judges cross-field rules against the product _after_ the patch, and merges shop switches rather than replacing them. **Uncategorized is null**, never a row. A variant's value comes from the store's options (Settings → Options), and a product's option can't change while it has variants.
- Consequences: Settings holds categories, options, custom fields, allergens, the SKU pattern and defaults; the SKU rules are pure and kept identically in the API and the app. Custom fields and allergens are per storefront, soft-deleted fields keep their values (a purge job is deferred). Archiving stamps `archivedAt`. Deferred: the public product page (#473), SEO on the website, a purge of deleted fields' values.
- Migration: `20260923150000_products_v2`, `20260924100000_catalogue_extras`, `20260924110000_allergen_fk`, `20260924120000_product_archived_at` — all with `org_isolation` RLS where rows carry an organization; the chain replays from empty.

## DEC-023 An invoice for every order, issued invoices never change, and GST

**Status: Accepted — 2026-09-23** — see [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) · epic #506 · amends [ADR-007](./adr/ADR-007-subscriptions-invoices-classes.md)

- Context: the designs show an invoice for every sale and GST tax invoices for a registered business; ADR-007 kept store orders on their own receipt, corrected mistakes by voiding, and left GST out.
- Options: keep orders uninvoiced; make the invoice the ledger and pay orders through it; invoice each order while the order stays the ledger.
- Decision: **every order and every paid online booking makes one invoice**, created in the payment reconciliation (or by the order service for pay-later and hand-recorded payments). **The order stays the ledger**: its invoice has no pay link and mirrors the order's payment and refunds. Aggregates count each rupee once — takings and spent are orders plus non-order invoices; owed leaves order invoices out. **An issued invoice is never edited or deleted**: a credit note corrects down, a supplementary invoice up, each referencing the original; a GST-registered business cannot void an issued invoice (drafts are discarded, issued ones credited), and void stays for unregistered receipts. **GST** is a business setting (`gstRegistered`, `gstState`, GSTIN in `taxId`) plus a rate and HSN/SAC on what is sold: prices include GST, a discount is spread across lines before tax, delivery is a taxed line, place of supply is bill-to state, then delivery state, then the business's state (CGST + SGST within it, IGST outside). Registered businesses issue tax invoices, others receipts. `InvoiceSequence` is keyed by business and series — prefix and financial year when registered, a plain prefix otherwise, credit notes on their own series, at most 16 characters; existing numbers are kept. A registered business's orders ignore the storefront's old add-on tax.
- Consequences: the invoice list holds every sale; tax settings are Owner/Admin only; the GST maths is one pure, test-first module. Deferred: GST returns and exports, e-invoicing (IRN/QR), TCS.
- Migration: `<ts>_gst_and_order_invoices` (U5) — existing sequence rows become the legacy INV series; existing orders get no invoices.
- Amended 2026-09-25 (#508): **money in has an invoice, money out a credit note — even money the order never asked for.** A payment on a superseded edit charge (#508 U8) stays off the order's paid sums and is owed back, but it is invoiced when captured (a supplementary invoice, PAID online, spread over the invoiced lines). Its refund's credit note mirrors that invoice line for line, so takings read the money in, then out.

## DEC-024 A Member moves kitchen stages

**Status: Accepted — 2026-09-23** — see [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) · amends DEC-020

- Context: the person at the counter marks an order Preparing, Ready and Collected. Under DEC-020 a Member sees nothing about orders, because orders are money.
- Options: keep kitchen moves Owner/Admin; give Members `order:write`; add one narrow action.
- Decision: **a new `order:stage` action, held by every Member**, lets them read an order's kitchen view and move its stage (and Undo their last step). The API serves them the order without money figures. Refunds, edits to items or address, and everything else about money stay Owner/Admin (`order:write`, `payment:manage`). More widely: a role without the money reads gets no money figures anywhere — stats, takings, fees, payouts — left out by the API, not hidden by the screen.
- Consequences: Order Detail shows a Member the stepper, items, notes and allergy banner, and no money column, refund or edit controls. A business that wants Members kept off orders makes a custom role.
- Migration: none; built-in role permissions live in code (`organization-policy.ts`).

## DEC-025 Vercel for Saroh-managed multi-tenant sites

**Status: Superseded by DEC-107 — 2026-10-08** (was Accepted 2026-09-24) — see [ADR-009](./adr/ADR-009-vercel-managed-multi-tenant-sites.md)

> **Note, 2026-10-09:** Vercel is retired. The merchant sites run on the Cloudflare Worker `saroh-sites` (`*.saroh.app` and custom domains) and every other web app on its own Worker, deployed from GitHub Actions (DEC-107). The tenancy and API boundary below still hold; the Vercel hosting does not.

- Context: businesses need customer-facing sites using Saroh modules without managing hosting accounts or repositories.
- Decision: one Saroh-owned Vercel project serves `*.saroh.app` and verified custom domains from the shared Next.js application. Customer-facing server routes call the Saroh business API; only that API accesses the database. R2 remains the storage integration.
- Consequences: content publishing is tenant-specific; runtime releases are shared. Sessions, caches and authorization must isolate tenants. Customer authentication and portal APIs still need implementation. Client-owned hosting is an optional future path, not a prerequisite; fully independent client backends are not selected.
- Migration: no schema or infrastructure change in this decision; DNS/TLS, deployment and customer API work follows separately.

## DEC-026 A refund carries Saroh's reference, and an unsure answer holds the money

**Status: Accepted — 2026-09-24** — issue #508 (U1) · extends [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md)

- Context: refunds by line made several refunds per payment normal. Razorpay was sent no key, so a retried call could refund twice; Cashfree's `refund_id` was `rf_<intent>_<amount>`, so two equal partial refunds collided; and any error — a timeout included — marked the refund FAILED and freed the money while the provider might have sent it.
- Decision: **one PaymentRefund row is one provider refund, and its id is Saroh's reference** — Razorpay's `X-Refund-Idempotency` key (and its `receipt`/`notes`), Cashfree's `refund_id`. **Only a definite refusal frees money**: a network error, timeout, 5xx, 429, Razorpay's 409 and Cashfree's duplicate `refund_id` leave the row PENDING with its money held, and the merchant is told the refund is being confirmed. **Try-again looks before it sends**: it asks the provider for the refund under the reference and settles from the answer, re-sending (same reference, same amount) only when the provider has none. A refund split across two payments puts each line, whole, on the part its money comes back from.
- Consequences: a provider that never answers leaves money held until the webhook or a try-again settles it; an automatic reconcile job is deferred. The REFUND timeline step is written by whichever path learns the provider took the refund.
- Migration: none.

## DEC-027 The API trusts proxies by address, not by count

**Status: Accepted — 2026-09-24** — issue #508 (U6) · [ENVIRONMENT.md](./ENVIRONMENT.md) `TRUST_PROXY`

- Context: the public booking page limits holds and bookings per client address. Behind Cloudflare and Traefik, `req.ip` was either the proxy's address (every customer sharing one limit) or, trusting a hop count, whatever the client wrote first in `X-Forwarded-For` (a limit anyone could step around).
- Decision: **Express trusts a hop only when its address is a known proxy** — Cloudflare's published edge ranges and the private network (Traefik on Coolify, portless locally) under `TRUST_PROXY=cloudflare`, the default; `private` for a proxy with no CDN; `none` when reached directly. `@Ip()` and the rate limiters read the first address that is not one of them. The ranges live in `src/common/trust-proxy.ts`.
- Consequences: a caller who skips Cloudflare cannot pose as another client, and Cloudflare can still rate-limit abuse at the edge. The real address arrives only if Traefik keeps the `X-Forwarded-For` it gets from Cloudflare (`forwardedHeaders.trustedIPs`) — checked on the host, not in this repo. Cloudflare's ranges need updating if Cloudflare adds one. Sign-in rate limits (Better Auth) read the address themselves and are not covered.
- Migration: none; `TRUST_PROXY` defaults to `cloudflare`.

## DEC-028 The financial year is April–March, and a business builds its invoice numbers from parts

**Status: Accepted — 2026-09-24** — extends [DEC-023](#dec-023-an-invoice-for-every-order-issued-invoices-never-change-and-gst) · [backend-billing-and-classes.md](../patterns/backend-billing-and-classes.md) Numbering

- Context: businesses asked to choose their financial year and how invoice numbers read. GST law fixes the financial year at April to March for every business; what a business may choose is how its numbers are built.
- Decision: **the financial year is not a setting** — April–March, said on the Tax card as "Set by GST law". **Invoice numbers are built from parts** in the business's order — prefix, financial year ("26-27"), year, month — joined by "/" or "-", with a 3–6 digit counter last, restarting every financial year, every month (only with the month in the number) or never (only when not GST-registered). A format is refused unless its longest number, invoice or credit note, stays within GST's 16 characters, and unless it cannot repeat a number. **A new format applies from the next invoice**: issued numbers never change, and the count carries on in its series.
- Consequences: a business that never chooses keeps the numbers it had (RC/26-27/0001 registered, RC-0001 not). The app previews the next number with the same rules as the API, kept in step by hand (`lib/invoices/invoice-number.ts` ↔ `invoices/numbering.ts`).
- Migration: `BusinessProfile.invoiceNumberFormat` (JSONB, null = the default for the business's standing). A `financialYearStartMonth` column added and dropped the same day never shipped.
- Amended 2026-09-25: formats gain **"Financial year, short"** (the year it starts in, two digits: 26-27 → "26") and **no separator** (RC26090001; credit notes RCCN26090001). A count that restarts every financial year must print the financial year, long or short — the calendar year alone is refused, since January–March carry the next calendar year and would clash with the next financial year's restart; it stays allowed for monthly or never-restarting counts. Formats stored before still read and number; the rule applies when a format is saved. A counter's room: a format must fit 16 characters with one digit more than it pads to.
- Amended 2026-09-25 (#532): **the stored format is re-checked only when a save changes the numbering, the prefix or the registration** — in the API and the app alike — so a format saved under older rules doesn't block an unrelated GSTIN, country, address or name save.

## DEC-029 The registered address carries its state and country; a logo is PNG, JPEG or WebP

**Status: Accepted — 2026-09-25**

- Context: an invoice prints the business's registered address, and the address needs its state and country. The state already lived in the Tax card (`gstState`) and the country in Identity, so the address was edited in three places.
- Decision: **State and Country belong to the Registered address card** — the state stays `gstState`, the country stays the profile's. A GST-registered business's state is its GSTIN's and its country India, so both show locked; saving a GSTIN sends its state with it. An address abroad has no Indian state. **A logo is PNG, JPEG or WebP under 1 MB**; SVG is refused (it can carry script and prints unevenly).
- Consequences: the Tax card no longer offers a state; the Identity card no longer offers a country. Settings search finds both under Registered address.
- Migration: none.

## DEC-030 Several storefronts, one catalogue, stock counted per storefront

**Status: Accepted — 2026-09-25** — see [ADR-010](./adr/ADR-010-several-storefronts-one-catalogue.md) · supersedes [ADR-006](./adr/ADR-006-one-storefront-one-website.md) for storefronts

- Context: the Products, Product Detail, Editor and Stock designs assume a counter and an online shop that count stock separately and sell from one catalogue. ADR-006 capped a business at one storefront, and products belong to a storefront.
- Decision: **a business may have several storefronts** (an entitlement, default 5; websites stay at one). **The catalogue is the business's**: a storefront sells a product through a listing, and a variant can be left out of a storefront. **Stock is counted per storefront** and moved between them as a pair of stock-log entries.
- Consequences: orders reserve at their storefront; checkout and the website read the storefront's listing; pickers appear only when a business has more than one storefront.
- Migration: additive with a backfill (organization, a listing at the product's store, stock rows per store); `Product.storeId` dropped later.
- Amended 2026-09-26 (PR #533 review): **a business sells in one currency, and every storefront uses it.** A new storefront takes the business's currency (its first storefront's, else its orders', else its products'); a product priced in another currency isn't listed at a storefront (409), and an order for one listed before is refused.

## DEC-031 Collections: hand-picked or automatic, and where the website shows them

**Status: Accepted — 2026-09-25** — plan `2026-09-25-001-feat-products-stock-storefronts-plan.md` (F7) · takes over #475

- Context: the designs group products into collections ("In 3 collections", "fills itself: everything in Breads") and show which website pages carry a product. Only categories exist today.
- Decision: **a Collection is hand-picked or automatic by category**; an automatic one can't be edited by hand. A product page lists its collections and the website pages that show it, read from the published site.
- Consequences: categories stay single-valued on a product; a collection can span categories. Archiving a product takes it out of both.
- Migration: `Collection` and its membership (F7).

## DEC-032 Stock: a log that is never edited, counts below promised, a stock-only permission, and no overselling

**Status: Accepted — 2026-09-25** — plan F2, F4 · amends [DEC-022](#dec-022-products-stock-per-variant-a-photo-set-and-sections-as-the-save-unit)

- Context: the Stock design logs every change (sold, baked, received, wasted, counted, moved), counts the shelf, and lets a "Member + stock" role count without editing prices. Stock today is a number with no history.
- Decision: **every stock change writes one entry, and entries are never edited or deleted — Undo writes a reversing entry.** **A count may be saved below what is promised**; the gap shows as "N short". **A separate `inventory:write` permission** ("Count and move stock") changes stock; `store:write` includes it. **No overselling**: a storefront sells on hand − promised; at 0 it shows Sold out and refuses new orders, until an order is cancelled or refunded before it was fulfilled, which gives its units back. **"Stop selling" archives** the product; "Sell again" publishes it.
- Consequences: sold entries come from orders only; a fulfilled refund puts nothing back unless a return is recorded.
- Amended 2026-09-25 (plan U2): **when stock is promised** — an order made by staff (pay later, on collection, payment link) promises its units when it is made; an online checkout promises only when it is paid, and a cart or unpaid checkout holds nothing. If two online payments race for the last unit, the loser is refunded in full automatically ("Sorry, it sold out while you were paying — your money is on its way back."). A refund releases units only once the provider confirms it, per line and never more than the line holds. A refund after fulfilment can "Put N back in stock" (off by default), writing a Returned entry. **Count and move stock** is held by Owner and Admin (and anyone with `store:write`); custom roles may be given it.
- Amended 2026-09-25 (U6, user): **stock tracking can be switched off per product and for the business** (Owner/Admin, `store:write`); an untracked product has no count and sells **unless it is marked Sold out by hand**. The hand-marked Sold out is set per storefront on the product's listing, refuses new shop and staff orders there until it is marked available again, leaves open orders alone, writes no stock entry, and may be set by anyone with `inventory:write`. Turning tracking on clears it.
- Amended 2026-10-06 (owner: "Online needs a paid plan; Free takes money offline"): **an order placed at the site's checkout to be paid at the handover** — "Pay when you collect" for a pick-up, "Pay on delivery" for a local delivery, never a shipment — **is made as a staff pay-later order is**: unpaid, its units promised when it is made, real at once (Orders, the month's orders count, the team's New order alert), never closed as an abandoned checkout, and invoiced when staff mark it paid (DEC-023). Its kitchen runs before the money; only the handover waits for it. A plan without online payments always offers it, as the only way to pay; a plan with them offers it beside online only where the location turns it on (off by default). Like a pay-later order, nothing releases its units on a timer: staff cancel it. An account has at most three waiting at once.
- Amended 2026-10-06 (owner, R34): **such an order still unpaid and not collected or delivered three days after it was placed** — whole days in the business's zone (DEC-033), so from the start of the third day after — **shows on Home under Attention** ("Not collected: 3 days", the order and the customer, a link to it; the days count up) **and the team is told once** (the New order alert row: the bell, and email to whoever chose it, through the business's own provider). **Nothing cancels on its own**: staff cancel it (the usual cancel, which puts the stock back) or keep waiting, and the Home row stays until it is paid, handed over or cancelled; the alert is never repeated. Order Detail's banner says "Not collected for N days" with Mark paid and Cancel order…. Code: `orders/uncollected.ts`, `home/home-uncollected.ts`, `notifications/uncollected-alert.ts`.
- Migration: `StockEntry` and a small check-resolutions table (F4, F5).

## DEC-033 A business keeps time in its own zone, offered from the browser, India until set

**Status: Accepted — 2026-09-25** — PR #507 · `apps/app.saroh.in/lib/organizations/time-zones.ts`

- Context: invoice numbers (the financial year and month), the calendar and Activity's times are dated in a zone; with none recorded for a business, India's was assumed.
- Decision: **a business has a time zone setting** (`BusinessProfile.timezone`, an IANA name the API checks against the tz database). **With none saved, Identity offers the browser's zone as a change to save**, renamed to its current tz-database name (a browser in India says "Asia/Calcutta"; Saroh saves "Asia/Kolkata"). **Until one is saved, India's is used** everywhere a date is worked out, as before.
- Consequences: the app's previews (next invoice number, each part, the credit-note example) date in the zone on screen, so a zone being tried shows before it is saved. Nothing changes for a business that never opens Identity.
- Migration: a nullable column; null reads as India.

## DEC-034 Opening hours are edited once, for every storefront

**Status: Accepted — 2026-09-25** — PR #507 · `apps/app.saroh.in/components/organizations/business-hours-section.tsx`

- Context: the Settings design has one Hours card for the business, but hours are kept per storefront (`openingHours`).
- Decision: **Business → Hours reads the first storefront's week and Save writes it to every storefront** — "Applies to every storefront". When the storefronts' weeks differ, the card says so before a Save makes them the same. A business with no storefront has nowhere to keep hours and is sent to make one. Closed-on dates and the booking-page banner are drawn and marked Coming soon, never saved.
- Consequences: per-storefront hours are no longer edited from Settings; a business that needs them different has no screen for it yet. Each storefront's save is audited as its own `storefront.hours.update`.
- Migration: none.

## DEC-035 Activity records a business detail's values; a person's details stay name-only

**Status: Accepted — 2026-09-25** — #509 · `apps/api.saroh.in/src/modules/audit/audit-changes.ts`

- Context: Settings › Activity should say "Invoice prefix: INV → RC", but `AuditEvent.metadata` is append-only and documented as never holding secrets or personal data.
- Decision: **one allowlist decides which fields a save records with their values**: the business's own details that print on its invoices or set how it keeps time and numbers — name, legal name, type, country, time zone, GST registration, GSTIN, state, invoice prefix and number format, delivery GST and SAC, registered address, logo (added, changed or removed), opening hours. **The contact email, the phone and the website are recorded by name only.** A field on neither list is recorded by name. Saves from before #509 carry names only and say so.
- Consequences: for a sole proprietor the legal name, registered address and GSTIN (which embeds the PAN) can be a person's, and an erasure request cannot remove old values from the stream — accepted, since the same values are printed on every invoice the business has issued. An operator's change reads as Saroh support; the operator is never named to the business.
- Migration: none.

## DEC-036 Settings → Providers is one row per provider, connected first

**Status: Accepted — 2026-09-25** — PR #507 · `apps/app.saroh.in/lib/providers/rows.ts`

- Context: Settings → Providers had a row per kind of service (Payments, Email, WhatsApp), so a business could not see which provider it used for each, nor one it had disconnected.
- Decision: **a row per provider, not per kind**: the ones the business has connected first — a disconnected one included, since it is still theirs and says so — then the ones it could connect next, each with Connect — only what the API can connect (Razorpay, Cashfree, Resend, SendGrid, SMTP relay, Meta, Twilio). Domains are not a provider and keep a row of their own below. A row shows only codes the API sends as public (a checkout's public key, a sending address, a hostname), never a credential.
- Consequences: a list the page could not read is named in a notice rather than shown as "nothing connected". Each storefront still picks its own payment provider under Sell.
- Migration: none.

## DEC-037 A business's customers sign in on its own site, with an email code, one account per business

**Status: Accepted — 2026-09-26; amended 2026-09-27 (email only; linking per DEC-049; sign-in always on for every site, no guest booking)** — see [ADR-011](./adr/ADR-011-customer-accounts-on-merchant-sites.md) · supersedes in part [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) §2 "The public booking page" and §3 "Not sending email or SMS" · amends DEC-011 · round-2 plan A

- Context: the Customer Site and booking-page designs give a business's customers an account: their bookings, orders with tracking, plan, packs and messages. ADR-008 kept the booking page anonymous because Saroh could not check who was asking. So there were no credits online, no packs bought online, no waitlist, no recognition, no sign-in and no customer messages.
- Options: one Saroh-wide customer identity; Better Auth users with a customer role; a separate customer account per business.
- Decision: **people who sign in on a merchant's site are that business's customers**. Each has a **`CustomerAccount` per business**, never shared across Saroh and never a Better Auth `User`, linked to exactly one Contact. **Sign-in is a one-time code by email**, sent through Saroh's identity email in the business's name. **Phone codes and SMS are out of this round** (2026-09-27). **The session is a host-only cookie on the site's own host.** The site's server routes read it and call the API with it, and the API accepts it only for the business that host belongs to. A signed-in customer may **spend class credits and buy packs online, join a class waitlist, be recognised, and message the business**. Messages about their own orders, bookings and invoices always reach them in their account. Outside the account they go by email only, through the business's own connected email provider (DEC-011), to the verified email.
- Consequences: ADR-008's list of what the booking page may not do is lifted for signed-in customers. A first sign-in links to an existing contact **only when that contact's email is verified** (DEC-049); otherwise the customer gets a separate contact and the pair is suggested to staff. It never merges silently. Copy may promise a message only where one is really sent. A customer asks for their details to be removed by message or in person; there is no removal request in the account area (2026-09-27).
- Closed 2026-09-27: **email only for now.** The question of who pays for SMS is not answered, because SMS is not in this round. Phone sign-in, SMS codes and messages to a verified phone come later, as their own decision (ADR-011 §6).
- Migration: new tables `CustomerAccount`, `CustomerSignInCode` and `CustomerSession` (organization-owned, RLS), plus the messaging tables in plan A. No site column: nothing is switched per site.
- Amended 2026-09-27 (user), replacing an earlier per-site switch: **sign-in is always on for every merchant site. There are no guest users**: no guest booking, no guest checkout, no guest fallback, and no switch for the merchant. When a code can't be sent, the customer sees "We couldn't send your code — try again in a few minutes" with the business's phone number, and the booking is not taken. So the code email is critical: it has its own sending stream, is retried, and every failure alerts Saroh. No rate limit may refuse a real customer because of what someone else did: past a shared ceiling the answer is a bot challenge or a short wait, never a refusal, and a customer's own limit says when to try again. When plan A ships (A9), every site moves to sign-in at once, after a release note and a notice to merchants; the anonymous booking route closes a release later.

## DEC-038 Autopay, card-on-file and per-session charges run on the business's own payment provider

**Status: Accepted — 2026-09-26** — amends [ADR-007](./adr/ADR-007-subscriptions-invoices-classes.md) ("No card-on-file, no auto-debit") and DEC-019 · round-2 plan D

- Context: the Plan Editor, Subscription Detail, Home ("Retry") and the customer site ("UPI Autopay for plans", "saved methods") assume a renewal can charge the customer without a link. ADR-007 invoiced each period and left mandates for later.
- Decision: **autopay (a saved card or a UPI mandate) and charges per session come from the provider the business connects**. Razorpay comes first, and Cashfree or another provider goes through the same port, **using the provider's own mandates and subscriptions**. Saroh stores the provider's customer, mandate and token references, never card or bank details. It never charges without a mandate the customer set up. **Each period is still invoiced** (DEC-023), and a successful mandate charge pays that invoice. **A pay link stays the fallback**: with no provider, no mandate, or a failed or cancelled mandate, the invoice goes out with a pay link as today.
- Consequences: "Retry" on a failed renewal retries the mandate charge when there is one, and sends a pay link otherwise. The provider port gains mandate set-up, charge, cancel and status calls, and the webhook inbox gains their events. Copy says "UPI Autopay or card" only where the business's provider supports it and the customer has set one up.
- Migration: a mandate table (organization-owned, RLS) and a subscription's link to it; nothing changes for subscriptions without one.
- Amended 2026-09-27 (plan D deepened after the security review): **a mandate belongs to exactly one subscription** (`PaymentMandate.subscriptionId` is required) and pays only that subscription's renewal invoices this round. **It ends with its subscription** (D20): every move to cancelled, a privacy removal of the contact (C11) and a merge that retires the contact (C9) cancel it at the provider first, under DEC-026's rule for an unsure answer, and an unconfirmed cancel is never charged again. A mandate is never moved to another person or reused; per-session charging for Courses will be its own record.

## DEC-039 Staff permissions are capabilities granted to people; the built-in roles are default bundles

**Status: Accepted — 2026-09-26; reworked 2026-09-27 (the capability model)** — [docs/plans/2026-09-26-permission-matrix.md](../plans/2026-09-26-permission-matrix.md) · supersedes in part DEC-024 (the money-free kitchen view for Members) and DEC-020 ("Members see no money" as a rule)

- Context: the designs gate by permission: `customer:read/contact/sensitive/merge/remove`, `order:create/fulfil/edit/refund/export`, `pack:sell`, `booking:settings`, and a Member who sees no money. The first version of the matrix (2026-09-26) set these against the four roles and hid money from Members screen by screen. The user answered on 2026-09-27: what someone sees depends on the permissions they are given, not only on their role; someone who can read orders sees every detail of an order.
- Decision: **permissions are capabilities, granted to a person through their role or directly as extra permissions.** **A capability shows everything within its scope**: `order:read` shows the whole order, money included, and **there is no separate money redaction by role**. A screen that gathers several scopes shows each part to whoever holds that part's read. **Owner, Admin, Member and Reviewer are default bundles**; a business can change them or make its own role. **A capability is split only where a business would plausibly grant one without the other**, and the matrix gives each split its reason (`order:read` / `order:stage` / `order:create` / `order:edit` / `order:refund` / `order:export`, `contact:read` / `customer:sensitive` / `customer:merge` / `customer:remove`, `booking:write`, `pack:sell`). Splits whose only purpose was hiding money or contact details from Members are dropped (`customer:contact`, the money-free kitchen view). A write implies its read, and an old umbrella implies its new parts, so saved roles keep what they could do. The matrix answers the first version's eleven questions; **four product choices stay with the user**: the Member default bundle, whether sensitive notes are their own capability, which role templates ship, and whether a new Member bundle reaches existing businesses.
- Consequences: B16, C13, E26 and F11 are no longer blocked and move to phase 2, with F17 (extra permissions per person). F18 applies the Member bundle, makes `order:stage` imply `order:read` and drops the money-free kitchen view; it waits on the open choices. Until F18 ships, the shipped Member stands (DEC-024), and a Reviewer sees only the sites they were invited to (DEC-006).
- Migration: none for the new keys (roles store lists; implied holds keep saved roles whole). F17 adds a per-person grants list on the membership.
- Amended 2026-09-27 (doc review of the round-2 plans):
    - **Granting is bounded by reach, for every actor.** Nobody grants a capability they don't hold, changes their own extra permissions, or changes a role or a person that can do more than they can. Today's role editor has no such check (`OrganizationRolesService.create`/`update`); F19 closes it before the high-value keys land, and F17 applies the same rule to extras.
    - **Autopay actions belong to `subscription:write`** (send a set-up link, cancel autopay, retry). A mandate belongs to one subscription and ends with it. `payment:manage` keeps connecting providers and refunding invoices.
    - **A pay link is a bearer credential, not order data.** `order:read` shows whether one is live, never the link; making a new one needs `order:create` or `order:edit`.
    - **`order:stage` implying `order:read` reaches every role that moves orders**, frozen or saved rows included, whatever Q4 answers. F18 lists those roles to owners before it applies.
    - Storefront people join the team in a narrow "Storefront team" role, not Member (DEC-048, amended).

## DEC-040 Needs attention is one field on the customer, and sensitive entries need their own permission

**Status: Accepted — 2026-09-26** — round-2 plans C, B, E, F and A

- Context: today allergies are structured note allergens (ADR-008), shown in Order Detail's allergy banner. A clinic needs medical notes and access needs on the same record, and a front desk that must not read them.
- Decision: **each customer has one Needs attention list**. Each entry has:
    - a kind (Allergy, Medical, Access or Other), a short label and optional detail;
    - a sensitive flag, on by default for Medical;
    - where it came from (staff, the booking page's "Anything we should know?", or the customer), and who added it and when.

    **Sensitive entries go only to someone holding the sensitive capability** (DEC-039). The API leaves them out; the screen does not just hide them. The same list shows on Customers, Customer Detail, Orders and Order Detail (the kitchen view included), Bookings, Home and the booking page's intake. Allergy entries keep their structured allergen, so the allergy banner still matches exactly.

- Consequences: existing allergen notes become Allergy entries. A note from the booking page arrives as a suggestion that staff confirm ("Add to Needs attention" or "Nothing to add"). It never goes straight onto the record.
- Migration: a `ContactAttention` table (organization-owned, RLS) and a backfill from `ContactNoteAllergen`.

## DEC-041 CRM stays as it is; Customers is everyone who pays or signs in

**Status: Accepted — 2026-09-26; amended 2026-09-27 (link reasons, unlinked customers named)** — round-2 plan C · amends `saroh-product.md` "Selling, customers and identity"

- Context: the Customers design is one list for the whole business: "Only people who have paid are customers; everyone else lives in People". Today `/commerce/customers` merges store customers per storefront on the client, and Leads, Pipeline and Contacts are the CRM.
- Decision: **Leads, Pipeline and Contacts stay as they are.** **The new Customers list replaces the storefront customers list** and is keyed on the Contact. A customer is a contact who has paid (for an order, an invoice, a subscription or a pack) **or who has signed in on the business's site** (DEC-037). One organization-level API serves the list.
- Consequences: `/commerce/customers` becomes the business-wide list, and the old per-storefront customer pages redirect to the contact. A paying store customer with no linked contact gets a new contact, linked to them, when the list is backfilled or when they next pay. Where the business already has a contact with that email (email is unique per business), no second contact is made. The pair is suggested for the merchant to link or merge, and is never linked automatically.
- Migration: a backfill that makes and links a contact for every paying store customer without one.
- Amended 2026-09-27: **a link records why it was made.** `CustomerIdentityLink.linkedByUserId` becomes nullable and a `reason` is added (`MANUAL`, `BACKFILL`, `PAYMENT`, `SITE_ACCOUNT`; existing links read `MANUAL`), because the backfill, a payment and a customer's own sign-in make links no staff member made. **The new list names the paying customers it can't show yet**: those left unlinked because a contact already holds their email are counted in a notice with a review sheet, so the list never shows fewer customers than the one it replaces. A contact made for a site sign-in whose email didn't match a verified contact (DEC-037, 2026-09-27) is a customer and is suggested as a duplicate. Duplicate pairs are computed, not stored, and a stored "Dismiss" waits for a later round.

## DEC-042 Duplicate customers are merged, and a customer's details can be removed

**Status: Accepted — 2026-09-26; amended 2026-09-27 (tombstones, the account on a merge, what removal reaches)** — round-2 plan C · supersedes in part [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) §2 "One read of a customer" ("records are never merged")

- Context: #120 links a store customer to a contact. The design merges two customers and removes a person's details for privacy; the build offers a link and a hard delete instead.
- Decision: **a merchant can merge two customers.** The surviving contact keeps every order, note, booking, subscription, pack, invoice, message and Needs attention entry of the other. Orders and invoices keep the contact details they were placed with. The merge is recorded on both timelines and in Activity. Saroh suggests likely duplicates but never merges on its own. **Privacy removal anonymises the person**: their name, phone, email, address, notes, Needs attention, messages and site account go. Their orders and issued invoices stay, with what was printed on them, because the law needs the paper.
- Consequences: a hard delete stays only for a contact with no orders or invoices (today's rule, #384). Linking (#120) stays for a store customer whose contact is known; merging is for two contacts.
- Migration: none for the rule; the merge and the removal are services.
- Amended 2026-09-27, merge: **the merged contact is kept as a tombstone** that points at the survivor, holding ids only, never deleted, so a payment webhook, a job or a sign-in that still carries its id lands on the survivor instead of failing after money was taken. The merchant picks the survivor's **name, email and phone**, as in the design. Message threads, waitlist places and autopay mandates move with the person. Consent keeps the newer answer per channel, but an opt-out is never lost and a yes survives only with the address it was given for. The site account follows ADR-011; **the merge names the account that will see the combined record, and waits for the merchant to confirm that email is theirs**, so a merge cannot quietly hand someone's history to another person's sign-in. Merge and removal have their own capabilities (`customer:merge`, `customer:remove`) from the day they ship.
- Amended 2026-09-27, removal: privacy removal also reaches **the storefront customer records and links, the delivery recipient on their orders, message recipients, waitlist places, autopay mandates (cancelled at the provider first) and their reviews' names**. Issued invoices keep their bill-to, and orders keep their lines, amounts and GST place of supply. **Leads and form entries are left as they are**, since the CRM stays as it is (DEC-041). There is no customer-side "Remove my details": a privacy request reaches staff by message or in person, and staff use privacy removal.

## DEC-043 Plans and packs keep unpublished changes on the server, edited in one editor shell

**Status: Accepted — 2026-09-26** — round-2 plans D and E

- Context: the Plan Editor and Pack Editor autosave. They show "Publish" for a new record and "Publish changes" for a live one, and offer Discard and Delete draft. A live plan's price or classes must not change under its members while someone is still typing.
- Decision: **a plan or a pack can be a Draft**, which is never offered on the site or at the desk. **A live one can carry one set of unpublished changes, stored on the server** beside it. Publish changes applies them in one step, and Discard throws them away. Both editors share **one editor shell** in the workspace: autosave, the publish banner, Publish, Publish changes, Discard, Delete draft, and a warning before leaving with unsaved work. Courses can use it later.
- Consequences: sales, subscribe and the site read only the published record. Publishing a price change keeps existing members on the price they bought at (ADR-007).
- Migration: a `DRAFT` status on plans and packs, and a pending-changes column on each.

## DEC-044 Courses wait for a later round; class packs go ahead

**Status: Accepted — 2026-09-26** — round-2 overview, "Later"

- Decision: **the Courses, Course Detail and Course Editor designs are not planned in this round.** Courses as built (ADR-007) keep working. **Class packs are in: Packs, Pack Detail and Pack Editor.** Nothing in this round removes or rewires a course feature. Shared pieces (the editor shell, per-session charging, the waitlist) are built so courses can use them later.
- Amended 2026-09-27: the shared pieces built this round are **the editor shell, the waitlist, and a mandate port shaped for per-session charges**. Per-session charging itself is not built: mandates pay subscription renewals only this round (plan D), and a per-session mandate will be its own record when Courses return.

## DEC-045 Orders carry a fulfilment type, shipping records the courier and tracking number, and each storefront sets when its orders are late

**Status: Accepted — 2026-09-26; amended 2026-09-27 (late rule per storefront; how the enum migrates, see the notes)** — round-2 plan B · amends [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) "The kitchen stage sits under the order status" (collect or delivery)

- Context: today an order is Collect or Delivery, with a typed tracking link. The Orders designs have Pick-up, Local delivery, Shipping, Digital, and Appointment in person or online, each with its own steps and late rule.
- Decision: **an order has one of six fulfilment types**: Pick-up, Local delivery, Shipping, Digital, Appointment (in person) and Appointment (online). Each has its own steps under the order status, its own "late" rule and the stages it may use. **Shipping records the courier's name and the tracking number**, with an optional link. **Saroh does not book couriers**, so "Book pickup" is dropped. How an order is fulfilled can change until it is handed over. **When an order counts as late is a storefront setting** (2026-09-27): one threshold per fulfilment type the storefront offers — Pick-up, Local delivery and Shipping — measured from when the order was placed, in hours with minutes allowed for a counter. The defaults are 2 hours, 24 hours and 48 hours; a café-like storefront may set 20 minutes. Digital is never late, and an appointment is judged by its visits. The API computes "late" from the order's storefront's setting.
- Consequences: Collect becomes Pick-up and Delivery becomes Local delivery, and the existing stages stay. An appointment order is fulfilled by its visits (bookings).
- Migration: widen the fulfilment enum and add courier and tracking-number columns; existing orders keep their meaning. Three late thresholds on the storefront's settings, defaulting to 2, 24 and 48 hours for every storefront, existing ones included.
- Amendment notes (2026-09-27, plan B deepened after review; the decision above stands):
    - **The enum changes by expand and contract, not by renaming values in place.** Release 1 adds the new values beside COLLECT and DELIVERY, reads both and still writes today's; release 2 moves existing rows to PICKUP and LOCAL_DELIVERY and writes only the new values; release 3 drops COLLECT and DELIVERY. Each release keeps the API that is still serving during its migration working, keeps the separately deployed app working, and can be rolled back by deploying the previous tag. The steps are in plan B (B2a, B2c, B2d) and a rollout checklist in `docs/architecture/`.
    - **A Local delivery order already handed to a courier** on the day of the switch keeps its stage and moves on to Delivered.
    - **"Placed" means the order's `createdAt`**, and the late clock starts there for every order, online and pay-later ones included.
    - **Which types a storefront offers** is one setting on the storefront (Pick-up, Local delivery, Shipping). Digital and the appointment types follow the product.
    - **Changing how an order is fulfilled takes a delivery amount typed by staff.** There is no delivery fee per storefront yet; the shop's checkout brings one later.
    - **A walk-in order has no customer record**: its name, and a phone if given, stay on the order, and no contact is made without an email. _Amended 2026-09-28 (user, round-2 B13b):_ only a walk-in with **just a name** stays a walk-in with no customer and no contact. **A walk-in whose phone is given is a customer**: the order is made for the store customer that phone finds (the business's contact with it, compared as C2's `duplicates.ts` compares phones; never a contact removed for privacy) or makes, with a contact linked by the staff member (MANUAL), so it joins their history and duplicate matching and a privacy removal reaches it. Someone known only by a phone carries the reserved `phone+<random>@phone.invalid` placeholder as their email (`contacts/contact-email.ts`). `Order.walkInPhone` is no longer written.
    - **An appointment order's shape** is set by [DEC-050](#dec-050-a-treatment-is-one-order-whose-line-bills-a-service).

## DEC-046 Brand and fonts are their own track, and Saroh's fonts stop reaching merchant sites now

**Status: Accepted — 2026-09-26; amended 2026-09-27 (ship the fix now; font and palette catalogues)** — round-2 plans G and H

- Context: the Site Editor and Customer Site designs add a brand (any colour, backgrounds, heading and body fonts, a logo and automatic contrast), module pages, Hindi and more. Separately, `apps/saroh.app` loads Saroh's Geist and Bricolage Grotesque for every merchant site, and the booking flow styles its headings with `font-display`. That puts Saroh's brand on a merchant's page, which the `--site-*` rule forbids.
- Decision: **the font leak is a bug, fixed in the first phase and shipped now**: merchant pages load no Saroh font, and the booking flow uses the site's own type tokens, set to a neutral system stack. **Brand v2** (the brand API and panel, a logo and contrast) **is its own design-system epic**, and it gives the merchant **choice, not one fixed brand** (2026-09-27): **a font catalogue** of curated pairings (a heading face and a body face, each with Devanagari coverage) and **a palette catalogue** of ready-made colour palettes, **plus a custom colour**. Both catalogues are **data, not code**: a new pairing or palette is a catalogue entry, and no code names an entry. Everything resolves into the site's own `--site-*` tokens, never Saroh's. **The site editor keeps free-form pages and adds module pages beside them.** **Hindi is a later step** of its own.
- Consequences: **the fix changes every live site on the day it ships**: its text moves to the neutral stack and stays there until its merchant picks a font pairing; its colours do not change. An existing site is never restyled on its own. When its merchant first opens Brand, it is offered the nearest palette (or its own accent as a custom colour) and the pairing closest to its old type, and nothing changes until they save. A retired catalogue entry leaves the pickers and keeps rendering for the sites that use it.
- Migration: none for the fix.
- Amended 2026-09-27 (the round re-sliced):
    - **Only the font-leak fix (H1) is in round 2.** Brand v2 (H2–H10), a new font-pairing picker (H11) and the new-site setup that needs the themes (plan 007's G21) are **the Brand track**, with its own schedule, outside round 2's phases and unit count.
    - **The track delivers fonts first**: the contract, the catalogues, per-site fonts, the renderer and a pairing picker in today's Style panel (H2, H3, H5, H6, H11), before palettes, the logo and the Brand panel. Until then every site stays on the neutral stack. H1 says so in the Style panel ("Your site's text now uses a plain system font. Font choices aren't available yet.") and in the release note, and neither promises a date.
    - **A shipped catalogue entry is never edited**, only retired: its values and font files are pinned by hash, and a re-tuned look ships as a new key. A version restore or the template's theme may still name a retired key.

## DEC-047 Publishing while a page is in review stays allowed

**Status: Accepted — 2026-09-26** — keeps #278 · round-2 plan G

- Decision: **the bypass wins.** Someone with `site:publish` can still publish a page that is out for review, and the bypass is recorded as it is today (#278). The design's block on publishing during review is dropped.

## DEC-048 A storefront's people are on the business's team

**Status: Accepted — 2026-09-26** — round-2 plan F · amends the Team design note "Team is business-scoped"

- Context: a storefront has a "People who work on it" roster (`StoreMembers`: Admin, Manager, Editor, Viewer). The Team design says a role is held in a business and there is no second roster.
- Decision: **the storefront roster stays**, and **adding someone to a storefront also adds them to the business's team**. There is one roster underneath, and the storefront role is a narrower grant on top of it. Team Roles otherwise stays as it is, except that **the empty "Extra permissions" column is hidden** until something fills it.
- Consequences: inviting someone to a storefront needs the permission to invite them to the team. Removing someone from the team removes their storefront roles.
- Migration: a backfill that gives every storefront member without a business membership one, as a Member.
- Amended 2026-09-27 (security and product review of plan F): **not as a Member.** A Member holds every customer's contact details and the whole diary, and after F18 whole orders with money, so a Viewer of one shop would gain the business's customer list overnight without anyone choosing it. Someone who joins through a storefront, and everyone the backfill adds, gets a business membership in a narrow **"Storefront team"** role: an ordinary custom role holding the org, team, module, media, storefront and review reads, and nothing about customers, bookings, orders or money. What they do inside their storefront still comes from their storefront role. An existing business role is never lowered or replaced. **The owner is told**: an Activity entry per person, and a one-time Team notice listing the people added, each with Change role, so any widening is on purpose.

## DEC-049 A site account links to an existing contact only when that contact's email is verified

**Status: Accepted — 2026-09-27** — amends DEC-037 and [ADR-011](./adr/ADR-011-customer-accounts-on-merchant-sites.md) "An account is a Contact" · round-2 plan A (A4)

- Context: DEC-037 linked a first sign-in to the one contact with the same email. A contact's email is typed by staff, imported, or entered by anyone in today's anonymous booking page or a form, so nobody has proven it. Whoever reads a mistyped, shared or recycled inbox would have opened that contact's bookings, invoices, plan and, at a clinic, treatment history. And because a contact's email is required and unique per business, the old "zero or several matches → a new contact with that email" branch could not be built.
- Decision: **a site account links to an existing contact only when that contact's email is verified.** Verified means it was proven before: by an earlier sign-in code for it, or by a confirmation of an online order or booking the contact made with it, sent to that address through the business's email provider. Staff confirming a merge that keeps the account's email also verifies it; a staff edit of the email, or "This isn't them", clears it. Otherwise the online customer gets a **separate contact**, and the pair is suggested for staff to merge (DEC-042). **The verified email lives on the account; the separate contact cannot take it** (the email is unique per business), so its email field holds a reserved, undeliverable placeholder (`account+<contactId>@account.invalid`, from the same family a merge's tombstone and privacy removal use, all built and recognised by one helper plan A owns), until staff merge the two. A new email that no contact holds makes a contact with that email, verified.
- Consequences: at launch no contact is verified, so every customer the business already knows appears twice after their first sign-in until staff merge the pair. Every reader of a contact's email treats the placeholder as no email and nothing sends to it. A merged-away account keeps its row and its email reserved (status MERGED); a correct code for that email opens no session and answers "This email now signs in as ‹masked survivor email›", so a merge cannot recreate the duplicate.
- Migration: `Contact.emailVerifiedAt` and how it was verified (nullable, nothing backfilled).

## DEC-050 A treatment is one order whose line bills a Service

**Status: Accepted — 2026-09-27** — amends [DEC-045](#dec-045-orders-carry-a-fulfilment-type-shipping-records-the-courier-and-tracking-number-and-each-storefront-sets-when-its-orders-are-late) ("an appointment order is fulfilled by its visits") · round-2 plan E (E9), plan B (B14)

- Context: a multi-visit treatment is one order of type Appointment with a booking per visit (default 40). Today's order line must name a Product, an order needs a storefront and a store customer, and plan B had proposed a "service-kind product". Review found none of this fitted a treatment booked on the booking page.
- Decision: **a service is never a Product.** An order line bills either a product or a service (`OrderItem.serviceId`, with exactly one of the two set); a service line holds no stock, has quantity 1 and takes its GST from the service. **The order goes to the storefront the booking site sells from**, else the business's oldest open storefront; a business with no storefront can't make a multi-visit service. **The order's store customer is found or made by the booking's email** and linked to the booking's contact. The treatment is invoiced once for its price (DEC-023): one order invoice when paid in full, or the deposit invoice and one balance invoice. A later visit is never invoiced on its own.
- Consequences: every reader of an order line accepts a service line (serializers, invoices and GST, stock, discounts, reviews, refunds). Money on a treatment comes back only through the order's refund; a cancelled visit refunds nothing by itself. If walk-in orders make the store customer optional, the email rule can relax.
- Migration: `OrderItem.serviceId` (nullable) with `productId` made nullable and a check that exactly one is set; additive.

## DEC-051 A booking's deposit is refunded once, against a free-cancel deadline fixed at booking

**Status: Accepted — 2026-09-27** — builds on [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) (pay now at booking) and DEC-026 · round-2 plan E (E8), plan A (A6)

- Context: deposits (None, 25%, 50% or Full, default 39) ride the pay-now path. Review found two holes: a staff cancel and a customer cancel racing each other could refund twice, and moving a booking a week out could turn a late cancel into a free one.
- Decision: **the free-cancel deadline is fixed when the booking is made** (`Booking.freeCancelUntil`, its start less the business's free-cancel hours). No move, by staff or by the customer, changes it. **A free cancel refunds a stand-alone booking's deposit once**: the cancel and one pending refund are written together under the booking's lock, keyed per booking, and the provider is called after commit (DEC-026). A late cancel keeps the deposit. Staff can return it only with `payment:manage`. A visit of a treatment never refunds on its own (DEC-050).
- Consequences: a customer can't move a booking inside the late window from their account; they call the business. Bookings made before the column are judged by their start.
- Migration: `Booking.freeCancelUntil` (nullable), written for new bookings.

## DEC-052 Half-hour starts only for services of 30 minutes or more

**Status: Accepted — 2026-09-27** — narrows round-2 default 41 · amends ADR-008's slot step · round-2 plan E (E6)

- Context: default 41 offered booking-page starts on the hour and half hour for every business. For a service shorter than 30 minutes that would remove starts a business offers today (a 20-minute check-up offers :00, :20 and :40).
- Decision: **a service of 30 minutes or more offers a start every half hour** from each availability window's start; **a shorter service keeps stepping by its own length.** No service loses a start it offers today, and the clock is never forced (a window from 09:15 steps 09:15, 09:45).
- Consequences: staff New booking and the site's "On today" read the same starts as the booking page. Capacity and overlap checks count buffers explicitly, since the step no longer carries them.
- Migration: none.

## DEC-053 A business can show a public phone number on its site

**Status: Accepted — 2026-09-28** · round-2 phase 2 (plan G, G8; plan E, E6; plan A, A2/A9)

- Context: the site's Call button, the booking page header and "We couldn't send your code, call ‹Business›" all need the business's phone number, but the schema has no public phone, and `businessPublicPhone(site)` in `site-host.ts` returns null.
- Decision: **each business may set one optional public phone number in Settings → Business.** It is the merchant's own number, shown only on that business's site. Saroh's number never appears there.
- Consequences: with no number set, the Call button and the "call us" line are hidden, and never shown empty or with a placeholder.
- Migration: a nullable phone field on the business profile; additive.

## DEC-054 Razorpay setup asks for the public key

**Status: Accepted — 2026-09-28** · round-2 phase 2 (plan A, A10/A11; plan D, D19; plan E, E11 follow-up)

- Context: Razorpay's checkout window opens with the business's public key id, and the provider setup saved only the secret. A connection without the public key answers "couldn't open the payment window".
- Decision: **the Razorpay provider setup asks for the public key id alongside the secret**, and checks both before it calls the connection ready.
- Consequences: an existing connection with no public key reads as needing attention in Providers, with a way to add it. Online pay stays off for that business until it is added.
- Migration: none beyond storing the key with the connection.

## DEC-055 Each storefront chooses how a same-email customer is linked

**Status: Accepted — 2026-09-28** — builds on [DEC-042](#dec-042-duplicate-customers-are-merged-and-a-customers-details-can-be-removed) and [DEC-049](#dec-049-a-site-account-links-to-an-existing-contact-only-when-that-contacts-email-is-verified) · round-2 plan C (C2, C9, C10)

- Context: when a contact made for one storefront's customer already holds an email, another storefront's customer with the same email waits for staff (5 of 76 in the showcase).
- Decision: **a per-storefront setting, shown to the merchant, chooses between linking such a customer automatically and leaving the pair for staff to confirm.** The default leaves it for staff, which is today's behaviour. Automatic linking applies only when the holding contact was itself made from a store customer.
- Consequences: the setting's copy says plainly what automatic linking does.
- Migration: a storefront setting with a default; additive.

## DEC-056 Smaller calls for round 2, phase 2

**Status: Accepted — 2026-09-28** · round-2 plans B, C and F

- **"Add customer" creates a contact only**, never a store customer.
- **The Settings ready checklist brings back the email, logo and pipeline nudges** that F8 dropped.
- **A Reviewer on Orders sees the Orders locked card**, not the generic module card (B7, F9).
- **"Returning" counts only what the viewer can read.** Without `invoice:read` it is judged from orders alone (C3).
- **The bot check (Cloudflare Turnstile, free) is deferred.** Code sign-in runs without a challenge until abuse shows up. The API logs `site_codes_challenge_unconfigured` meanwhile, and the check is switched on by setting the two keys.

## DEC-057 A module Saroh has switched off is never shown to the business

**Status: Accepted — 2026-09-28** · applies to every surface that lists or gates modules

- Context: on a fresh production database every module's rollout flag was unset, so Settings › Modules listed Website, Contacts, Appointments and Sell with their switches on and a raw `ROLLOUT_DISABLED` line under each.
- Decision: **a module whose rollout flag is off (`ROLLOUT_DISABLED`) is not shown to the business anywhere**: not in Settings › Modules, the rail, the command menu, "Also sell", onboarding's module choices, setup checklists or any upsell. Only modules Saroh has rolled out appear, and the business turns those on or off. A raw blocker code is never shown to a merchant.
- Consequences: the module list the app renders is the set that has passed the rollout gate. Turning a rollout flag off in the admin console hides the module; the business's own setting and its data are kept.
- Migration: none.
- Amended 2026-10-09 (owner, #117): **with a module off, its history stays readable and cancelling what was already committed is allowed.** Orders, customers, bookings, plans and subscriptions, class packs and their purchases, and courses and their enrolments can still be read; cancelling an existing order (Sell), booking (Bookings), subscription or course enrolment, including the refund that cancel makes, still works. Role permissions still apply; every other write stays gated (`MODULE_ROLLOUT.md`, `history-reads.gate.spec.ts`).

## DEC-058 A cancelled booking is refunded by the business's own policy, never beyond what was received

**Status: Accepted — 2026-09-28** — amends [DEC-051](#dec-051-a-bookings-deposit-is-refunded-once-against-a-free-cancel-deadline-fixed-at-booking) · round-2 plan E (E8, E30)

- Context: E8 refunded any money paid online when a booking was cancelled in time. Which cancellations are refunded is the business's refund policy, and Saroh doesn't set it.
- Decision: **each business sets its own policy for cancellations made in time**, in its booking settings: refund what the customer paid online automatically, or don't. Saroh follows that setting. **A refund is never more than the money actually received** for that booking, and a late cancel is never refunded automatically. Staff with `payment:manage` can still refund by hand, within what was received. DEC-051's mechanics stay as they are: the fixed free-cancel deadline, one refund under the booking's lock, and the provider called after commit.
- Consequences: the booking page and the cancel dialog state the business's policy as it is set. A business that never set it gets the default, automatic refund of what was paid online, which is what E8 shipped. The setting's copy makes plain that the business can change it.
- Migration: one booking-policy setting per business, with a default; additive.

## DEC-059 The payment window shows the methods the business's account has switched on

**Status: Accepted — 2026-09-28** · round-2 plan E (E11, D23), plan D

- Context: the booking page promised "UPI or card", and Razorpay's window was limited to UPI and card by Saroh, while Cashfree's showed whatever the account had switched on.
- Decision: **Saroh doesn't choose or restrict payment methods.** The provider's window shows the methods the business has switched on in its Razorpay or Cashfree account. Saroh's copy names no methods it can't vouch for: at most, it shows methods the provider reports as switched on for that account.
- Consequences: Razorpay's UPI-and-card-only display block is removed. "UPI or card" becomes neutral copy, such as "Pay online in the ‹Razorpay› window", unless the provider reports the account's methods.
- Migration: none.

## DEC-060 Three small calls on customers and orders (2026-09-28)

**Status: Accepted — 2026-09-28** · round-2 plans B (B15, B13) and F (F10, F12)

- **A Member sees a customer's email on an order.** On the order read and the quick view, `contact:read` alone shows the customer's own phone and email, the same as on the list's rows. Without it, neither is shown, as review #19 set; the delivery phone is always shown.
- **Onboarding's "Registered" saves no business type.** It used to save `company`, which Settings reads as Private limited, so an LLP or partnership was mislabelled. The business picks its real type in Settings. F12's go-live checklist nudges for it until one is set.
- **A walk-in who gives a phone is a customer.** A name-only walk-in stays a walk-in, with no customer and no contact. With a phone, the order is made for a customer found by that phone, or one created and linked (DEC-045 is amended). This lets their history, duplicate matching and a privacy removal reach them.
- Migration: none.

## DEC-061 Sensitive notes are their own capability

**Status: Accepted — 2026-09-28** · round-2 plan C (C13), permission matrix Q2

- Context: C13 split the customer capabilities, and matrix Q2 asked whether sensitive notes (medical and similar) should need a power of their own, or come with `contact:write`.
- Decision: **`customer:sensitive` is its own capability.** Owner and Admin hold it; Member and Reviewer don't; nothing implies it. `canSeeSensitive` asks for it, and every surface that shows sensitive notes follows it.
- Consequences: custom roles saved before C13 that hold `contact:write` no longer see sensitive notes. No migration grants the capability back; a business re-grants it in Team › Roles. This is on purpose: the matrix's front-desk template exists so that it doesn't see medical notes.
- Migration: none.

## DEC-062 Joining a plan online is pay-first

**Status: Accepted — 2026-09-29** · round-2 plans G (G20) and D (D12)

- Context: a customer joining a plan from the site's Prices page or Plans block could either be put on the plan at once and invoiced (subscribe-then-invoice), or be put on it only once the first period is paid (pay-first).
- Decision: **pay-first.** Starting to join makes a numberless DRAFT invoice (source SUBSCRIPTION), priced by the server from the plan as it is on sale, with the plan's terms snapshotted on it. Nobody is on the plan until the payment's webhook arrives; then, under the invoice's row lock, the subscription starts from the snapshot and the invoice is numbered PAID as its first period's invoice. An unpaid draft is voided after 24 hours, and an account has at most three open joins. This is the same shape as buying a class pack online (A11).
- Why: an abandoned join leaves nothing behind — no member who hasn't paid, no numbered invoice to credit-note, no gap in the series (DEC-023) — and nobody books classes on a plan they haven't paid for. It also lets D12 pay the first period and set up autopay in one flow at join.
- Consequences: a business with no online payments shows "Ask about joining" instead of Join; staff still add members by hand for "join now, pay at the desk". Renewals after the first period are invoiced as any member's are until D12/D13 add autopay.
- Migration: `20261018100000_plan_join_online` (G20), additive.

## DEC-063 A payment connection needs its webhook signing secret

**Status: Accepted — 2026-09-29** · unit WHSECRET

- Context: in a live test, Razorpay was connected without a webhook secret, because the setup form marked the field "optional". Every webhook was then refused. A customer paid ₹500 and the booking stayed "Awaiting payment" forever, and nothing told the merchant why.
- Decision: **a connection needs the secret its provider signs webhooks with.** Razorpay signs with a webhook secret the merchant chooses when adding the webhook, separate from the key secret, so connecting Razorpay without one is refused with a 400: "Add the webhook signing secret from Razorpay › Webhooks, so Saroh can confirm payments." Cashfree signs with the app's client secret (the key secret already entered), so it asks for nothing more. A Cashfree connection without a saved webhook secret is now verified with the key secret; until now it refused every Cashfree webhook as well. Setup is guided steps: the API keys, then the business's webhook URL (built by the API from `BETTER_AUTH_URL`, its public origin) with Copy, the events to tick and where to find them in the dashboard, then, for Razorpay, the required secret with "Generate one". Settings › Providers shows when a payment update last arrived. Only verified deliveries are kept, so an update listed there shows the webhook works.
- Consequences: a Razorpay connection saved before this reads "Needs attention" ("Needs its webhook signing secret — payments can't be confirmed until you add it"), with Add webhook secret reopening setup. The API flags it as `webhookSecretMissing` on the providers list. When no connected provider can confirm a payment, Payments readiness is `ATTENTION_REQUIRED` (`PAYMENTS_WEBHOOK_SECRET_MISSING`), so the ready checklist doesn't count it as ready. The flag comes from opening the sealed blob in memory. A blob that can't be opened (a seed's placeholder) isn't flagged. The API shipped before the app, so an old app's connect without the secret fails with the message above. Checkout still opens on a flagged connection. Blocking it there is a possible follow-up.
- Migration: none.

## DEC-064 Setting up autopay with nothing owed takes a ₹1 check and refunds it

**Status: Accepted — 2026-09-29** · round-2 plan D (D12, D19; unit D12B) · DEC-059 unchanged

- Context: a customer can turn autopay on when nothing is owed: "Set up autopay" or "Change how autopay pays" on My plan, or the pay link of an invoice already paid. Razorpay's UPI and card authorisations are real payments of at least ₹1, so a ₹0 authorisation is refused. D12 shipped a fail-safe that refused the set-up and told the customer to turn autopay on when they next pay.
- Decision: **with nothing owed, a UPI or card set-up takes the provider's minimum (₹1 at Razorpay) to authorise, and Saroh refunds it automatically.** eMandate stays ₹0: no charge, no refund. The minimum is a constant on each provider's mandate adapter (`authorisationMinimumCents`; Razorpay UPI and card 100 paise), never a literal in a service. Every method the account has stays on offer (DEC-059).
- Consequences:
    - **Not revenue.** The ₹1 is recorded as a payment intent on no order and no invoice, `purpose` AUTHORISATION, tied to the mandate set-up (`checkForMandateId`), so it is auditable. It makes no invoice or credit note, and never counts in takings, This week, Home money, the calendar's money or fees, or a customer's Spent.
    - **Automatic refund, once.** When the ₹1 is captured (the webhook, or the landing page reading it back from Razorpay when the webhook is lost), a refund job is queued on the same transaction, one per payment. It asks Razorpay to refund the full ₹1, never more than was received. An unsure answer leaves the refund pending ("being confirmed") and the job asks Razorpay before it sends again (DEC-026), so a duplicate webhook or a retry never refunds twice. `refund.processed` and `refund.failed` settle it. If the set-up fails after the capture, the ₹1 is still refunded.
    - **The customer is told before and after.** Before they pay: "To switch on autopay, your bank needs a ₹1 check. We refund the ₹1 straight away — it's back in your account in 5–7 working days." After: "The ₹1 check is being refunded — it reaches you in 5–7 working days", then "The ₹1 check was refunded on ‹date›". My plan shows "Autopay check · ₹1 · Refunded" (or "Refund on its way").
    - **The merchant sees it as a check.** The autopay line on Subscription Detail adds "₹1 check refunded" (or "being refunded"), never income. A refund the provider refuses reads "not refunded — refund it from your payment provider".
    - **A refused refund is the merchant's to make** (user, 2026-09-29). Saroh does not retry a refund the provider definitively refuses; the merchant refunds the ₹1 from their provider's dashboard, and the `refund.processed` webhook marks it refunded in Saroh.
    - The `AUTOPAY_NEEDS_A_PAYMENT` fail-safe is removed. A genuine provider refusal still marks the set-up FAILED with a clear message.
- Migration: `20261018170000_payment_intent_authorisation_check`, additive: `PaymentIntent.purpose` and `checkForMandateId` (nullable, unique, FK to the mandate with SET NULL), with the one-target CHECK loosened only for an AUTHORISATION intent.

## DEC-065 The merchant chooses when autopay debits

**Status: Accepted — 2026-09-29** · round-2 plan D (unit D13B, after D13) · user: "the merchant decides when to debit, we show them the options, they can create policies around that"

- Context: D13 issued each renewal invoice on the renewal date (due 7 days later) and asked for the autopay debit 26 hours after (Razorpay's 25-hour pre-debit notice plus a margin). Some businesses want the money on the renewal date itself; others want to wait for the due date.
- Decision: **a business-wide "When autopay charges" setting, with an optional per-plan override (the plan wins when set)**, and three options:
    - **Charge on the renewal date** (`ON_RENEWAL_DATE`): the renewal invoice, and the bank's notice with it, go out early enough that the debit lands on the renewal date — the provider's notice lead rounded up to whole days, so 2 days before for Razorpay. Every method gets the early invoice, a card or eMandate that needs no notice included, so a plan's invoices always go out on the same day; a card is still not debited before the renewal date.
    - **Charge the day after renewal** (`DAY_AFTER_RENEWAL`, **the default** for every business and existing plan): D13 unchanged — the invoice on the renewal date, the debit about 26 hours later (at once for a method that needs no notice). Time for a Retry before the invoice is overdue.
    - **Charge on the due date** (`ON_DUE_DATE`): the invoice on the renewal date, the debit at the start of its due date, the notice placed 2 days before. No time for a Retry before it is overdue, and the setting says so.
- **An early invoice is dropped if the period won't be billed as invoiced.** When a subscription is cancelled (now or at period end), paused, or has a plan change booked or undone after its early invoice exists and before the renewal date, the invoice is dropped and its autopay charge cancelled before any debit: voided, or — for a GST-registered business, which never voids an issued invoice (DEC-023) — credited in full with a credit note. EARLY_INVOICE_CANCELLED goes in the subscription's log. The charge job checks again before each step, so a write that stopped the subscription some other way can't lead to a debit. A dropped early invoice doesn't count as the period's invoice: if the subscription carries on (Keep, a resume), the renewal invoices the period on the renewal date as usual. A debit already asked for (it can't be, before the renewal date) is left to settle.
- **Changing the setting never moves a charge already queued or prepared.** The planned debit is written on the charge's intent when it is queued; the new setting applies to renewals queued from then on. Retry charges as soon as the notice allows, whatever the setting.
- Consequences: the setting shows on the Plans tab and a plan's own on Plan Detail, only where autopay can charge (a provider that takes mandates with `RAZORPAY_AUTOPAY` on; DEC-057's spirit), to whoever holds `subscription:write`. The account's Plan tab and the pay page say "Next autopay charge: ‹date›" by the effective setting. The renewal job adds an early pass; a period with any invoice at all is never invoiced early twice.
- Migration: `20261018200000_autopay_charge_timing`, additive — `BusinessProfile.autopayChargeTiming` (default `DAY_AFTER_RENEWAL`), `SubscriptionPlan.autopayChargeTiming` (nullable), CHECK constraints for the three values, and the one-live-invoice-per-period index widened to leave CREDITED invoices out as it does VOID ones.

## DEC-066 P3: order numbers are one series per business

**Status: Accepted — 2026-09-29** · user · unit P3 (#712)

- Context: found on 2026-09-29. Every storefront counted its own orders from ORD-001 (`count + 1` per storefront), so a business with two storefronts had two #ORD-001s in one Orders list. The choice was a series per business, or a storefront prefix on each number.
- Decision: **one order-number series per business (the Organization, the tenant root), across every storefront.** The `ORD-` format and its three-digit padding stay. Every order a business takes gets its number from one allocator, `nextOrderNumberInTx` (`packages/database/src/order-number.ts`): a site's checkout, New order and walk-ins, and a treatment booked online or at the desk. It increments the business's `OrderNumberSequence` row in the order's own transaction. The row lock keeps two orders from taking one number, whatever the isolation level. A failed order rolls its number back. The business's first order after P3 starts the row after its highest ORD-number. A number already taken moves the counter past the highest. A coded order's serializable transaction, and a treatment's booking, retry when another order took the next number.
- Existing duplicates: the backfill (`packages/database/src/backfill/order-numbers.cli.ts [--dry-run] [--org <id>]`) sets each business's counter to its highest number, never lowering it. For each number two orders share, the older order keeps it and each later order takes the business's next number. The old number is kept in `Order.renumberedFrom`, and the Orders list search and global search find an order by it. Nothing links to an order by its number, only by its id. The backfill is idempotent.
- Consequences: a business's second storefront no longer starts at ORD-001. Some orders at a business with several storefronts change number once. A customer who quotes the old number is still found. Seeds align each business's counter with their fixtures.
- **Rollout:** additive, so the API before P3 keeps working. Run the backfill after the migration, then again once the previous API image no longer serves: while it serves, it still numbers per storefront and can repeat a number. The new API steps past any number it took. **The contract step comes later:** a unique index on the business and number, added once the previous image is gone and the backfill's second run finds nothing. It is not added now because the previous image, running beside it or restored by a rollback, would fail every order at a business's second storefront.
- Migration: `20261019100000_order_number_sequence`, additive: `OrderNumberSequence` (organizationId key, RLS, `org_isolation`) and `Order.renumberedFrom` (nullable).

## DEC-067 Round 2's open questions, settled

**Status: Accepted — 2026-09-29** · user ("go with your recommendations for all the decisions") · round-2 audit

- Context: the round-2 audit (2026-09-29) listed product questions left open by units B5–F18. The user accepted each recommendation below as written.
- **B5 (Orders on a phone):** Orders gets a Filters button that opens a sheet, and a row opens a quick-view sheet, instead of the stacked selects and the full page. Neither is in the design: this is a recorded deviation, following the desk quick view's content.
- **B6:** build the design's bulk "Print tickets (N)".
- **B9:** a cancel is done when the provider accepts the refund. The refund line reads "Refund on its way" until the webhook confirms it; a refund the provider later fails becomes a Needs attention row (DEC-026: an unsure answer holds the money).
- **B11:** paying at the counter voids the order's outstanding pay link, so nobody can pay twice.
- **B14:** build "Next ‹date›" on the Orders row for appointment orders.
- **B15:** the tag reads "Sesame", as the design shows, with the accessible name "Allergy: Sesame".
- **C7:** keep the Packs tab on Customer Detail; it shows only when Class packs is on.
- **C14:** hand-added customers are listed, marked "Added by hand".
- **D16:** Download PDF shows on every issued invoice, due and overdue included; a merchant sends an invoice before it is paid.
- **E6 (DEC-052):** half-hour starts apply to one-to-one services only.
- **E8:** confirmed as superseded by DEC-058: a refund is never more than what was received.
- **E20:** the calendar shows orders to anyone who can stage them (`order:stage`, e.g. Members), without money.
- **E23:** Due counts from today, as the design shows; unpaid days before today count as Overdue.
- **F2:** a low-star review is 3 stars or fewer.
- **F11:** takings follow `payment:read` alone.
- **F13:** switching a module off never switches off another one without naming it in the confirmation.
- **F17:** a Reviewer gets no extra permissions.
- **F18:** the current Member role stays at launch; the default bundles wait for the permission matrix answers.
- **Cashfree:** UPI and card only, for now.
- **Flags:** switch on in this order, each after its browser specs pass on development and a check on Northwind in production:
    1. `MODULE_CLASS_PACKS` with the next release.
    2. `SITE_SHOP` after `site-shop.spec.ts` and the Razorpay test-mode run.
    3. `SITE_ACCOUNT_AREA` after `site-account.spec.ts`.
    4. `ACCOUNT_THREAD` once A13 and A14 are live.
- **Brand v2** (H2–H11) starts after the launch-readiness work, with the plan's default pairings and palettes.
- Consequences: B5, B6, B11, B14, B15, E20, E23 and F13 need code; the rest are recorded behaviour. DEC-052 is amended by the E6 line above.

## DEC-068 Turning a module on asks for its minimum first

**Status: Accepted — 2026-09-29** · user · launch readiness

- Context: today a module switches on at once and works out its readiness afterwards, so a merchant meets what is missing only when it fails in use ("No connected payment provider…"). Four entry points (Settings › Modules, Home's first run, `/onboarding/modules`, "Also sell") each behave differently, and some can enable a module Saroh hasn't rolled out.
- Decision:
    - **One "Turn on" sheet, used from every entry point.** It names what comes with the module, including the modules it needs, and asks only the minimum that makes it work.
    - **The module switches on when that minimum is saved.** Everything else is "Finish setup", and the merchant lands on the module's first screen with the next step shown.
    - **Sensible defaults are created and shown in the sheet, editable before saving:**

        | Module         | Asked at turn-on (default)                                                 | Later ("Finish setup")          |
        | -------------- | -------------------------------------------------------------------------- | ------------------------------- |
        | Sell           | storefront name (the business name), how orders leave (Pick-up / Delivery) | first product, payment provider |
        | Bookings       | opening hours (Mon–Sat 10–7), first service (name, duration, price)        | staff, deposits                 |
        | Class packs    | (Bookings first)                                                           | first pack                      |
        | Payments       | connect Razorpay now, or later (online payment stays off until connected)  | —                               |
        | Contacts       | nothing: a default pipeline is created                                     | —                               |
        | Website        | site name and address (`<name>.saroh.app`); a starter site is made         | publish                         |
        | Communications | connect email now, or later                                                | —                               |
        | Insights       | nothing                                                                    | —                               |

    - **The registered address and GST details are asked before the first invoice or the first online payment**, where they matter, and on the take-money checklist. Turning a module on doesn't ask for them.
    - **Automations is hidden until it has a screen**, the same way DEC-057 treats rollout.
    - The API refuses to enable a module whose rollout is off, in merchant copy (DEC-057).
- Consequences:
    - Enable gains a setup payload per module, validated by the API. The minimum and the switch are saved in one transaction.
    - Readiness still comes from the data. A module saved with its minimum is ACTIVE, or it shows its remaining "Finish setup" items.
    - Existing businesses keep their modules as they are.

## DEC-069 One address: the website is where customers go, storefronts become locations

**Status: Accepted — 2026-09-29** · user · launch readiness · amends DEC-018 / DEC-030 wording

- Context:
    - The address chosen at setup (`Organization.slug`) becomes the website's `Site.subdomain`, and the website is the only public front (`/`, `/shop`, `/book`, `/account`).
    - A storefront has no public address; the site sells from one through "Sells from".
    - Merchants meet five overlapping words (storefront, online store, the Shop kind, the Shop page, `/shop`) and an editable storefront "Web address" that goes nowhere (`Store.slug`, `Store.CustomDomain`, both unused).
    - "Address" means four different things.
    - The address can never change, not even for a typo.
    - Pay links sit on another domain (`saroh.app/pay/…`).
    - "Share your storefront" shares the site's home page.
- Decision:
    - **The business address is the website**, `<address>.saroh.app`, or the verified custom domain once there is one.
        - Everything customers touch lives on it: the shop, the booking page, the account, and **pay links** (`<address>/pay/…`).
        - `saroh.app/pay/…` stays only for a business with no site, and old links keep working.
    - **Words:**
        - Storefronts become **Locations**: the places the business sells from in person.
        - **Your online shop** is the website's `/shop`, selling from one location's stock. "Sells from" is renamed to match.
        - Each location says whether it sells in person only or online too, with a link to the shop.
        - The four "address" meanings are named apart: _web address_, _registered address_, _location address_, and the blog's _posts path_.
    - **The address can be changed** by the owner in Settings.
        - The old address redirects for 90 days and stays reserved to the business, so nobody else can take it. Links already shared keep working.
        - The reserved-word list (`RESERVED_ADDRESSES`) applies.
    - **Selling online creates the website:** turning on selling online makes the starter site on the business's address (DEC-068's defaults), with the shop page ready to publish.
    - **Share buttons share the link that fits** (the shop, the booking page or the site), on the custom domain when verified.
    - **The dead storefront "Web address" and the unused `CustomDomain` table are removed** (expand/contract).
- Consequences:
    - The merchant-facing copy changes across Sell and Sites.
    - Pay-link URLs move to the tenant host, and the old apex links still resolve.
    - An address change needs a redirect table and a reserved-until date.
    - A site created with no address because the slug was taken can no longer happen silently: creation asks for a free address instead.
- Migration: to be planned. The address history and redirects are an additive table. `Store.slug` and `CustomDomain` are dropped in a later contract release.

## DEC-070 Saroh is for businesses, people working for themselves, and people showing their work

**Status: Accepted — 2026-09-29** · user · launch readiness · ships before launch

- Context:
    - Onboarding says "Name your business", suggests Sell first and pre-selects it.
    - Checklists nudge everyone toward a registered address, a business type and a logo "for receipts", even someone with only a website.
    - The one site template is written for a business.
    - Nothing at setup actually requires business details, and the Organization model is neutral. The internal strategy note says the target audience must not be built into the architecture.
- Decision:
    - **Setup starts with "What are you setting up?"** It has three answers and is stored as a _kind_ on the Organization, which the owner can change later in Settings:
        - **A business** (shop, studio, practice): today's flow.
        - **Just me** (freelancer, consultant, creator): clients, bookings, invoices.
        - **A site for my work** (portfolio, blog, projects): website first.
    - **The kind drives wording and defaults only, not features.** Every module stays available to every kind.
        - It sets the words ("your business" / "you", "customers" / "clients" / "readers"), the name field ("Your name or brand"), the order of the first-run jobs, and the starter template.
        - Sell is pre-selected only for a business.
    - **Checklists appear only when they apply.** The registered address, business type and logo nudges appear once something that invoices or takes money is on, not for everyone.
    - **New site templates:** Portfolio, Blog/writing, and Personal/consultant, plus a **Projects block** (image, title, summary, link) for portfolios. The starter template's copy stops assuming a business.
    - **Invoices work on their own.** Issuing, sending and marking an invoice or receipt paid doesn't need the Payments module; an online pay link still needs a connected provider. This changes DEC-019's "invoices under Payments" for invoicing itself.
- Consequences:
    - PRODUCT.md and saroh-product.md widen "who it's for".
    - An additive `Organization.kind` (default BUSINESS for everyone existing).
    - The copy layer reads the kind.
    - The invoices module gate moves off PAYMENTS for issue, send and record-paid.
    - Before launch: the question, copy, first-run order, conditional checklists and invoices-without-Payments. The templates and Projects block follow right after if they aren't ready.

## DEC-071 Test releases: a frozen version on a test address, then "Go live"

**Status: Accepted — 2026-09-29** · user · launch readiness · amends DEC-047 (approval stays advisory unless the business turns it on)

- Context:
    - Publishing is one step: the whole draft becomes the live snapshot (ADR-002).
    - Preview links show the draft as it is at that moment, so a reviewer's view changes as the merchant keeps editing, and Publish ships whatever the draft is now, not what was approved.
    - Preview links live on `saroh.app/preview/<token>` and have no shop, booking, checkout or account pages.
    - There's no scheduling, and approval never blocks publishing.
- Decision:
    - **"Make a test release"** freezes the current draft into a named Publication that isn't live, with an optional note. It's built by the same `buildSnapshot` and stored without repointing `currentPublicationId`.
    - **Each test release has its own address:** `test--<address>.saroh.app`, and `test.<custom domain>` when the business has a verified one.
        - It shows the whole site, including the shop, booking and account pages, with a "Test release" bar.
        - Live products, prices and times are shown, but it **never takes a real order, booking or payment**.
        - Only people with the link can open it (a token), and it's `noindex`.
        - An address containing `--` can never be claimed by a business.
    - **Review and approval attach to the test release** (its fingerprint), not to the moving draft.
    - **"Go live" publishes exactly the tested version**, now or **at a scheduled time** in the business's time zone, even if the draft has moved on since.
        - A scheduled go-live can be cancelled until it runs, and the merchant is told when it happens.
        - Going live is a pointer flip like restore. It records the review standing (#279) and switches the live form fields (#281).
    - **Direct publishing stays**, unless the business turns on **"Publishing needs approval"** (off by default). With it on, only an approved test release can go live. An owner can still override, and the override is recorded.
- Consequences:
    - A test-host lookup mode in the renderer and API.
    - A scheduled job for go-live.
    - A setting on the site.
    - Shop, booking and checkout routes in test mode, with writes refused.
    - Things that don't go through a publish stay live and outside test releases: products, prices, stock, plans and packs (they have their own publish), hours, "Sells from", posts and modules. The test release says so.

## DEC-072 GST shows only when it applies

**Status: Accepted — 2026-09-29** · user · extends [DEC-023](#dec-023-an-invoice-for-every-order-issued-invoices-never-change-and-gst) and D15 · [backend-billing-and-classes.md](../patterns/backend-billing-and-classes.md) GST

- Context: Rye's plan renewal lines are issued with `gstRate` null. D15 already reads null as "not set", not exempt, yet Invoice Detail's paper and the PDF labelled those lines "Nil-rated".
- Decision:
    - **A business that isn't GST-registered charges no GST, so no GST appears anywhere** on its invoice, receipt or PDF: no rate, no tax columns, no "Nil-rated".
    - **A registered business's line with no rate set** (`gstRate` null) shows no GST rate: no "Nil-rated", no "0%".
    - **Only a line whose rate really is 0%** (a nil-rated or exempt supply, recorded as 0) may be labelled "Nil-rated".
    - **A registered business's paper with no line rated** (every `gstRate` null, like Rye's renewals) shows no GST totals — no Taxable value, CGST, SGST or IGST rows and no "Prices include GST" — just the total, on the paper, the PDF and the quick look (`showsGstTotals`); one rated line, 0% included, keeps them. Its title stays D15's "Tax invoice".
- Consequences: presentation only. Stored data and totals are unchanged (a null rate is already taxed at nothing and never counts toward a bill of supply). The rule is `lineGstNote`, once in the API for the PDF and once in the app for the paper. The draft editor's hint no longer says a line with no rate is nil-rated.
- Migration: none.

## DEC-073 Round-2 design deviations, settled

**Status: Accepted — 2026-09-29** · user ("go with your recommendations for the deviations") · the round-2 check against the designs

- Context: the check compared every round-2 screen with its `.dc.html` design. Most mismatches were fixed on the spot. These are the ones where the build differs on purpose, or where a fix needed a call.
- **Kept as built:**
    - **Payments:**
        - the Plan Editor says "Invoiced each month with a pay link", not "by UPI Autopay or card", following D14's rule that copy is honest;
        - Publish sits in a bottom bar on a phone (D6);
        - "Subscribe someone" is in the header;
        - the failed-renewals banner says only what the product does ("isn't paid and needs you");
        - Invoice Detail offers "Copy pay link" and has no pay-link box;
        - PDF dates carry the year;
        - the phone gutter is 16px, from the shared PageContainer.
    - **Orders:**
        - the phone header's actions wrap under the title (the shared PageHeader, the same on every screen);
        - New order's customer step is the shared picker with recent customers and Walk-in (B13/E4);
        - the row menu follows B5;
        - Storefront Settings has no design, and DEC-069 reworks it into Locations.
    - **Customers:**
        - the phone list stacks rows and scrolls its chips;
        - Import and Add customer sit in the header (DEC-056/C14);
        - Overview's Needs attention card and the "Average order" tile stay;
        - the Spent note says what's true ("₹x still owed" / "Including delivery");
        - the offers wording stays honest ("Nothing recorded yet"), since customers aren't always asked at checkout;
        - the merge dialog keeps its Stays row, close X and counts;
        - removal asks for the name, as the design does;
        - C15's copy is accepted.
    - **GST:** see DEC-072. A rate shows only when one applies.
    - **Bookings:**
        - Kavi's calendar shows Orders, Bookings and Invoices: treatment orders (E9) replace the Payments layer, which appears only without Commerce.
        - Pack Detail's receipts show "name · date", because the purchase read carries no invoice number.
        - "On the booking page" is plain text until DEC-069's share links give the app the page's address.
        - The rail says "Class packs" (the module's name) and the pack kind says "One-to-one".
        - The Packs summary and Extend copy say what the API does.
        - The editor's first-pack hint names the pack's kind.
        - E17's "Each sale" card is accepted.
    - **Home and settings:**
        - This week has no "Website · Live" row until DEC-069 settles which address to show.
        - Checklist rows are two lines (title and reason), shared with Home.
        - The phone tab bar stays Home, Sell, Calendar, Insights; the two designs disagree with each other.
        - Mark sent is offered only on orders ready to hand over (the API's stage rule).
    - **Site and accounts:**
        - A past appointment with no attendance recorded still reads "Booked"; it never claims "Attended".
        - The editor's Tablet and zoom controls stay as they are (G2/G3).
        - A shop card adds the first option that can be sold now.
- **Fixed to match the design, or to correct a small error:**
    1. Order Detail's customer card reads "Needs attention: Sesame", since the card covers every kind of entry, not just allergies.
    2. A treatment order shows Needs attention in the customer card as well as the Visits card.
    3. The Orders quick view's close is a plain X, and the customer's name is a Saffron link.
    4. "They asked to stop" shows only when they did ask.
    5. A customer added by hand shows their saved address on Overview before they have an order.
    6. C12's booking-note card uses the customer's full name, and names the roles that can see a sensitive note.
    7. Settings › Business's "Address" tab is "Registered address" (DEC-069 names the four addresses apart).
    8. Permission lists hide the permissions of modules hidden from the business ("Manage automations" while DEC-068 hides Automations).
    9. Module pages (Book, Prices, Shop) draw the design's page title and lead line, and a rich-text intro lines up with the cards.
    10. The account area has the design's compact header (logo, tab title, language) and no site footer.
    11. Whole-rupee prices show without decimals ("₹500"), wherever the site shows a price.
    12. A product card sums up its options ("2 sizes") instead of listing them.

## DEC-074 A location's team sees and moves that location's orders

**Status: Accepted — 2026-09-29** · user · amends F16

- Context: F16 lets storefront staff join the team with a storefront role, but that role opens nothing in the workspace. Sell needs `order:read` or `order:stage`, so their rail is empty.
- Decision: a storefront (location) role sees and moves the orders of **its own location only**: read and stage, with no money, refunds, pay links or cancelling. It's like the kitchen and Member view, scoped to one location. Sell appears in their rail with those orders, and other locations' orders are refused by the API.
- Consequences: the order permissions gain a location scope for this role. The B16 permission tests extend to it.

## DEC-075 Marketing claims: the owner's answers to the claims ledger

**Status: Accepted — 2026-10-03** · user · answers `MARKETING_CLAIMS.md` D1, D2, D3, D13, D14

- Context: the claims ledger (marketing plan U28) found site copy the product can't back, and asked the owner five questions.
- Decision:
    - **Autopay (D1):** UPI Autopay is the merchant's choice, made on their own Razorpay account. Saroh follows what the merchant has set up. Copy says the business _can_ have plans renew on their own, never that they always do.
    - **Insights (D2):** build what the Insights page describes, and reword it until it ships.
    - **What Free and Grow are for (D3):** set from the admin's Plans & modules page, not fixed in site copy. The site's plan lines read the catalogue.
    - **Languages (D13):** "English and हिंदी" means multilingual content. It is internationalisation of the business's own content, to be built; the chip stays only once that exists.
    - **Demo businesses (D14):** Rye & Co., Pulse Fitness, Kavi Dental and the rest are labelled as demos wherever the site shows them.
- Consequences: the ledger's rewrites for these rows follow this entry. Insights and multilingual content become product work. The demo label goes on every screenshot caption and story that names a demo business.
- **Amended 2026-10-09 (owner, #919): Insights' website figures show Orders again.** It had been dropped because it counted `order.paid`, which nothing wrote, so it read 0 beside the paid orders Sales counts from Orders itself. Since #867 every payment writes `order.paid` and a full refund `order.refunded`, so the tile is real and net of full refunds. It is not Sales' "Orders, 4 weeks" twice: it sits beside Visits, Visitors and Enquiries and covers the days the range buttons chose (7, 30 or 90), opening the paid orders of those days. Nothing before #867 is back-filled (DEC-012), so while a range reaches back before 31 Oct 2026 (`ORDERS_RECORDED_FROM`) a line under the tiles says Orders counts from October 2026; with none paid it says "No paid orders (recorded) in the last N days", never a bare 0. Like its neighbours it carries no comparison with the period before.

## DEC-076 The Billing team manages coupons

**Status: Accepted — 2026-10-03** · user · amends the plans catalogue's U4

- Context: U4 gave `coupons:manage` to Platform Owner only, because the plan named a "Billing lead" role that doesn't exist.
- Decision: the Billing staff role holds `coupons:manage`, as well as Platform Owner.
- Consequences: `admin-permissions.ts` and its spec pin Billing as a holder.

## DEC-077 Saroh invoices as Virashi Softwares LLP, with GST

**Status: Accepted — 2026-10-03** · user · answers the plans catalogue's U17 seller question

- Context: Saroh's own invoices (U17) need a legal seller, and the catalogue adds GST to plan prices.
- Decision: Saroh is a product of **Virashi Softwares LLP**, which is GST-registered. Saroh's invoices are tax invoices issued by Virashi Softwares LLP under its GSTIN, and plan prices carry GST as the catalogue says.
- Consequences: the seller details are configuration, not code (`SAROH_LEGAL_NAME`, `SAROH_GSTIN`, `SAROH_GST_STATE`, `SAROH_REGISTERED_ADDRESS`, `SAROH_INVOICE_SAC`), set on the API before the first real charge. The GSTIN and address are never committed.

## DEC-078 Gate W ships the marketing site without Pricing

**Status: Accepted — 2026-10-03** · user · narrows the marketing plan's Gate W

- Context: Gate W was to put Marketing Site V2 live in waitlist mode with the Pricing page reading the plans catalogue. Pricing isn't finished, and no plan limit may appear on any page yet.
- Decision:
    - saroh.in ships without `/pricing`, the pricing draft and preview, the plan teasers on Home and the Solutions pages, and every "Compare every plan" link. Pricing leaves the nav and the footer.
    - The line under each hero's buttons is a fixed, neutral sentence ("Free to start. Move up when you need more."), never the catalogue's card lines. No FAQ answer names a plan's limits or prices.
    - `/pricing` is a temporary (302) redirect to `/waitlist`, so nothing caches it; old addresses that went to Pricing go to the waitlist or Home. The sitemap leaves `/pricing` out.
    - No catalogue in production: the catalogue tables, `GET /public/pricing` and `@saroh/pricing-catalog` stay off `development` for now. `GET /public/waitlist/offer` reads only `LAUNCH_OFFER_DAYS`, answering `{ planId: "grow", planName: "Grow", days }` while it is set and 404 otherwise.
- Consequences: DEC-075's D3 ("the site's plan lines read the catalogue") applies once Pricing ships, with the catalogue. Bringing Pricing back is its own batch: the catalogue migration, U3's public read and the package, then the page, nav, teasers and sitemap entry. Runbook: `docs/architecture/GATE_W_ROLLOUT.md`.

## DEC-079 The workspace groups numbers the Indian way

**Status: Accepted — 2026-10-04** · user · replaces the `en-GB` grouping in `lib/format/locale.ts`

- Context: the workspace formatted every number and amount with `en-GB`, so ₹20,44,971 read as ₹2,044,971. Saroh's merchants read money in lakh and crore.
- Decision: numbers and money in `app.saroh.in` format with `NUMBER_LOCALE = "en-IN"` (lakh and crore grouping, "45K" and "45L" compact). Dates stay on `DISPLAY_LOCALE = "en-GB"` ("3 Aug 2026"). Both stay pinned constants, never the runtime's locale, so server and browser render the same string.
- Consequences: a per-user or per-business locale, when it comes, replaces both constants. Merchant sites keep their own locale (`packages/site-blocks`).

## DEC-080 Insights answers "how is this week going?" and opens its rows

**Status: Accepted — 2026-10-04** · user · extends DEC-075 after the Insights UX audit

- Context: the audit of Insights (6/10) found the takings stopped at last Sunday, nothing on the page led anywhere, the phone chart's dates truncated, the best week was said three times and "Anything to watch?" restated records. The owner asked for every finding fixed, at full width.
- Decision:
    - The takings read carries the week in progress (`thisWeek`): Monday to today, beside the same days of last week. It leads the answers ("How is this week going?") and is drawn hatched beside the twelve, never ranked among them or used in the twelve's comparisons. A change against the same days needs 3 payments, as the months do.
    - Every figure with rows behind it opens them: tiles, the best week, every bar, "Anything to watch?" and the week in progress go to the Orders list filtered to those days (`date=custom&payment=paid`; the list filters by the day placed, so links say "placed"). Enquiries open Leads.
    - Bars are buttons: hover, focus or tap puts the value in a readout above the chart, with its link. No value lives only in a hover. The website's chart uses the same component and writes days "4 Sep".
    - "Anything to watch?" speaks only on a signal (three falling weeks ending below usual; a week 30% or more below usual; a place down 30% or more on the four before) and otherwise says "Nothing unusual in the last four weeks." It waits for four weeks on record.
    - The section is full width, its sentences held to a 68ch measure. The footer says what the figures were counted from, and "How takings are counted" explains the rule.
    - A business that has never taken money sees one message with "Take an order" and "Send an invoice", not an answers card plus an empty state.
- The word is **Sales**, not "Takings" (owner, 2026-10-04, audit F15): the section, its figures, "How sales are counted" and Home's "Sales so far". It still means money actually taken — paid, less refunds — as "How sales are counted" says. Code names (`takings*`) stay; they are not read by merchants.
- Consequences: elsewhere the word is unchanged (a class pack's "Sales and takings" is its own screen).

## DEC-081 The dev environment lives on saroh.io, behind a key

**Status: Accepted — 2026-10-05** · user

- Context: the dev API answered on `dev-api.saroh.in`, so its session cookie was set for `.saroh.in` — the same name and domain as production's, sent to both. Two-level names (`app.dev.saroh.in`) fail TLS on Cloudflare's free certificate, and the dev environment was open to anyone who found it.
- Decision:
    - `development` deploys to **saroh.io** (`app.`, `accounts.`, `admin.`, `api.` and the apex); merchant sites stay on `*.dev.saroh.app`. saroh.io may later give way to a dedicated domain such as saroh.dev.
    - **Amended 2026-10-07 (owner):** `saroh.app` moved to Cloudflare DNS, whose free certificate covers one level, so dev merchant sites moved from `*.dev.saroh.app` to **`<address>.saroh.io`**, served by the Cloudflare Worker `saroh-sites-dev` (deployed from `development` by `deploy-sites.yml`). The zone's own hosts (`api`, `app`, `admin`, `accounts`, `www`, `media`) have no-Worker routes; the apex stays dev's marketing site, so the renderer's apex pages (preview and review links) have no dev host until the dedicated dev domain arrives. `RENDERER_URL` on the dev API is `https://saroh.io`; `media` is reserved there. `saroh.app` serves production only.
    - **Amended 2026-10-08 (owner):** dev merchant sites move to their own domain, **`<address>.saroh.dev`**, mirroring production's `saroh.app`; `saroh.io` keeps the dev apps (`app`, `accounts`, `admin`, `www`, `api`, `media`). The renderer's apex `saroh.dev` serves preview and review links on dev again. `RENDERER_URL` on the dev API is `https://saroh.dev`; the `*.saroh.io` merchant-site wildcard is removed. Dev custom domains (Cloudflare for SaaS) stay on the `saroh.io` zone until #859.
    - Dev's session cookie has its own prefix (`AUTH_COOKIE_PREFIX`); production's is unchanged.
    - The dev apps admit only browsers that opened a page with `?access=<key>` (`DEV_ACCESS_KEY`); everyone else lands on the same page in production.
    - A `development`-branch build refuses to start without the dev environment's variables, as a production build does without production's.
- For now Vercel's preview protection (a Vercel team login) stays on in front of the dev apps, since only the owner uses them, and the key is the second lock. When others need dev, the saroh.io domains come out from behind Vercel's login (a Deployment Protection Exception, or protection off for those projects) and the key alone decides.
- Consequences: the dev API and merchant sites stay reachable without the key. A new Vercel app joining the dev environment needs the gate in its middleware and its variables on the `development` branch.
- **Amended 2026-10-09:** Vercel is retired (DEC-107), and its preview protection with it: the access key alone keeps the dev apps private. A new app joining the dev environment needs the gate in its middleware and its dev Worker's variables in `wrangler.jsonc` (secrets in the `cloudflare-development` GitHub environment).

## DEC-082 An issued invoice prints the seller as it was at issue

**Status: Accepted — 2026-10-05** · user · extends ADR-008's frozen seller (GSTIN, state, address)

- Context: an issued invoice already froze the buyer, and the seller's GSTIN, state and registered address, but its paper read the business's **name, legal name and contact email** live from settings. Renaming the business changed every old invoice, its PDF and the customer's pay and receipt links.
- Decision:
    - Once issued, an invoice's printed data never changes. `Invoice.sellerName`, `sellerLegalName` and `sellerEmail` are written wherever the GSTIN and address are (`documentColumns`, from `loadTaxProfile`: `Organization.name`, `BusinessProfile.legalName`, `BusinessProfile.contactEmail`). A credit note or supplementary invoice copies its original's, as it does the GSTIN.
    - Everything that draws an issued paper reads the frozen values: Invoice Detail and the quick look, the PDF, the pay page and the customer's receipt. A frozen name marks all three as frozen; a legal name or email blank at issue stays blank.
    - A draft, and only a draft, prints today's settings (`serializeInvoice` sends null for its frozen seller fields).
    - Migration `20261022110000_invoice_seller_frozen` backfilled every invoice that is not a draft from today's settings — what its paper printed until then. A row still without them (written outside the API, like a seed) falls back to today's rather than print no seller.
    - **The logo stays live**: it is branding, not a particular rule 46 asks a tax invoice to carry, and a business replacing its logo expects its paper to follow.
- Consequences: what is sent _now_ still names the business as it is now — the invoice email's sender line, an order's pay link and the booking page are not issued paper. `printedSeller` (API `invoices/invoice-paper-view.ts`, app `lib/invoices/seller.ts`) is the one rule.

## DEC-083 Customers get the invoice PDF: attached to its email and downloadable from the pay link and receipts

**Status: Accepted — 2026-10-05** · user · supersedes round-2 default 106 (the pay page keeps no PDF)

- Context: only the merchant could download an issued invoice's PDF (D16, default 37). The customer got a link by email, and a pay page or receipt with the browser's print. Default 106 had dropped the pay page's PDF.
- Decision:
    - **One PDF.** The customer gets the same PDF the merchant downloads: the issued paper, the seller as at issue (DEC-082), the business's own name and logo, no Saroh brand. Drawn on request and never stored (`invoices/issued-invoice-pdf.ts`).
    - **Attached to the invoice email**, the send and every reminder. The send job draws it as it hands the email to the business's own provider (Saroh's email is still never used). Resend takes attachments; the SendGrid and SMTP relays, reached through the same Resend-shaped request, are not given one. Where the provider can't carry it, or the PDF can't be drawn or is over 5 MB, the email goes with its link alone, as before. A send is never failed for its attachment.
    - **Download PDF on the pay link** (`GET /public/invoices/:token/pdf`): the token alone, found by its hash as the pay read is; a replaced or revoked link, a draft and a void invoice are a 404. Limited per caller as the pay read is, and to 10 drawings per invoice per 10 minutes. `Content-Disposition: attachment`, named as the merchant's (`pdfFileName`), `Cache-Control: private, no-store`, `nosniff`. saroh.app asks it server to server from `/pay/<token>/pdf`, so the token never goes from the browser to the API.
    - **Download PDF on a receipt** (`GET /public/site-accounts/me/receipts/:id/pdf`): the customer's session and the site's relay, exactly as the receipt's read; anyone else's invoice is a 404.
    - On saroh.app it sits beside Print where the page offers a copy (a business that doesn't take payment online, and receipts), and as a quiet line under the pay page's own actions otherwise, in the business's `--site-*` tokens.
    - **Order pay links** (`/pay/o/<token>`) get none: the page is the order, not a paper, the link retires once the order is paid online, and an order can carry an invoice, a supplementary invoice and credit notes. The customer's order invoices are in their receipts, with the PDF.
- Consequences: the invoice email's words are unchanged — they don't promise an attachment a provider may not carry. A provider adapter that learns to carry attachments says so (`takesAttachments`) and starts sending it.

## DEC-084 A business that said it is registered names its type before it goes live

**Status: Accepted — 2026-10-05** · user · from the pre-launch list (2026-09-28)

- Context: setup's "Registered" chip saved nothing, so a registered business could go live with no legal type (Pvt Ltd, LLP, partnership, …) and the checklist could not tell it from one never asked.
- Decision: setup stores the answer (`BusinessProfile.legallyRegistered`). A business that said Registered and takes money or invoices gets a "Choose your business type" step on its go-live checklist (Settings and Home) until it picks one. Every other business gets a gentle suggestion in Settings, never a block.
- Consequences: businesses set up before this release read as "not asked" (the old answer was never saved), so they get the suggestion only. The API must deploy before the app: an older API refuses the new field.

## DEC-085 The API sends its email through Amazon SES in Mumbai

**Status: Accepted — 2026-10-06** · user · in conversation

- Context: the API sent identity mail and site sign-in codes through a Google Workspace account over SMTP. A personal mailbox is the wrong sender for a product's transactional mail (sending limits, one person's credentials).
- Decision: the `SMTP_*` set points at Amazon SES in `ap-south-1`, next to the API's servers in India. `saroh.in` sends with SES's DKIM and a `mail.saroh.in` MAIL FROM domain; account-level suppression stops mail to addresses that bounced or complained. The credentials can only send, only from `@saroh.in`. Google Workspace stays the mailbox people write to. The code transport is pooled (two connections at most), so a burst of codes reuses an open connection. No code path changed: the switch was configuration.
- Consequences: the privacy page lists Amazon Web Services (SES) for sending and Google Workspace for our mailboxes (dated 6 Oct). Bounce and complaint notices go to SES, not to a webhook: nothing in Saroh marks an address undeliverable yet, which is fine at today's volume and is the next step if bounces grow. Rolling back is a configuration change on the host.

## DEC-086 Saroh sends a business's customer notifications until it connects its own email

**Status: Reversed — 2026-10-07 (owner); code removed 2026-10-21 (#1134, DEC-174 U3)** · was Accepted 2026-10-06 · user · in conversation · built 6 Oct for the booking notices (U1–U4), behind the `SAROH_BUSINESS_EMAIL` flag, off by default, and left off; deleted, not fenced, by the automatic notices plan: the flag, the four `SAROH_BUSINESS_EMAIL_*` variables, the Saroh sender, the allowance and its catalogue row (`saroh-emails`, now read out of stored catalogues as retired), the Settings › Providers "Booking emails" block and the seed. `no-saroh-customer-mail.spec.ts` fails if a customer-notice module imports a Saroh sender again

- Context: DEC-011 sends a business's messages to its customers only through a provider the business connects. Most new businesses connect none, so their customers get no booking confirmation or order update by email at all.
- Decision: while a business has no connected email provider, Saroh's own email (Amazon SES, DEC-085) sends its customer notifications: booking confirmations and the other transactional messages the business would send through its provider. When the business connects a provider, its provider sends them and Saroh stops. Marketing and broadcasts never go through Saroh.
- Settled with the owner the same day: the booking notices (confirmed, moved, cancelled) come first. Each email Saroh sends counts against a monthly plan allowance; Free gets a small allowance and Grow and Pro more, with the numbers kept only in the plans catalogue. At the allowance, or when it can't be read, Saroh does not send (the customer's account message still stands). Mail goes from its own subdomain (`bookings@notify.saroh.in`, own DKIM and MAIL FROM) as "‹Business› via Saroh", replies to the business. A separate AWS account comes only if volume grows, since SES judges reputation per account.
- Settled with the owner after the code review (6 Oct): Saroh sends at most 3 emails about one booking in any 24 hours, so a customer moving a booking again and again can't drain the business's allowance through Saroh's address (past it the account message still stands and nothing is counted); the business's own provider has no such cap. A plan cell marked soft gives Saroh no allowance, since a soft cap never stops a send.
- Amended 2026-10-06 (owner): **a business connects its own email provider on Grow and Pro only.** The catalogue's `integrations` row decides (a plan without it, or at its cap, can't connect one); Free relies on Saroh's allowance and upgrades to get its own. Settings and the allowance's notices offer connecting only when the plan has room for it, read by the connect's own check (`MeteringService.hasRoom`), and otherwise lead with seeing plans.
- Still open: review invitations (MARKETING_CLAIMS D11), and the other notices after booking emails have run clean.
- Consequences: the booking notices (confirmed, moved, cancelled) go through Saroh when the rule allows: no provider of its own, the business's flag on, an allowance with room, and no global stop. Every other notice keeps DEC-011's rule: no provider, no customer email.
- **Reversed 2026-10-07 (owner).** (1) A business's messages to its customers go only through the business's own connected email provider; Saroh sends none of them. The code built for this decision (`sarohMaySend`, the Saroh sender, the allowance, Settings' "Booking emails" block) stayed in place and off, the `SAROH_BUSINESS_EMAIL` flag never switched on for any business, until #1134 removed it on 2026-10-21 (see Status). (2) On Free, which can't connect its own email (DEC-091), customers get no emails; they see their updates in their account on the business's site. That is intended. (3) Review invitations go through the business's own provider only; with no connected email provider, no invitation is sent (settles MARKETING_CLAIMS D11). (4) Unchanged: a site's sign-in codes and the email-changed notice stay on Saroh's own identity email (ADR-011).

## DEC-087 An in-person booking is offered only inside the business's opening hours

**Status: Accepted — 2026-10-06** · user · from #820

- Context: opening hours are kept per walk-in storefront (`Store.kind` SHOP, `openingHours`; Settings › Hours writes every storefront), but the slot engine never read them. Free times came only from each person's hours, or a service's own hours, so a business could offer times it says it is closed.
- Decision: when a business has a SHOP storefront with opening hours, every in-person booking (a service that is `IN_PERSON`, or `EITHER` booked in person) is offered only inside those hours: a person's or service's hours are cut to them. Online bookings (`ONLINE`, or `EITHER` booked online) are not cut. A business with no SHOP storefront, or none with hours set, works as before. If its storefronts' hours differ, a time is offered when any of them is open.
- Consequences: the Availability page shows the hours that fall outside opening hours as not bookable, and says why, so the merchant can see the cut. Bookings already made are never moved or cancelled. Supersedes nothing.

## DEC-088 The business decides how a booking is paid: online, at the desk, or both

**Status: Accepted — 2026-10-06** · user · from #821 and #822

- Context: the booking page offered "pay now" whenever Payments was on and a provider connected, and "Pay at the desk" only when no deposit was due. The business had no say, and a deposit with no provider left a service that couldn't be booked online at all, while the summary still showed a desk line (#822).
- Decision: Booking rules gain "How people pay when they book": Online, At the desk, or Both (default Both, which keeps today's behaviour). The booking page offers only the methods the business allows, and online only when a provider can take it. A deposit or full price at booking needs online: when online isn't allowed or no provider is connected, the service editor says so where the deposit is chosen (#821), and the booking page never shows a payment line it can't honour.
- Consequences: existing businesses read as Both. One setting for the whole business, beside the other booking rules, since bookings aren't tied to a storefront.

## DEC-089 A deposit that can't be taken online follows the business's payment setting

**Status: Accepted — 2026-10-06** · user · amends DEC-088

- Context: DEC-088 blocked a booking whose service asks a deposit (or the full price) at booking whenever online payment wasn't possible, with "‹business› can't take the deposit online right now. Get in touch with them to book." The pricing line (mkt/plan-deposits) took the opposite view: book it and pay at the desk.
- Decision: the business's "How people pay when they book" decides. With Both or At the desk, a deposit that can't be taken online (desk only, Payments off, or no provider) is paid at the desk: the booking goes through as pay at the desk, and the summary shows that line. With Online only, the booking page says to get in touch and the booking can't be made, as before.
- Consequences: the API accepts DESK for a deposit service whenever the business allows the desk and online isn't possible. The service editor's warning says what will happen (paid at the desk, or can't be booked online). Supersedes the blocking part of DEC-088 for Both and At the desk.

## DEC-090 A template carries its own exact palette and type scale

**Status: Accepted — 2026-10-06** · owner · amends [DEC-046](#dec-046-brand-and-fonts-are-their-own-track-and-sarohs-fonts-stop-reaching-merchant-sites-now)'s curated catalogue, for templates only · industry templates plan (U1b fidelity)

- Context: the first two industry templates could not match their designs. Website › Style holds curated swatch keys (six rows of five) and five sliders, and a design is drawn in exact colours no row holds (the blog's red `#9C2A18`, the ceramics studio's deep green `#1F3D2B`, its page `#F4F1E8` and hairlines), with a display size, body size, reading width and small wide-tracked section labels the heading-scale slider cannot express, and 1px hairline gaps under the 6px slider floor.
- Decision: **a template's colourway may carry its own exact palette and a small type scale.** `Site.style.palette` holds one `#RRGGBB` colour per `--site-*` role (page, card, text, body, quiet text, hairline, accent and its text, hero, call-to-action band and footer, each with its text); every text pairing is checked to 4.5:1 and refused by field otherwise. `Site.style.type` holds a display size (40–72px), a body size (15–19px), a reading width (52–76ch) and a section-title style (`plain`, `eyebrow`, `eyebrowAccent`), refused outside those bounds. **Merchants still choose only from curated choices**: Website › Style lists the site's template's colourways as named options beside the swatch rows, and the API refuses a palette or type scale that is neither one of those colourways' nor the one the site already holds. There is no colour picker, and the type scale has no control of its own. The grid gap may go down to 1px for a template; the merchant's slider still starts at 6px.
- Consequences: the colours a page wears are still the merchant's `--site-*` layer, never Saroh's. The publisher turns each hex into the HSL triple the layer already carries, so the renderer's guard is unchanged and no `#` reaches a stylesheet. Blocks read the type scale through `--site-display-size`, `--site-body-size` and `--site-measure` with today's sizes as the fallbacks, and section titles carry `data-site-title` for the eyebrow, so an untouched site renders exactly as before. Section headings use the site's heading face throughout. Product grid gains a `plates` look and gallery and projects a caption placement `over` the photo, each on a bounded band. Reset returns a template site to the colourway it was made in.
- Migration: none. Both fields are optional JSON inside `Site.style`.

## DEC-091 A business connects its own email and payment accounts on a paid plan

**Status: Accepted — 2026-10-06** · user · from the DEC-086 email work and the plan checks on saroh.io

- Context: the catalogue's `integrations` row ("Third-party connections") meters connected payment and messaging providers, but it was off on every plan. With plan rules on, no business could connect its own email provider or its Razorpay or Cashfree account, which contradicts DEC-086's "connect your own email" and Grow's online payments.
- Decision: the row is now "Your own email and payment accounts". It is included with no cap on paid plans and locked on Free. Payment and messaging providers both count towards it. Free relies on Saroh's small booking-email allowance (DEC-086) and takes money offline, and upgrades to connect its own.
- Consequences: the published catalogue needs a new version with the row on for paid plans before plan rules are switched on anywhere. Settings and the Saroh-email notices on Free offer an upgrade rather than "Connect your email". The sample catalogue (`seed.ts`) follows with no caps.
- Amended 2026-10-07 (owner): DEC-086 is reversed, so Free has no Saroh booking-email allowance to rely on. A Free business's customers get no emails; they see their updates in their account.

## DEC-092 Taking payment online is not a setup step on a plan without it

**Status: Accepted — 2026-10-06** · user · from #835

- Context: on a plan without online payments, the "Ready to take payments" checklist (Settings › Business) and Home's "Get ready to take money" counted "Take payment online" as a step left (#835). Nothing in setup could finish it, so a Free business could never reach all done.
- Decision: that step is not counted. Both checklists show it beside the steps, outside the count and the bar, as "Comes with ‹plan›" when the catalogue's `payments` row names the plan that has it, otherwise "Comes with a paid plan", with See plans to `/settings/billing#change-plan`. Payments' other steps (connect, finish connecting, reconnect) still count on a plan that takes payment online.
- Consequences: `readyChecklist` returns the plan's asides as `outside`, apart from `done` and `total`; `loadReadyChecklist` and `loadSettingsChecklist` read billing access only on such a plan, best-effort. Once every counted step is done the checklists hide, aside included; the plan page and the Payment panel still say it.

## DEC-093 A paid plan starts with a nominal first month on autopay, for a 12-month term

**Status: Accepted — 2026-10-07** · user · from the UX audit (UX-003, D1/D2) · the 12 months as a price promise superseded by DEC-161 (2026-10-14): one autopay covers 12 monthly charges, a catalogue setting, and prices can change with notice and approval

- Context: the plan checkout's quote said "30-day free trial, nothing charged today", while Razorpay took a small mandate check. Monthly subscriptions were created as open-ended mandates running for years, and the yearly plan as a yearly autopay. None of it matched the pricing decided on 5 Oct.
- Decision: after launch, a new paid plan starts with a nominal first month and autopay. The checkout names the mandate check honestly, and says if it is refunded. A monthly plan runs for 12 charges and then renews with one tap. A yearly plan is a single payment for the year. The launch offer comes from the catalogue, never fixed text.
- Consequences: the subscription is created with a 12-charge limit and the yearly plan as a one-time order. The checkout and Plan and billing describe exactly what is charged today and later. Returning from Razorpay checks the payment, without waiting for the webhook. Builds #803.

## DEC-094 One website per business at launch, on every plan

**Status: Accepted — 2026-10-07** · user · from the UX audit (D3)

- Context: the catalogue sold Pro with more than one website, but the app allows one per business.
- Decision: one website on every plan for launch. The Websites row is hidden from the pricing page, and the Website row says "your own domain". More websites per business is future work.
- Consequences: the catalogue on each instance needs a new version with the row changed before the pricing page is live.

## DEC-095 Free's monthly booking cap counts only bookings customers make online

**Status: Accepted — 2026-10-07** · user · from the UX audit (D5)

- Context: Free's monthly bookings cap also refused bookings the owner made at the desk, and customers learned bookings were paused only after filling in the whole form.
- Decision: the cap counts bookings customers make on the business's site. Bookings staff make in the workspace are never capped. Past the cap, the booking page says up front that online booking is paused, before the form.
- Consequences: metering filters by where a booking came from. The booking page reads the cap state before showing the form.

## DEC-096 Opening hours limit in-person booking times for every business

**Status: Accepted — 2026-10-07** · user · amends DEC-087 · from the UX audit (UX-009, D8)

- Context: DEC-087 cut booking times only to walk-in (SHOP) storefronts' hours. Settings › Hours saves to the business's hours shown in the site header, so a business with no walk-in location offered times outside the hours its own site displays.
- Decision: the hours set in Settings › Hours limit in-person booking times for every business, whatever its storefronts. Online-only sessions are not cut, as in DEC-087.
- Consequences: one source of opening hours for the header, the booking page and the slot engine. Bookings already made are never moved.

## DEC-097 Possible duplicate contacts are offered to staff to merge, never merged automatically

**Status: Accepted — 2026-10-07** · user · keeps DEC-049 · from the UX audit (UX-013)

- Context: a customer signing in on a merchant site gets a separate contact unless the existing contact's email was already verified (DEC-049). The audit saw duplicates as a bug.
- Decision: DEC-049 stands, for safety: a shared or mistyped inbox must not open someone else's history. Staff see "This may be the same person" with a merge action on both contacts, and merging is their choice (ADR-011: nothing merges silently).
- Consequences: a merge prompt on the contact pages, backed by an email match. Merging keeps both histories.

## DEC-098 Counter money follows permissions, never role names

**Status: Accepted — 2026-10-07** · user · from the UX audit (D7)

- Context: seeing amounts and recording payments at the counter was decided partly by role name (Owner, Admin, Member).
- Decision: what a person can see and do with money is decided only by the permissions their role carries, as set by the owner or an admin. No screen or endpoint checks a role name for money.
- Consequences: every role-name check for money is replaced by its permission (ADR-008). Built-in roles keep their default permissions.

## DEC-099 Custom roles are a Pro feature; class packs aren't offered yet

**Status: Accepted — 2026-10-07** · user · from the UX audit

- Decision:
    - Custom roles are included on Pro only. Free and Grow can't create them or give a role permissions beyond the built-in ones (taking permissions away is never blocked).
    - Class packs aren't offered on any plan for now. The module is hidden like Automations (DEC-068), and existing data is kept.
- Consequences: the catalogue's Custom roles row is off on Free and Grow, and the class packs module joins the not-offered list.

## DEC-100 The 12-month term ends with a request to pay; paying resubscribes

**Status: Accepted — 2026-10-07** · user · clarifies DEC-093 · reworded by DEC-161 (2026-10-14): the request is to approve the next autopay, and "term" is not a price promise

- Decision: a monthly plan's 12 charges, or a yearly plan's year, run to the end of the term. Before the end the owner is asked to pay for the next term, and paying resubscribes them for another term. The first month is priced before GST, like every Saroh price.
- Consequences: the renew prompt opens in the term's last 30 days. A business that doesn't pay moves to Free at the term's end, with the move-down rules (#800/#801).

## DEC-101 A release going live closes its review; footers carry a contact email

**Status: Accepted — 2026-10-07** · user

- Decision:
    - When a site change or test release goes live, any open review request for it is closed.
    - Saroh's own sites show contact@saroh.in as the contact address.
    - A merchant's site footer shows the business's own contact email when the business has added one.

## DEC-102 The Saroh credit on merchant sites: Free only

**Status: Accepted — 2026-10-07** · user · from the UX audit (D4)

- Decision: Free sites show "Made with Saroh" in the footer, linking with the business's referral code. Paid plans show no Saroh credit.
- Consequences: the renderer reads the plan to choose the footer credit, replacing the "Runs on Saroh" line every site shows today.

## DEC-103 Publishing needs approval is a Pro feature

**Status: Accepted — 2026-10-07** · user · from the UX audit (D9)

- Decision: the "Publishing needs approval" website setting is included on Pro only. A teammate's site edits wait for an owner's or admin's approval before going live. The setting is hidden on Free and Grow, not upsold from a switch that does nothing.
- Consequences: the catalogue's approval row is included on Pro. An approval already switched on, on a plan without it, stops applying, and publishing goes through as normal.

## DEC-104 Customers can use discount codes at a merchant site's checkout

**Status: Accepted — 2026-10-07** · user · from the UX audit (D12)

- Decision: on every plan that sells on its website, the site's bag and checkout accept the merchant's discount codes from Sell › Discounts, with the same rules as at the counter.
- Consequences: the checkout quote validates and applies a code, and orders record the code used.

## DEC-105 Team seats count people who can change things; view-only people have their own limit

**Status: Superseded in part by DEC-155 — 2026-10-13** (was Accepted 2026-10-07) · user · from the UX audit (D6) · the separate view-only limit is gone; bookable staff using a seat stands

- Decision: anyone whose role carries a write permission (books, sells, edits), including bookable staff, uses a team seat. People whose role carries only view permissions don't use a seat. They count toward a separate per-plan limit, the one Reviewers use today, which can change by policy.
- Consequences: metering classifies a member by their role's permissions, not its name. The catalogue's Reviewers row becomes the view-only people limit.

## DEC-106 Storefront roles follow permissions for money too

**Status: Accepted — 2026-10-07** · user · amends DEC-048 · extends DEC-098

- Context: DEC-048 let a storefront's Admin, Manager or Editor take and change that storefront's orders, recording payment included, because of their storefront role name.
- Decision: on a storefront too, seeing amounts and recording or taking payment depend only on the permissions the person's roles carry. No storefront role name grants money.
- Consequences: the storefront role checks in the stores service give way to permissions. A storefront role that should take payments needs a role carrying the payment permission.

## DEC-107 Every Saroh web app runs on Cloudflare Workers, deployed from GitHub Actions

**Status: Accepted — 2026-10-08** · owner · supersedes DEC-025 · epic #864

- Context: merchant sites render per request, and Vercel bills that traffic by data sent, requests and origin transfer; the account's daily build limit also stopped deploys on 7 Oct. The merchant sites moved to a Worker on 7 Oct (`saroh.app` production, `<address>.saroh.io` dev).
- Decision:
    - **The marketing site, workspace, accounts and admin move too.** Each app is one Worker per environment (`saroh-<app>` and `saroh-<app>-dev`), built with OpenNext. Vercel is no longer used once the move is done.
    - **GitHub Actions builds and deploys** (`deploy-frontends.yml`, all five Cloudflare apps): `development` → the dev Workers, `main` → production. Each deploy labels its Worker with the app's build fingerprint (Turbo's hash of what its build reads, tests and docs excluded); a push deploys only the apps whose fingerprint differs from the live one (`scripts/cf-plan.mjs`). A manual run, the API's pricing-publish trigger and the nightly marketing rebuild always deploy. Settings that aren't secret live in each app's `wrangler.jsonc` and feed the build too; secrets live in the GitHub environments `cloudflare-development` (branch `development` only) and `cloudflare-production` (`main` only) and are copied onto the Worker on every deploy, never printed.
    - **Dev stays private.** The dev apps keep the access-key gate (DEC-081): without the key a visitor lands on the same page in production. A dev app without its key is never deployed.
    - **Deploys can be started from the admin console** (#886, owner 8 Oct). Platform Owners only (`deployments:run`, on no other role), for one app. **Each console deploys only its own environment** (owner, 9 Oct): the dev console (admin.saroh.io, dev API) deploys dev, the production console (admin.saroh.in, prod API) deploys production. The API decides from its `SITE_DEPLOY_ENVIRONMENT`: it shows only that environment and refuses a start for the other (403, in the audit trail as refused); with none set, it refuses every start. Dev starts at once; production asks for confirmation naming the app (its Worker's name, typed back and checked by the API). The API starts `deploy-frontends.yml` through `workflow_dispatch` with the token it already holds (`SITE_DEPLOY_GITHUB_TOKEN`, Actions-only on this repo), so only code already on `development` or `main` can deploy. Every start, and every one refused for its environment, by the rate limit or by GitHub, is in the admin audit trail (who, which app, which environment, when), and starts are rate-limited per app and environment and per operator. A console deploy always builds; pushes still deploy only changed apps. The page reads live state from GitHub Actions only, until the API holds a Cloudflare read token.
    - **The marketing site is fully static.** Every page is built at deploy time and served from the build; nothing regenerates at request time (a Worker can't read `content/` or compile MDX while serving). Pricing and the launch offer are read when the site is built, and a deployment's build fails rather than publish the placeholder. A pricing publish starts a build (`SITE_DEPLOY_GITHUB_TOKEN` on the API). **Amended 2026-10-09 (owner): nothing deploys on a schedule.** A dated page (Help and Templates on 17 Oct) appears at the next deploy: a merge, or a Platform Owner starting one from admin's Deployments page.
- Consequences: the visitor's address comes from `cf-connecting-ip` behind Cloudflare. Routes are set to fail open, so a failing Worker falls through to the origin while Vercel is still there. `VERCEL_ENV` / `VERCEL_GIT_COMMIT_REF` keep their names for now: the apps' checks read them and the deploy sets them.
- **Amended 2026-10-09:** the move is done and Vercel is retired. Every Saroh web app (saroh.in, app, accounts, admin and the merchant sites on saroh.app) runs on Cloudflare Workers; no Vercel project serves any Saroh domain, and the Privacy Policy no longer lists Vercel as a processor.

## DEC-108 Merchants verify their site and connect their own trackers by public ID only; nothing they enter runs code

**Status: Accepted — 2026-10-08** · owner · extends DEC-012, DEC-071, DEC-091 · epic #889

- Context: merchants run ads and want analytics and Search Console on their Saroh site. Saroh deliberately does not record merchants' visitors itself. The merchant brings their own tools, as with their own email and payments (DEC-091). A merchant site is served on a Saroh address (`*.saroh.app`) or the merchant's domain, so whatever runs there can harm customers and Saroh's domain.
- Decision:
    - **Verification codes on every plan.** Google Search Console, Bing, Meta and Pinterest by `<meta>` tag only. The tags stay on the live site, because those services check again later.
    - **Trackers on paid plans, from a fixed list, by public ID only:** GA4, Google Ads, Meta Pixel, PostHog, Microsoft Clarity, Plausible and Umami Cloud.
        - Saroh writes every loader, and their hosts are fixed in code.
        - There is no code box and no Google Tag Manager, because whoever controls a container can run any code on the site.
        - Vendor features that inject scripts from the vendor's dashboard (PostHog site apps, web experiments and surveys) are switched off and cannot be turned on.
        - A new tool joins the list only after Saroh checks it can't inject code.
    - **Nothing secret is stored or served.**
        - Only public IDs are saved. A pasted value that looks like a key, token, API secret or password is refused and never stored or logged.
        - The public read the site uses never carries a merchant's provider secrets or any other organization data.
    - **Live without a publish.** Codes and trackers are read live, outside the publication snapshot: an exception to ADR-002 alongside DEC-071 and DEC-102. The tracker read fails closed: no trackers unless the resolved plan includes them.
    - **Consent and limits.**
        - Trackers that need consent load only after the visitor accepts a banner in the site's own look. Accept and Reject are equal, GPC counts as Reject, and the banner always links to a notice.
        - Trackers never load on checkout, autopay, order-status, account or pay pages, test releases or previews.
        - Customer details in booking, enquiry, sign-in and checkout forms are masked from session recordings, and Meta's automatic form matching is off.
    - **Responsibility.** The merchant is responsible for their visitors' data for the tools they connect; Saroh acts on their behalf. Staff can switch off a site's trackers from admin, and the terms forbid malicious use. The staff permission is `organization:trackers:write`, held by Support and Platform Owner (confirmed by the owner, 8 Oct).
    - **Later.** Shop and booking events, and sending purchases from Saroh's server, are a later plan. Any secret that plan needs is stored encrypted on the API like payment keys, never served.
- Consequences: new tables hold codes and trackers, separate from the snapshot-bound `Site` fields, and never count as unpublished changes. Each page view makes one more live API read. A catalogue row gates trackers. Every merchant site also gets `sitemap.xml` and `robots.txt`.

## DEC-109 An online-only storefront is 0 locations, on every plan path

**Status: Accepted — 2026-10-08** · owner · amends ADR-010 · #875

- Context: the catalogue's `locations` row already counted only places customers visit (`shopLocations`). Where the catalogue doesn't govern a business (the `PLAN_ENFORCEMENT` switch off, or a business it doesn't reach yet), the old `storefronts` floor still counted every storefront, online-only included, and refused creating one past it.
- Decision: only a physical place (a storefront whose settings say `SHOP`) is a location. The old floor counts what metering counts (`countUsage(…, "shopLocations")`) and is asked where a storefront becomes a SHOP: created as one (Sell's setup starting from the registered address) or its kind changed to one. Creating an online storefront asks only the product's ceiling (25).
- Consequences: `billing/legacy-location-floor.ts` holds the floor; its refusal uses the catalogue's words ("Your plan includes N places customers visit"). The workspace's storefront allowance is the ceiling. Sell's setup on a plan with no room starts the location online rather than refusing. The admin console's `storefronts` usage is the shop count.

## DEC-110 Invoice pay links stay hash-only; the screen names when the link was made

**Status: Accepted — 2026-10-08** · owner · #870

- Context: an invoice's pay link was shown in full only in the tab that made it. Storing the token encrypted would let "Show link again" work anywhere, at the cost of a readable token if the database leaked.
- Decision: keep storing only the token's hash. After a reload or on another device, the invoice says plainly that the full address is shown only once and that a new link ends the old one, and asks before making one. Invoices record when their current link was made (`payLinkCreatedAt`), and the screen names that date.
- Consequences: the tab forgets a remembered link once anything replaces or closes it (send, reminder, view link, paid, void, credit), so it never shows a dead link.

## DEC-111 A diary person given a login starts as "Calendar only", which uses a seat

**Status: Accepted — 2026-10-08** · owner · amends DEC-105 · #868

- Context: bookable staff can be on the diary without a login (DEC-105). Nothing said what access they get when they are given one.
- Decision: by default they join as **Calendar only**: their own bookings and diary, and the services they take; no customers, team, set-up, settings or money actions. The owner can pick another role in the invite. It counts as a seat, because it books. On booking detail they still see that booking's price and paid status, as a Member does (DEC-039: the price is part of the booking).
- Consequences: a built-in, editable `calendar-only` role; own-diary scoping on bookings, calendar, waitlist, Home and alerts; one seat per person whether on the diary, invited or joined.

## DEC-112 One page per person, with tabs

**Status: Accepted — 2026-10-08** · owner · #869 (UX-050)

- Decision: a person has one page, `/contacts/<id>`, with tabs for leads, enquiries, orders, bookings, packs, courses, subscriptions, invoices, reviews, messages and notes. `/customers/<id>` redirects to it. Each tab follows its module, plan and permissions; amounts follow money permissions (DEC-098). The delete confirmation lists what deleting ends, and unpaid invoices keep Record payment on the page. DEC-097 (merge suggestions, never automatic) and DEC-049 stand.

## DEC-113 One word for each thing a merchant sees

**Status: Accepted — 2026-10-09** · owner · #874 (UX-078)

- Decision: **booking** (not appointment or reservation), **Move** (not Reschedule), **Booked** for a confirmed booking and **To confirm** for a pending one, payment methods **Cash, UPI, Card, Bank transfer, Other** ("at the counter" only as a hint), **Closed** (not Shut), and "Location" or "Locations" following the count everywhere. Classes vs credits is not decided yet.
- Consequences: the list lives in `docs/patterns/saroh-product.md`; code identifiers, routes and stored values keep their names.

Also decided 9 Oct (#886): each admin console deploys only its own environment; see DEC-107.

## DEC-114 A move to a lower plan pauses what's over its limits, 7 days after we say what

**Status: Accepted — 2026-10-09** · owner · #800 #801 #802 · matches the Terms' "Moving to a lower plan"

- Context: the published Terms promise that on a move to a lower plan, what's over the new plan's limits becomes read-only, with an email 7 days before, nothing deleted, and moving back up restoring everything at once. Before this, nothing paused; only adding more was refused.
- Decision:
    - What's over the limits is worked out from the plan the business reads now and a fixed order; nothing is stored per item. Team (seats as DEC-105 and DEC-111 count them, view-only people against their own limit; since DEC-155 everyone counts against the one team limit): the owner always stays, then the earliest to join, then open invitations. Products and posts: the newest stay. Locations (SHOP storefronts, DEC-109) and websites (DEC-094): the first made stay.
    - Paused people can't open the business, and take no new bookings (diary people with no login and paused members' own diary rows). Paused products and posts are hidden from the site and read-only. A paused location stops taking orders; a paused website stops orders, bookings, class packs and plans sold online. Invoices, orders, customers and payment records are never touched, and bookings already made are kept.
    - **The pause waits 7 days after a notice (owner, 9 Oct).** Moves known ahead (an offer's end, a term's end, a chosen move) are told at 30, 7 and 1 days; moves that happen at once (a failed payment the provider gave up on, cancelling now, an operator change) are told within the hour and pause 7 days later. The billing moves themselves are unchanged.
    - **Locations and bookings (owner, 9 Oct):** bookings belong to the business, not a location, so a paused location stops orders and a paused website stops bookings; the Terms stand as written.
    - Moving back up restores everything at once. Behind `PLAN_ENFORCEMENT`; nothing pauses with it off or off the catalogue, and a failed read pauses nothing.
- Consequences: one stored clock, a `CustomerNotice` of kind `MOVE_DOWN` per set of limits told; `Membership.createdAt` added (migration `20261101100000_membership_joined_at`, backfilled from the accepted invitation). The admin limit-override warning says what will pause and when (#802). When `PLAN_ENFORCEMENT` turns on, every business already over its limits is told at once and pauses 7 days later. `docs/patterns/backend-billing-and-classes.md` → "Moving to a lower plan".

## DEC-115 Every error page is drawn by the apps, not by Cloudflare

**Status: Accepted — 2026-10-09** · owner

- Context: the owner asked for every error page to be custom (404, 5xx). Our zones are on Cloudflare's Free plan, where Cloudflare's own edge error pages can't be replaced.
- Decision: stay on the Free plan. Every error page comes from the Next.js apps: `not-found.tsx` (`@saroh/ui/not-found`), `error.tsx` (`@saroh/ui/error-page`), and `global-error.tsx` (`@saroh/ui/crash-page`, self-styled because the root layout's CSS is gone). Each Worker's entry (`worker.ts`) wraps OpenNext's handler in `withCrashPage`, so an exception before Next renders returns the same page as static HTML with a 500. Merchant sites (`saroh.app`) use their `--site-*` palette, and the neutral, unbranded page where the palette is unknown.
- Consequences: what the apps can't draw stays Cloudflare's: a Worker stopped for CPU or memory, an error after a streamed response has started, and edge errors when a host can't be reached (502, 521, 522, …, including api.saroh.in seen directly). A page whose API read fails still renders our own error page, because the Worker, not the visitor, calls the API.

## DEC-116 A refund recorded by hand can be any amount up to what is left

**Status: Accepted — 2026-10-09** · owner · #865 (UX-061)

- Context: "Record as refunded" only recorded the full amount, so a business that gave part of the money back outside Saroh (one item, a goodwill amount) couldn't record it. Line refunds cover only online payments.
- Decision: "Record as refunded" offers **Full amount** (the default) or **Another amount**. Another amount is any amount above zero up to what is left unrefunded on the order: what it was paid less every refund already made, online ones and line refunds included, and earlier refunds by hand. Not limited to whole lines.
- A part refund issues a credit note for that amount, spread over the invoice's lines as any credit note that names no line is. It adds a "What happened" step with the amount and how it went back. The money panel shows refunded so far and what is left. Home's "taken", Spent and takings read it net. The order stays **Paid** (partly refunded) and becomes **Refunded** only when the whole amount has gone back. No new payment status.
- Consequences: `Order.refundedByHand` keeps what was handed back by hand (migration `20261103100000_order_refunded_by_hand`). Insights' `order.refunded` is still written only for a full refund, since that figure is net of full refunds by design (#867). An online refund, by line or another amount, is capped at what is left on the order with refunds by hand counted, so money handed back by hand is never sent back again online. `docs/patterns/backend-billing-and-classes.md` → "Orders and the shelf".

## DEC-117 The website checkout applies a location's "Free delivery over"

**Status: Accepted — 2026-10-09** · owner

- Context: each location saved a "Free delivery over" amount (`StoreSettings.freeShippingThreshold`), but nothing read it: the website checkout added the Local delivery or Shipping fee whatever the order came to.
- Decision: on the website checkout, when the items come to the amount or more, Local delivery and Shipping add nothing. "The items" is the bag's Subtotal less any code, before delivery: what the customer sees above the delivery row. Prices already include GST (ADR-008), so no tax sits between them. Pick-up never has a fee. No amount (or 0) means the fee is always charged. Integer minor units throughout (`checkout-quote.ts` `deliveryCents`).
- The quote carries `freeDelivery` (`over`, and `short` while under it), and the bag says "Add ₹X more for free delivery." under the delivery row, or that delivery is free once reached. The order records the delivery the quote showed (`Order.shipping` 0), so the confirmation, order detail and invoice read it as free.
- Consequences: the counter's New order still fills the way's flat fee for staff to keep or change; it doesn't apply the amount.
- Cancel after a refund by hand (#918, 2026-10-09): "Cancel order…" refunds what is left on the order, not every line in full. Paid online, that amount goes back to the provider, capped as below and split across the payments as another amount is; with nothing left it hands nothing back and just cancels. Paid by hand, the counter gives back what is left. Credit notes cover only what is refunded now. The cancel dialog says how much goes back and how ("₹100 has already been refunded, so the ₹380 left goes back to Razorpay, in 3–5 days."). Part by hand and the rest online makes the order **Refunded** once nothing is left.
- Consequences: `Order.refundedByHand` keeps what was handed back by hand (migration `20261103100000_order_refunded_by_hand`). Insights' `order.refunded` is still written only for a full refund, since that figure is net of full refunds by design (#867). An online refund, by line or another amount, is capped at what is left on the order with refunds by hand counted, so money handed back by hand is never sent back again online; a cancel works that amount out itself (`onlineRefundableInTx`). `docs/patterns/backend-billing-and-classes.md` → "Orders and the shelf".

## DEC-118 A QR code holds a short link on the Saroh address, and counts scans without a cookie

**Status: Accepted — 2026-10-10** · owner

- Context: a merchant prints a QR once and it stays on a counter, a card or a bag for years. The page it points at changes, a custom domain can lapse, and the merchant wants to know whether the paper works.
- Decision: a saved code holds a short link on the business's Saroh address, `<address>.saroh.app/q/<code>`, never the custom domain: the Saroh address forwards after a change (DEC-069) and can't lapse. Where it points can be changed later without reprinting. A retired code forwards to the site's home page, since paper outlives the row; a code with scans is retired, never deleted.
- Two kinds. A _saved code_ (a row, a short link, a scan count) for pages that stay: the site, the shop, the booking page, a product, a service, any page. An _instant QR_ (drawn in the browser, nothing saved, not counted) for a link that belongs to one record, such as a pay link.
- Counting: the site's `/q/<code>` handler asks the API to resolve and count, and the API takes that call only with the relay signature. One row per code per day (`QrScanDay`); link-preview fetchers are skipped. No cookie and no stored visitor detail, so DEC-108's "no banner needed" still holds. A failure to count never stops the visitor: they are forwarded anyway.
- Bookings and orders: the redirect lands with `?src=qr-<code>` and a booking or order made from that page keeps it (`sourceCode`). It rides the URL only, so a visitor who goes to another page first is not counted, and the column says so.
- Drawing: one renderer in `packages/ui` (`qr-art.ts`) for the workspace and the free tool on saroh.in. Where the design and a code that scans disagree, the code that scans wins: a branded code keeps its alignment pattern as a small eye, a logo needs version 3 or more, and a colour too light to scan is warned about or not offered.
- Access: `site:read` / `site:update` (DEC-039, no new staff permissions). A plain code is in every plan; branding, print files and scan counts sit behind one catalogue row (`qr-branding`), refused in the usual `MODULE_LOCKED` shape.
- The free tool (`/tools/qr-code-maker`) saves nothing: it draws in the browser. Its email unlocks the download and is Saroh's own words with a link back; it never attaches a file made from a stranger's link.
- Consequences: `/q` is a reserved path on every merchant address. The UPI QR on invoices is unchanged. Scans are not yet a dimension in Insights.

## DEC-119 What isn't built yet is listed with a period, not a date

**Status: Accepted — 2026-10-10** · owner

- Context: early access opens on 17 Oct and the public pages should say what is coming, without promising a day.
- Decision: no separate roadmap page. The changelog has a "Coming next" list and `/integrations` lists what is planned, both from one source (`apps/saroh.in/content/coming.ts`). Each row carries "Not available yet" and sits under a period: the nearest as months ("Nov–Dec 2026"), the next as "Early 2027", the rest as "Later". Never a day.
- Every row is a "Planned" line in the claims ledger (`docs/architecture/MARKETING_CLAIMS.md`); when it ships it moves to the dated changelog entry and its ledger status changes in the same batch.

## DEC-120 A business scheduled for deletion winds down, and an owner can download its data

**Status: Accepted — 2026-10-09** · owner · follows #921 (DEC-021) and #117 (DEC-057)

- Context: during the deletion window (`PENDING_DELETION`) every workspace write was refused, so a business could not hand over an order already paid for, mark a booking attended or refund a customer from Saroh, and had no way to take its records with it. Store-scoped routes (`stores/:storeId/…`: New order, products, storefront invites) ran no lifecycle check at all, for a suspended business too.
- Decision 1, **no new business**: refused in the window are new orders (New order, the counter's sale, the site's checkout paid online or at the handover), new bookings (by hand, the booking page, the customer's account), new memberships, plan joins, pack sales and course enrolments, creating or editing products, services, plans, packs, courses and site content, invitations, settings and connecting or disconnecting providers. **The site stays up and says what a paused site says** (#800): "This business isn't taking orders right now." / "This business isn't taking bookings online right now." A customer is never told the business is closing, suspended or being deleted: public refusals name no state.
- Decision 2, **finish existing work**: allowed in the window are an existing order's kitchen steps (one or a batch, and Undo), Ready and handover, a change of fulfilment, a payment recorded by hand, a pay link or workspace payment for an order or invoice already made, and the customer paying it; an existing booking's outcome, desk payment, pay link and paying with a class already bought; cancelling an order, booking, membership, autopay mandate, pending plan change or course enrolment; voiding, crediting, sending and reminding an invoice already issued; refunds recorded by hand, and online refunds, their retry and a wrong-amount capture's refund. Customers can still sign in to their account and cancel. **Refused on purpose:** editing an order's items (it can add a sale), moving a booking and booking a treatment's next visit (each takes a new slot; cancel instead), pausing, resuming, skipping and `keep` on a membership, and retrying a charge (billing is refused in the window, DEC-021). Role permissions are unchanged: the lifecycle only decides which routes are open.
- Decision 3, **online refunds need the keys**: a refund is sent online only while the business's payment provider is connected. With no provider connected and customers who paid online, Order Detail doesn't offer Refund ("Refund it in your provider's dashboard, then record it as refunded.") and the closing banner says the same. Disconnecting a provider is refused in the window, so keys present at its start stay until the clean-up.
- Decision 4, **Download your data**: an owner (by role; no new permission before the matrix review, DEC-039) asks from Settings › Your data at any time, and from the closing banner in the window. A background job builds one zip: a CSV per table (customers, location customers, orders and their lines, invoices and credit notes and their lines, payments, refunds, bookings, services, products, variants, stock, locations, membership plans and memberships, class packs and purchases, courses and enrolments, leads, enquiries), `media.csv` and the uploaded files under `media/` up to 2 GiB (the rest listed as left out), and a README. It is stored through the `ObjectStorage` port; Saroh emails the owner a signed link that works for 24 hours (Saroh to its own user, DEC-011 as amended, sent as DEC-085 has it), and the workspace makes a fresh 15-minute link until the file is deleted, 7 days after it was ready. One at a time per business; asking and every link made are on the business's audit trail. Hashes, tokens and keys are left out; text a spreadsheet would run as a formula is kept as text.
- How: the lifecycle table's `activity` gains `wind-down` (`organization-lifecycle.policy.ts`), and every write route has a class, `new` unless it carries `@LifecycleWrite("wind-down" | "takeout")`. `OrganizationGuard` asks it, and `StoreLifecycleGuard` now asks the same on store-scoped routes. `organizations/lifecycle-wind-down.spec.ts` names every write route of the order, booking, payment, invoice, membership, class pack and course controllers as wind-down or refused, and fails on one in neither list. The site's shop, booking page, packs and plans read the lifecycle where they read a plan pause (`orders/checkout-paused.ts`).
- Consequences: suspension is as before (no workspace writes), except that store-scoped writes are now refused too and an owner can still download the data. The site's refusals for a suspended business change words (the paused ones) but not effect. A deleted business (`DELETED_RETAINED`) can't ask for an export: its members can't open it, so the data is taken in the window. A zip past its 7 days is deleted even after the business is (the clean-up never cancels `data-export.expire`). Not built: the workspace doesn't yet hide or disable New order and the other refused actions in the window; the API refuses them in words. The export runs on the job worker, which works one job at a time, so a large export delays other jobs on that worker while it runs.
- Migration: `20261105110000_data_exports` (`DataExport`, with RLS and one QUEUED or RUNNING per business). New dependency `fflate` in the API (the zip).

## DEC-121 The business is responsible for its sales, and customers can report one

**Status: Accepted — 2026-10-09** · owner · Terms rev 46

- Context: a customer who buys from a merchant's site may take Saroh for the seller. The Terms didn't say whose sale it is, when an account can be stopped at once, or what "no limit" on a plan means.
- Decision:
    - The Terms (verbatim from the owner's doc, rev 46; `apps/saroh.in/content/terms.ts`, "Last updated" 9 Oct) gain "Your customers and your business", suspending or closing an account at once for illegal use, fraud or harm to customers, "Fair use", and a line in "Liability" on businesses' goods and disputes.
    - Every published merchant site says "‹Business› runs this website and is responsible for its orders and bookings." in its footer, on every plan, in the site's own tokens, with a small "Report this business" link to `saroh.in/customers?site=<host>`. The order and booking confirmations carry the same line without the link.
    - `saroh.in/customers` tells a customer who to contact and takes a report (the site's address, what happened, an optional email). The answer never says whether the address is a Saroh site.
    - Reports reach the admin console's Reports list. Reading needs `organization:read`; the reporter's email shows only with `organization:pii:read`; marking a report done needs `organization:lifecycle:write`, the permission a suspension needs, and is audited. No new staff permission (DEC-039). Nothing is emailed yet.
- Consequences: `BusinessReport` (migration `20261105100000_business_reports`), kept when the business is deleted (`organizationId` set null). `POST /public/business-reports` is rate-limited per visitor and refused on a test release. Only Platform Owners hold `organization:lifecycle:write` today, so only they can mark a report done.
- Amended 2026-10-10 (owner):
    - **A "Sold by" block in the business's own details replaces Saroh's sentence.** Paid storefront builders (Shopify, Wix, Squarespace) put nothing of their own on a merchant's site and take reports on their own site; only free or high-risk surfaces carry a report link. So a published site's footer says "Sold by ‹legal name›" (`BusinessProfile.legalName`, else the site's name), then the registered address as invoices print it and the contact email and public phone, each only if set, on every plan and in the site's `--site-*` tokens. With nothing else set it says just "Sold by ‹name›". A site whose shop doesn't serve (bookings only, a portfolio) says "Run by". The order and booking confirmations carry the one line. The GSTIN is never sent to the site.
    - **"Report" is on Free sites only**, a small link beside "Made with Saroh" under the credit's own condition (DEC-102), to `saroh.in/customers?site=<host>`. A paid site carries no Saroh link at all. saroh.in's own footer links to `/customers` ("Bought from a business on Saroh?") so a paid site's customer can still find it.
    - **Settings › Business asks for the details** ("Add your business's legal name, address and a contact", under Make it yours) while a business with a published website lacks a legal name, a registered address, or a contact (an email or the website's phone).
    - **Support marks reports done.** A new staff permission, `reports:resolve`, held by Platform Owners and Support, replaces `organization:lifecycle:write` on "Mark done": closing a report changes nothing for the business, and Support takes the reports. This reverses "No new staff permission" above; nothing Support already held fitted.
    - The Terms' text is unchanged.
- Amended 2026-10-11 (owner): the reporter's email is no longer optional, and a mobile number is asked for with it. DEC-138.

## DEC-122 Legal hold, and 180 days' retention after deletion

**Status: Accepted — 2026-10-10** · owner · follows DEC-021 (as amended), DEC-120, DEC-121 and the Terms and Privacy Policy of 10 Oct

- Context: the published Terms and Privacy Policy now promise three things the product didn't do. (i) An account found doing something the law prohibits is suspended at once and its data kept "for as long as the law requires, or while it's needed to prevent, detect or investigate an offence… even if deletion was requested": nothing stopped such a business's deletion, and its files went the day its window ended. (ii) "Access ends at once. We keep the account's data for 180 days, as Indian law requires, then remove it from live systems": the clean-up deleted the files on day one, nothing ever removed the personal data, and the policy had said 30 days. (iii) Security logs are kept one year: the policy had said 90 days and nothing pruned them at all.
- Decision 1, **legal hold**: a hold on a business (`Organization.legalHoldAt`, `legalHoldReason`, `legalHoldByUserId`), placed by an operator when suspending ("Suspended for activity the law prohibits — keep its data", the suspension's reason is the hold's) or on a business already suspended, scheduled for deletion or deleted, with `organization:lifecycle:write`. **Only a Platform Owner lifts it**, with a reason, through a new staff permission `organization:legal-hold:lift` that no other role carries. Both write the admin ledger with the reason and the business's own history without it (`organization.legal_hold.placed` / `.lifted`): its people see that a hold exists, never why. A hold is not a lifecycle state; what it allows per state is `LEGAL_HOLD_DECISIONS` in `organization-lifecycle.policy.ts`. While held:
    - scheduling its deletion is refused, and so is reinstating it — a held business is never active, so its workspace takes no write that could delete a record (an active business is suspended with the hold, never held as it is);
    - the deletion sweep leaves it `PENDING_DELETION` past its window, fenced on the hold in the write;
    - the deletion clean-up removes nothing: a run that finds it held stands aside whole and ends without failing, a hold placed mid-run stops every destructive step (pending jobs, hostnames, keys), and lifting the hold queues the clean-up again;
    - the retention eraser leaves it, and checks under the business's row lock in every write;
    - a customer's privacy removal is refused in the preview and on Remove, each writing `customer.removal.refused` (DENIED, the contact's id, the reason as a code) to the business's history;
    - "Download your data" is refused, asking and linking ("This business's data is on hold. Write to contact@saroh.in."), each refusal on the business's history as DENIED;
    - the analytics retention sweep and the security log sweep leave its rows (and its members' sign-in sessions).
- Decision 2, **180 days after deletion**: when the window ends the clean-up shuts access off and deletes only secrets. `organization.retention.erase`, a daily self-rescheduling job, erases a deleted business `RETENTION_AFTER_DELETION_DAYS` (180, `organizations/retention.ts`; the environment may lengthen it, never shorten it) after `deletedRetainedAt`, then stamps `Organization.retentionErasedAt`. It waits while a customer is still owed a refund, as the clean-up's key deletion does.
    - **Erased**: every uploaded file (storage object, then its row); class waitlist entries; every customer by the privacy removal's own rules (DEC-042: name, email, phone, company, address, notes, needs-attention, consents, message thread, site account, sessions, sign-in codes, autopay's display hint); storefront customers no contact reached; on every order the delivery name, phone, street, city, postcode, the note and a walk-in's name and phone; every booking's booker and intake note; every message's recipient, subject and body and each delivery's provider error; review invitations' address and every review's name and words; the CRM (form entries' values and hashed address, lead titles, lead activity text); the team's inbox notices, invitations and diary names; detailed analytics events.
    - **Kept**: invoices and credit notes as printed, orders with their lines, amounts and place of supply, payments and refunds, Saroh's own invoices to the business (ADR-008, eight years); bookings' time, service and price, memberships, packs and enrolments; products, services and the site's pages; the business's own name, address and GSTIN; memberships (ids); both audit trails; the daily analytics rollups.
    - It follows the privacy removal's split, with two differences because the whole business is gone: what no single removal reaches is erased too, and the CRM records DEC-041 leaves to the business are scrubbed. `admin/retention-erase-plan.ts` is the list, and a spec holds it to the removal's two registries.
- Decision 3, **security logs one year**: `SECURITY_LOG_RETENTION_DAYS` (365) in the same file. Nothing pruned before; `security-logs.retention`, a daily self-rescheduling job, now deletes sign-in sessions (`Session`: address, browser, sign-in time) and customers' site sessions a year after they ended, sign-in codes and the older store logs (`AuditLog`, `SecretAccessLog`) a year after they were made. The two audit trails (`AuditEvent`, `AdminAuditEvent`) and support-access sessions are records, not logs, and are never pruned. The "errors" the policy names are the API's own log on its host and Cloudflare's logs: their retention is set on the host and in the Cloudflare account, outside this repository.
- How: every job that deletes reads the hold through `organizations/legal-hold.ts`. `organizations/legal-hold.deletes.spec.ts` scans the source for jobs that delete and fails on one that is neither hold-aware nor declared not a business's data, and on a file a hold-aware job hands its deleting to without saying how the hold reaches it.
- Consequences: a business deleted before this ships already lost its files on day one; its personal data is erased 180 days after its `deletedRetainedAt` like any other. Lifting a hold on a deleted business past its 180 days lets the next daily run erase it. The console shows "Legal hold" on the directory (with a filter) and at the top of the business page with who, when and why, and "Data kept until ‹date›" on the deletion trail. Not built: backups are outside the eraser (the Privacy Policy's roll-off covers them); a held business's export zip made before the hold is still deleted on its 7th day (a copy; the records stay); a removal attempt on a suspended business is usually refused by the workspace's lifecycle gate before the service, so the recorded refusal comes from the preview the dialog reads.
- Migration: `20261106100000_legal_hold_retention` (four nullable columns on `Organization`, `Session_expiresAt_idx`, and one-waiting-run indexes for the two chains). New optional env `RETENTION_AFTER_DELETION_DAYS`.

## DEC-123 A location uses the business logo unless it has its own

**Status: Accepted — 2026-10-10** · owner

- Context: a location's "Description and logo" sheet asked for a "Logo address", a web link to type. The business already uploads its logo in Settings › Business, and the owner asked that a location use it, that a logo be uploaded rather than linked, and that the task finish inside the sheet.
- Decision: a location with no logo of its own shows the business logo, and says so ("Using your business logo"). It can have its own, uploaded in the same sheet (PNG, JPG or WebP, 1 MB at most, the business logo's rule); "Use your business logo" goes back. The typed web link is gone.
- Data: `Store.logoMediaId` beside `Store.logo`, the business logo's shape (a library object and the address it is served from, taken when set). Both null is "use the business's". A location that already held a typed address keeps it as its own logo, with no library object, until it is replaced or given up.
- API: `PUT /stores/:id` takes `logoMediaId` (an image in the location's own business's library, or `null` for the business logo; left out, the logo stays). One route, not a pair like the business logo's, because the sheet saves the description and the logo with one Save. `GET /stores/:id` returns `ownLogo`, `businessLogo` and `effectiveLogo` (own, else the business's, else none). The old `logo` address field is still accepted from an older app, but a new address is refused. The library won't delete an image while a location uses it.
- Access is unchanged: whoever may edit the location may change its logo.
- Consequences: nothing reads a location's logo yet beyond its own row and sheet. Invoices, receipts and QR codes keep the business logo (DEC-082). Where a location's logo should appear (the pick-up line of a checkout, a location's page) is still to decide.

## DEC-124 A site's icon: its own, else the business logo, else a plain initial; never Saroh's mark

**Status: Accepted — 2026-10-10** · owner

- Context: every merchant site served one fixed `favicon.ico` from the renderer (`apps/saroh.app/app/favicon.ico`, the framework's default mark), and there was no setting. A merchant's site never carries Saroh's brand, or anyone else's.
- Decision: a site shows its own icon when the merchant uploaded one; else the business logo from Settings › Business; else a plain tile with the site's initial in the site's accent colour. The renderer ships no icon file of its own.
- The site's own icon is set in Website › Settings › Search and sharing, in the row's sheet: PNG, JPG or WebP (no SVG, as the storage allowlist), under 1 MB, as the business logo. "At least 192 × 192; square works best" is guidance, not a refusal. `site:update`; no plan lock.
- It is part of the draft, like the share image ("Next publish"): saved on the Site (`iconMediaId`, `iconUrl`, the logo's shape), written into the Publication snapshot at publish (`site.icon`, only when there is one) and counted in what waits for the next publish. The logo that stands in is the business's, read live, and applies at once.
- The public site read resolves the icon (own, else logo, else none) and sends it with the snapshot, so the renderer asks nothing more. Every page's head names it, for the tab and as the phone's touch icon. `/favicon.ico` on a merchant's address forwards to it (302). With neither, the site serves the tile itself at `/site-icon.svg`, and `/favicon.ico` answers with it. A draft preview and a test release show theirs.
- No image pipeline: an uploaded image is served as it is, from the media address, with its type declared. The tile is an SVG drawn by one function (`@saroh/site-blocks/site-icon`) that the site serves and the workspace previews, so no font or image library is added; a phone gets no touch icon for it and draws its own.
- Consequences: migration `20261108100000_site_icon`. The library refuses to delete an image while it is a site's icon. Setting or removing the business logo tells the page cache (`site.pages.revalidate`, cause `icon`), since a kept page carries the old one. `docs/patterns/frontend-design-system.md` → "Type and the mark".

## DEC-125 PostHog for errors and workspace milestones; never on merchant sites; replay in the workspace (interface readable, business data masked) and on saroh.in (behind consent)

**Status: Accepted — 2026-10-10; Decision 8 amended the same day (Decision 9); Decision 7's "no pageviews" superseded by DEC-160 (2026-10-14), nothing else** · owner · chooses the tracker #103 left open; see [ERROR_TRACKING_AND_UPTIME.md](./ERROR_TRACKING_AND_UPTIME.md)

- Context: #103 built a vendor-neutral `reportError` seam in the API and in every frontend boundary and stopped at the choice of tracker. Nothing left the process, so an error was seen only by whoever read a log, and nobody could say how many businesses finish setting up. The owner chose PostHog's free plan, one project for development and production.
- Options: Sentry's free plan (one seat); GlitchTip on the API's host (one more service to run); Better Stack; PostHog (errors, product events and session replay in one, EU hosting).
- Decision 1, **errors everywhere, through the seam**: the API (every 5xx from `AllExceptionsFilter`, and a job that failed its last attempt) with the correlation id, the route's template, the organization id and the job's type; the workspace, accounts, the admin console and saroh.in from the browser (every error boundary and the window's uncaught errors) and from the server (Next's `onRequestError` and each Worker's crash wrapper). Never a request or response body, a header, a cookie, a query string or the address asked for.
- Decision 2, **everything is a no-op without a key**: no SDK is loaded, no client is made and no request is sent until the project's public key is set (`POSTHOG_KEY` on the API and the merchant sites' server, `NEXT_PUBLIC_POSTHOG_KEY` on the four apps). The key is the one browsers get, so it is a setting, not a secret. Every event carries `environment` (`development` | `production`) and `app` (`api` | `application` | `auth` | `admin` | `web` | `sites`). The dev API also runs with `NODE_ENV=production`, so the API takes its environment from `POSTHOG_ENVIRONMENT` and sends nothing with a key and no environment.
- Decision 3, **merchant sites are server-side only**: a site's visitors are the merchant's customers, whose data Saroh processes only for the merchant. No PostHog script, SDK, key or request ever comes from a page a visitor loads. The site's own server reports an exception it threw, with the site's host and the route's template and nothing about the visitor. `pnpm run check:merchant-site-tracking` (prepush and CI) fails on a PostHog SDK, address or public key name anywhere under `apps/saroh.app` or `packages/site-blocks`. The merchant's own tracker on their own site (#889) is theirs and is unchanged.
- Decision 4, **nine workspace milestones, sent by the API where the fact is written**: `signed_up`, `onboarding_finished`, `first_product_added`, `first_service_added`, `site_published`, `first_order_taken`, `first_booking_taken`, `payment_provider_connected`, `plan_upgraded`. Each once per business: the activation ledger (`ActivationEvents`, #176) stores each once, and a milestone is sent only when its row was stored, never on a repeat. The id is the organization's (the user's for `signed_up`); the properties are the plan's key, the business's kind and the environment. Never a name, an email, a phone number, an address, an amount or anything about a customer. Sent from the SDK's in-memory queue in the background, so PostHog being slow or down never slows or fails a request. No browser script takes part, so they can't be faked or blocked.
- Decision 5, **one scrubber** (`@saroh/error-tracking`), applied to every exception before it is sent, by the API, the Workers and the browser alike: emails, phone and other long numbers, bearer and basic credentials, JWTs, keys with a provider's prefix, long mixed tokens, values beside a sensitive name, `Authorization`/`Cookie` header lines and query strings are masked; addresses are reduced to route templates; a person is an internal id.
- Decision 6, **limits, so one bug can't spend the month**: 10 exceptions a minute and 100 an hour per server process; in the browser the same error once per page load and 20 different ones at most (`packages/error-tracking/src/names.ts`). Past a cap an error is still logged.
- Decision 7, **the browser SDK does nothing else**: no autocapture, no pageviews, no feature flags, no surveys, no heatmaps, no cookies or storage (`persistence: "memory"`), no script fetched from PostHog, and `before_send` drops every event that is not an exception. No `identify()` with personal data.
- Decision 8, **session replay: the workspace only, masked, opt-out, off by default** (owner, same day; replaces "no session replay" for the workspace alone). Only `app.saroh.in`'s signed-in shell; never accounts (sign-in, sign-up, passwords), the admin console, saroh.in or a merchant site. It records only when all of these hold: `NEXT_PUBLIC_POSTHOG_REPLAY` is `on` for the environment (default off); the person has not opted out; their browser sends neither Do Not Track nor Global Privacy Control. Every character of text and every input is masked, pictures, media, canvases, frames and anything marked `data-ph-block` are left out, and no network request, response or console line is recorded. One session in five is recorded (`REPLAY_SAMPLE_RATE`; the free plan keeps 5,000 a month). A recording is tied to the internal user id and organization id only. **The choice** is "Help improve Saroh: share how I use the workspace (text and numbers are hidden)" in Settings › Your profile, shown only where recording is on, on unless turned off, kept on the person's user row (`User.sharesUsage`) so it holds on every device, read before the recorder starts, and turning it off stops the recorder at once.
- Decision 9, **amended 2026-10-10 (owner): replay on the marketing site behind consent, the workspace's interface readable, a first-run notice, every session, production only.** The owner wants to see how people use the marketing site and the workspace, and whether they understand them; a recording of stars over every word shows neither. This replaces Decision 8's "workspace only", "every character masked" and "one session in five"; the rest of Decision 8 stands.
    - **saroh.in is recorded, behind the cookie notice.** The page's text and pictures are visible (they are Saroh's own public content); every input is masked, and so is anything a page marks as showing back what a visitor typed (`data-ph-mask`). No network request, response or console line. It starts only after the visitor accepts the cookie notice, which now says that accepting records how the site is used; it is the same answer Google Analytics waits for, taking it back stops the recorder at once, and an "Accept" given to the older notice (Analytics alone) is asked again rather than stretched to cover it. Never in a Saroh team browser (`saroh_team=1`), never with Do Not Track or Global Privacy Control, never on a pricing draft preview. Nobody is identified, no person profile is made, and nothing is stored in the browser (`persistence: "memory"`). The SDK sends two things: one read of the project's settings when it starts, and the recording; `before_send` drops every other event, so there are no pageviews and no clicks. Its own switch: `NEXT_PUBLIC_POSTHOG_REPLAY` in saroh.in's `vars`.
    - **One consent model with DEC-127 (owner, 2026-10-10, the day both were merged).** The cookie notice asks about two things. _Understanding the site_ is Google Analytics' visit counts and this recording, one answer for both; _advertising_ (Google Ads, the Meta Pixel) is its own, and accepting it records nothing. The answers are kept as `saroh-analytics-consent` and `saroh-ads-consent`, with what an accept covered beside the first (`saroh-analytics-consent-scope`: `analytics`, `analytics+recording`, `analytics-only`). This replaces "is asked again rather than stretched" above in one respect: an accept given to the older notice, or where recording was off, is still never stretched, but it is not thrown away either. Google Analytics carries on as agreed, nothing is recorded, and the notice asks once about recording alone; "Refuse" there keeps the visit counts (`analytics-only`) and is not asked again. The recorder starts through `startRecording` (`apps/saroh.in/lib/tags.ts`) alone, and only after the page's address has been cut back to DEC-127's allow-list (Decision 4a), so a recording never shows `ref`, `invite`, `email` or `token` in an address; it is never started on the sign-up hand-off (`/welcome`). "Cookie choices" shows wherever recording is on, with or without an Analytics id. `app/site-replay.tsx` is gone: `app/site-tags.tsx` holds the notice and decides when.
    - **The workspace: Saroh's interface is readable, business data stays hidden.** Masked is still the default. What is unmasked is an explicit list: elements marked `data-ph-unmask`, which the shared components carry themselves (buttons, field labels, help text, form errors, column names, tabs, fixed page titles, empty and failed states, the navigation, banners, the notice). `data-ph-mask` always wins, above or below an unmask, and the data-bearing components carry it (table cells, list rows, avatars, stat figures). A page title that is a record's name is masked (`PageHeader holdsData`). Digits and emails are hidden even in readable words. Inputs are always masked; pictures, media, canvases, charts and frames are left out as before. Mechanism: posthog-js's `maskTextSelector: "*"` with `maskTextFn`, its documented way to unmask selectively. A test reads every screen and fails where a readable component is handed something that looks like a record's data without saying which it is. **Left masked for now**, because they are computed far more often than fixed: toasts, and a dialog's or sheet's title and description.
    - **Setup is readable in full** (inputs aside): the goal picker after a business is set up, and Home's first-run states. The first setup step (naming the business, before there is one) is not recorded yet: a person's choice and the notice are read through a business.
    - **A notice first.** The first time a signed-in person opens the workspace where replay is on, a dismissible notice above the page says: "We record how Saroh is used to make it easier. Your customers' details and anything you type are hidden. Turn it off in Settings › Your profile." The recorder does not start until that notice is on screen. The dismissal is kept on the person (`User.usageNoticeSeenAt`), so it shows once, on any device, in any business. "Help improve Saroh" stays as the way to turn it off, and now reads "Share how I use Saroh (your customers' details and anything you type are hidden)": "text and numbers are hidden" stopped being true.
    - **Every allowed session is recorded** (`REPLAY_SAMPLE_RATE` = 1). The free plan gives 5,000 recordings a month across both; `NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE` (0 to 1, optional) lowers the share for an environment without a code change.
    - **Production only**: `NEXT_PUBLIC_POSTHOG_REPLAY` is `on` in the production `vars` of the workspace and saroh.in, and `off` in development's.
    - **Still never**: merchant sites, accounts (sign-in, sign-up, passwords), the admin console. `pnpm run check:merchant-site-tracking` now fails when any app but those two names the recorder. The site editor, outside the shell, is not recorded either.
    - Migration: `20261108120000_user_usage_notice_seen` (one nullable column on `User`). New optional env: `NEXT_PUBLIC_POSTHOG_REPLAY` (saroh.in), `NEXT_PUBLIC_POSTHOG_REPLAY_SAMPLE` (workspace, saroh.in). Owner, outside the repo: the Privacy Policy's "What we collect" and "Cookies" must say so before the production deploy (`apps/saroh.in/content/privacy.ts`, the owner's text).
- Not decided here: source maps (a stack from a browser names the built files until they are uploaded, which needs a private key, `POSTHOG_PERSONAL_API_KEY`); the uptime monitor and log-based alerts (still open in #103); PostHog web analytics for saroh.in (Google Analytics stays).
- Owner actions outside the repo: create the project in PostHog's EU cloud; set the key and switch things on (ERROR_TRACKING_AND_UPTIME.md → Switching it on); in PostHog, discard client IP addresses, set replay retention to 30 days, set a minimum recording length, and turn "Record user sessions" on before `NEXT_PUBLIC_POSTHOG_REPLAY`; add PostHog and session recordings to the Privacy Policy on the day it is switched on.
- Consequences: `ERROR_TRACKING_DSN` is gone (it only ever logged a warning). The activation ledger gains four once-per-business types (`first.service.created`, `first.site.published`, `first.payment-provider.connected`, `first.plan.upgraded`); "first" for those is the first since 10 Oct 2026, so a business that had already published or connected records it the next time it does. `onboarding_finished` is the business being set up (the setup form's write): the goal picker after it writes nothing of its own to tell "finished" by. A ledger row expires after 400 days like any analytics row, so a business whose first order was over 400 days ago would send `first_order_taken` once more on its next one.
- Migration: `20261108110000_user_shares_usage` (one nullable column on `User`). New optional env: `POSTHOG_KEY`, `POSTHOG_HOST`, `POSTHOG_ENVIRONMENT` (API; the first two on the merchant sites' Worker too), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (workspace, accounts, admin, saroh.in), `NEXT_PUBLIC_POSTHOG_REPLAY` (workspace). New packages: `posthog-node` (API), `posthog-js` (the four apps, loaded only when there is something to send).
- Amended 2026-10-10: a server error inside Better Auth is reported too. Better Auth answers `/api/auth/*` itself, outside Nest, so `AllExceptionsFilter` never saw a failed sign-in, sign-up, password reset, email verification or session read. `@saroh/auth` takes `onServerError`, wired to Better Auth's `onAPIError.onError`, and the API passes `reportAuthServerError` (`common/auth/report-auth-error.ts`): the error, the status, the method, the route's shape (`/api/auth/reset-password/:token`) and the request id. Only a 5xx; a wrong password, an unverified email, a rate limit or a failed validation is an outcome and is never sent. Same scrubber, same caps.
- Amended 2026-10-11 (the merge with the workspace's wording pass): what a merchant reads calls the app "Saroh", never "the workspace" (saroh-product.md → One word each, `pnpm check:copy`). The notice, the choice, its two toasts and the card's paragraph say "how Saroh is used" and "how I use Saroh"; the card's semicolon became a full stop. Nothing else about them changed. Decision 8's older label is quoted above as it was.

## DEC-127 Ad conversions on saroh.in: Google Ads and Meta Pixel, consent-first, two conversions, nowhere else

**Status: Accepted — 2026-10-10** · owner · see [ADS_TRACKING.md](./ADS_TRACKING.md). (There is no DEC-126: the number was held for sign-up by emailed code, built on another branch the same day, which is DEC-129.)

- Context: Saroh will advertise its own business on Google Ads and on Instagram (Meta). Without a conversion, neither platform can tell an ad that brought a waitlist join from one that brought nothing. saroh.in already loads Google Analytics behind a cookie notice; nothing told an ad platform anything.
- Decision 1, **two tags, on saroh.in alone, each a no-op without its id**: Google Ads through Google's tag (`NEXT_PUBLIC_GOOGLE_ADS_ID`, with `NEXT_PUBLIC_GOOGLE_ADS_WAITLIST_LABEL` and `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL`) and the Meta Pixel (`NEXT_PUBLIC_META_PIXEL_ID`). Public ids, set in the production Worker's vars, read only where `VERCEL_ENV=production`. Unset, nothing of that platform's is loaded or sent. Google Analytics stays.
- Decision 2, **consent first, and advertising is its own answer**: no ad tag loads and no request goes to Google Ads or Meta until the visitor accepts advertising cookies in the notice. The notice says what they do and that Google and Meta are told of the visit, and offers "Accept all", "Visit counts only" and "Refuse", of equal weight. Someone who accepted visit counts before saroh.in advertised is asked once about advertising; someone who refused is not asked again. Google's tag runs in Consent Mode v2 (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage` default denied, granted only for what was accepted), for Google Analytics too. Taking the answer back ("Cookie choices") tells both tags consent is withdrawn, switches Google Analytics off for the page and deletes the cookies they set on saroh.in.
- Decision 2a, **one consent model with DEC-125's recording (owner, 2026-10-10, the day both were merged)**: the notice's two answers are _understanding the site_ (Google Analytics' visit counts and, where it is switched on, recording how the site is used: DEC-125, Decision 9) and _advertising_. Recording rides on the first answer, never on advertising. By what is switched on, the notice reads: visit counts alone, as it always has ("Accept", "Refuse"); visit counts and recording, DEC-125's sentence ("Accept", "Refuse"); visit counts and advertising, Decision 2's words ("Accept all", "Visit counts only", "Refuse"); all three, one notice: "saroh.in uses Google Analytics cookies to count visits and, if you accept, records how the site is used so we can make it clearer; what you type is never recorded. It also uses Google Ads and Meta cookies to see which of our ads work and to show Saroh's ads to people who've visited; they tell Google and Meta you were here. Refuse and the site works the same." ("Accept all", "Counts and recording only", "Refuse"). An ad platform is named only when its id is set. Someone who accepted visit counts before either was new is asked once about what is new, in one notice, and keeps what they agreed to whatever they answer. The address cut of Decision 4a now comes before the recorder starts as well as before a tag loads. Every case is in `question()` (`apps/saroh.in/app/site-tags.tsx`), with a test for each.
- Decision 3, **never the team, and a browser's own signal is a refusal**: `saroh_team=1` loads no tag, as for Google Analytics. Do Not Track and Global Privacy Control are read as a refusal of every optional cookie, Google Analytics included, and no notice is shown. That is new for Google Analytics, which until now ignored both.
- Decision 4, **two conversions, and only the fact**: `waitlist_joined` when the waitlist form's join is confirmed as a new entry (Google Ads conversion; Meta `Lead`), and `sign_up_completed` when a new account's email is verified (Google Ads conversion; Meta `CompleteRegistration`). No email, phone, name, business or anything typed is sent: no enhanced conversions, no advanced matching, and the Pixel's automatic reading of buttons and page metadata is off. A Google Analytics event now names Analytics as its destination, so none reaches the Ads account that shares the tag.
- Decision 4a (owner, same day), **no tag sees an address that is about someone else**: both tags report the page's address, and `?ref=` on the waitlist is another entrant's referral id. Before any tag loads, for Google Analytics, Google Ads and Meta alike, the address is cut back to one allow-list (`lib/page-address.ts`): `plan`, `src`, `template`, `utm_…` and the platforms' click ids (`gclid`, `gbraid`, `wbraid`, `fbclid`) stay; `ref`, `invite`, `email`, `token`, `next` and every parameter not on the list go. It is the page's own address that is cut (`history.replaceState`, before either script is added), because the Pixel takes no address from the site and reads the page's; every later address is cut as it is set, and each event sent to Google also names the cut address (`page_location`). The page reads first: what is cut is kept for the tab and read through `readAddress()`, so a referral still counts. Cost: once cookies are accepted the address bar no longer shows what was cut, so the link preview tool's `?url=` leaves it and a reload opens the tool empty.
- Decision 5, **a sign-up is counted on saroh.in, not on accounts**. Options: (a) load the two tags on accounts' verify page under "the same consent"; (b) send the newly verified account through a page on saroh.in. Chosen: (b), `www.saroh.in/welcome`. The visitor's answer lives in saroh.in's own storage, which accounts can't read; (a) would need that answer copied into a cookie on the parent domain, readable by every `*.saroh.in` app, and would put a third party's script on the page where a sign-in code is typed. With (b) accounts loads no tag and holds no ad id: when `NEXT_PUBLIC_SIGNUP_WELCOME_URL` is set it sends the browser to `/welcome` with where it is going and the time, and nothing about the person. `/welcome` cuts its address back before any tag loads, counts the sign-up only for a visitor who accepted advertising cookies and only for a visit accounts sent within ten minutes, once per browser, forwards only to accounts or the workspace, and never holds anyone longer than 2.5 seconds. Cost: one extra hop after sign-up, and a sign-up by someone who never answered saroh.in's notice, or who used a social sign-in button, isn't counted.
- Decision 6, **nowhere else, checked**: no ad tag, ad id or ad host in the workspace, the console, accounts, a merchant's site or the blocks sites are built from. `pnpm run check:merchant-site-tracking` (prepush and CI) fails on any. A merchant's OWN trackers on their own site (#889) are theirs and stay allowed, by file.
- Not decided here: the server-side Conversions API and offline conversion uploads (both need a secret and personal data); remarketing audiences beyond what the platforms build from the tags; counting social sign-ups; advertising cookies on Help's own host.
- Owner actions outside the repo: create the two conversion actions in Google Ads and the dataset in Meta Events Manager, with enhanced conversions and automatic advanced matching left off; add Google Ads and Meta to the Privacy Policy ("What we collect", "Who we share it with", "Cookies") before the ids go live; then follow ADS_TRACKING.md → Turning ads tracking on, saroh.in first and accounts second.
- Consequences: the cookie notice has three buttons where an ad id is set (two otherwise, as before). `app/google-analytics.tsx` is `app/site-tags.tsx`, and the tags are loaded by `lib/tags.ts` rather than inline scripts. Security headers are unchanged: the Content-Security-Policy sets `frame-ancestors` only, so there are no hosts to add. New optional env: the four above on saroh.in, `NEXT_PUBLIC_SIGNUP_WELCOME_URL` on accounts. No migration, no new package.

## DEC-128 A business's contact details and social links on its website

**Status: Accepted — 2026-10-10** · owner

- Context: the owner asked for a business's social links on its website, with its contact details: mobile, email and address. The footer already showed the public phone (DEC-053), the contact email (DEC-101) and one address line, but there was nowhere to keep a social link, the address fell back to the registered (legal) address, the left-aligned footer showed none of it, and nothing told search engines.
- Decision: a merchant's website shows how to reach the business in its footer: the phone as a call link, the email, where customers come, and its social links as icons. Each is shown when it is set and nothing is drawn for what isn't. There is no switch per item.
- Social links belong to the business, not the site, since they are the same wherever they are shown. The networks are a fixed list: Instagram, Facebook, WhatsApp, YouTube, X, LinkedIn, Pinterest and Telegram. Google Maps is not one of them (owner, 10 Oct): it is an address's place on the map, below. For each the merchant types a name (`@rye`) or pastes a link, and it is kept as one `https` address on that network's own host. WhatsApp takes a phone number and becomes a `wa.me` link. Anything else is refused on its field: there is no free link, because an arbitrary address on a merchant's page is a phishing and brand-safety hole. The rules are one file, `@saroh/block-contract` `social-links.ts`, shared by the API (which judges), the workspace (which says so while typing) and the site (which re-checks before it draws).
- Which address: where customers come, not where the business is registered. Every location that says customers visit and has an address is shown, one as its address and several each by name, with "Get directions" and the week it opens. A location with no counter never shows its address. The registered address is shown only while no location has one and the owner turned on "Show your registered address" (off by default, since it is often a home; owner approved 10 Oct).
- Get directions: each address may have its own optional Google Maps link, kept beside it (a location's, and the registered address's while it is the one shown). "Get directions" opens that link when it is set, else a search for the address text. Only Google's own map pages are taken (`maps.app.goo.gl`, `g.page`, `google.com/maps` and the like, `normaliseMapLink` in the same file as the social rules), each rebuilt into one address; a redirect or any other site is refused on its field.
- Live, not draft: all of it is read live by the public contact read (`GET /public/sites/:siteId/contact`), as the phone always was, so a save shows on the site with no publish and no row carries "Next publish". A save of the phone, the email, the links, the registered address or its choice, or of a location's name, address, hours or kind, tells the page cache (`site.pages.revalidate`, cause `contact`).
- Where it is set: Settings › Business › Contact has a "Social links" row and one sheet with a field per network. Website › Settings has a "Contact and social" group that says what the website shows and edits the phone, the email and the links in place, in the business's own sheets. Its Address sheet lists each location customers visit and edits that location's address and Google Maps link right there, with the location's own fields and its own save (`store:write`); someone who may not change a location reads the addresses and is told who can. Only with no location customers visit does it offer the registered address choice (with its own Google Maps link) and a link to Locations. The location's own Address sheet has the same Google Maps link field: one implementation (`LocationAddressFields`, `lib/stores/location-address.ts`). Changing the business needs `org:update` (owner or admin); anyone who may read the site reads the rows.
- Search engines: the home page carries structured data built from the same read. One place makes it a `LocalBusiness` with its address, several an `Organization` listing each, with `telephone`, `email` and `sameAs` (the profiles; a WhatsApp link is a way to message, not a profile). A place's Google Maps link is its `hasMap`.
- On the page the icons are line drawings in the footer's own text colour, never a network's brand colour or Saroh's. Nothing is fetched from a network, so opening a page tells none of them. Each link has its network's name, a 44px target, opens in a new tab and carries `rel="noopener noreferrer me"`.
- Data: `BusinessProfile.socialLinks` (JSON, one address per network, re-checked on the way out) `BusinessProfile.siteShowsRegisteredAddress`, `BusinessProfile.registeredAddressMapUrl` and `StoreSettings.mapUrl`. Migration `20261110100000_business_social_links`, additive.
- Consequences: a site that showed its registered address in the footer because it had no location customers visit shows no address until the owner turns the choice on. The left-aligned footer now shows the contact group too. Visit us and the booking page's header still read `/visit`, which keeps its registered-address fallback: whether they should follow the choice is open. The Contact block on a page still holds what the merchant typed into it; showing the business's own details there, and offering the phone and email on the pay and booking pages, are follow-ups.

## DEC-129 A merchant signs up and signs in with an emailed code; a password is optional

**Status: Accepted — 2026-10-10** · owner (UX audit, the first run)

- Context: sign-up asked for a name, an email and a password, then a six-digit code, then setup. A merchant's own customers already sign in on their site with an email and a code alone (ADR-011). The audit timed about 100 seconds and four screens before anything of the owner's existed.
- Decision: `/signup` asks for the email only, then the code, and the account is signed in and sent to setup. `/login` offers "Email me a code" as the main way and "Use a password instead" for an account that has one. Google stays. Password accounts made before this keep working unchanged.
- A password is optional. An account made with a code (or Google) has none, and sets its first on the account page with a code sent to its address, so a browser left signed in can't give the account a password its owner never chose. Setting it signs every other device out.
- The name is asked on the setup screen, beside the business's. Someone joining through an invitation never sees setup, so their sign-up asks for it.
- No enumeration: asking for a code answers the same and sends the same email ("Your Saroh sign-in code") whether or not the address has an account. An existing account simply gets a code that signs it in, and lands in its own business.
- Nothing of it is ours to implement. The code, the account it makes and the session are Better Auth's `emailOTP` endpoints (`send-verification-otp` with `type: "sign-in"`, then `sign-in/email-otp`), already installed for the verify step. A code is single use, hashed at rest, lasts 10 minutes and is spent after 5 wrong tries. Asking and checking are each limited to 3 a minute per caller. A right code for an account whose address was never proven first removes the password it was made with. `packages/auth/src/sign-in-code.test.ts` runs the real library to hold each of these.
- One code step, in the words of the customer site's: one "Code" field (`one-time-code`, sent on the sixth digit), "Resend code in 24s", "Send a new code", "Change email", where it went and how long it lasts.
- Consequences: the six-box input and the separate verify page's own form are gone (`/verify-email` stays for a kept link and draws the same step). The API exposes `X-Retry-After` to the first-party origins so the step can count the limiter's wait down.

## DEC-130 The first run: one setup screen that ends in the product, one checklist, one welcome

**Status: Accepted — 2026-10-10** · owner (UX audit, the first run). Amends DEC-070 and DEC-068.

- Context: after sign-up, setup said "Last step", hid its form until "What are you setting up?" was answered, and asked whether the business was a registered company. Home then asked "What will you do first?", which opened a second sheet of fields and landed on an empty list. The same choice was worded two ways (Home and the module picker). Four setup checklists were drawn four ways, and none was called "Finish setup", the name the Turn on sheet promised. Nothing was emailed when a business was created, and someone who accepted an invitation was not told where they had landed.
- One setup screen. "A business" is chosen and the whole form is open from the start (DEC-070 had nothing chosen and the form held back). It asks: your name if the account has none, what it is called, the web address (labelled "Web address"), the country (India) and what you will do first. The registered-company question is gone from setup, because the Finish setup step "Choose your business type" asks. It says "Steps 2 and 3 of 3", after sign-up's step 1.
- Create ends in the product. It turns the chosen goal on with its defaults and no second sheet (DEC-068's sheet stays for turning a module on later): Sell with a location named after the business, Website on the web address just chosen, Contacts, and Bookings with nothing made, since its first service is the page they land on. It lands on a new product, a new service, the site with Publish, or Contacts with New contact open. A goal that can't be turned on (not rolled out to the business, or refused) lands on Home with the reason. The business is set up either way. "Decide later" is an answer.
- One list of goals in one set of words, the plainer one ("Sell things", "Take bookings", "Put up a website", "Keep track of people"), read by setup, Home and the picker, each with one destination.
- The web address is asked once. When Website is turned on later the sheet says it and asks for it only when the API refuses it.
- One checklist component for Home, Settings › Business, a location and the website's share list: "2 of 4 done", a bar, done rows first, one button a row. Finishing fills the bar and says the true thing, and the card is one quiet line on the next visit. The Home and Settings one is named "Finish setup" everywhere. "Hide for now" stays per browser: there is no per-person preference store on the server.
- One welcome email when a business is created: "{Business} is set up on Saroh", the next step for the goal chosen, "Open {Business}". Saroh's own sender (DEC-011). Sent by onboarding, once, never to an invited member.
- A new team member is told where they are: "You've joined {Business} as {Role}." and what that role opens, once, on arrival. Every accepted invitation comes through the workspace's door (`/open/:id`), so a location's invitation opens its business, which it did not, and lands on that location's orders.
- Consequences: `POST /organizations` takes an optional `goal` (words only; it turns nothing on and decides no access). A location's accept answers its `organizationId` beside `storeId`. `Organization.kind` still changes words and defaults only.
- Amended 2026-10-11 (owner) — **setup is a stepper of three short steps, not one screen.** The owner asked for one question to a screen with Back and Continue, showing only what is active. The steps: "What are you setting up?" (three full-width cards, "A business" chosen), then the name step (your name if the account has none, what it is called, the web address with its live check, the country), then "What will you do first?", whose button is the create. The plan is four steps counting the account ("Step 2 of 4"; a second business counts setup's own three), one list (`SETUP_PLAN` in `@saroh/ui`) that the sign-up panel, setup's panel and the stepper all read. One form holds every answer, so Back loses nothing and asks nothing. Continue checks its own step only and waits for the web address's answer. The step is in the address (`?step=`) and in the browser's history, what was typed is kept for the tab and cleared when the business is made, and a later step asked for too early opens the first one not answered. A thin progress bar sits at the foot of each step above a quiet Back and the step's button. Everything else here stays: the registered-company question is not asked, Create turns the goal on with its defaults and lands in the product, the goals are worded once, the web address is asked once, one welcome email, the join line.

## DEC-131 Admins open Plan and billing, plan prompts know who can act, and anyone can leave a business

**Status: Accepted — 2026-10-10** · owner (UX audit, what each role sees)

- Context: the API reads Plan and billing to `billing:read` and changes it with `billing:manage`, and an Admin holds both. The app's page refused anyone but the Owner, by role name, while every plan lock and limit offered "See plans" to everyone. Leaving a business needed `member:remove`, so a Member, a Reviewer, a location's person and a diary person with a login had no way out.
- Plan and billing opens to whoever holds `billing:read`, and is changed by whoever holds `billing:manage`. The Settings tab, the page, Settings search and every plan prompt ask those two, so they agree with the API and with each other. No API permission changed. An Admin therefore changes the plan in the app, as the API already let them. If Admins should only read it, that is a change to the Admin's permissions in the API policy, not to a screen.
- A plan prompt shown to someone who can't change the plan says who can, as text, and offers no link.
- Anyone who is a member can leave: `POST organizations/:id/leave`, the caller's own membership, no permission asked. The last Owner is refused and told to make someone else an Owner first. Leaving takes what a removal takes and cannot be undone, so the app asks once, saying what is lost. It is offered on Your profile, which every role opens, and on the person's own row in Team. Afterwards they land on their businesses on accounts.
- A refusal by role is a calm notice, never a red error, wherever it is shown from (`frontend-error-feedback.md`).
- Amended 2026-10-11 (owner) — **only the Owner changes what the business pays Saroh. Admins read.** Inside a business, the plan, add-ons, a coupon, the payment method, a checkout and cancelling are the Owner's alone. This is the change to the API policy the entry above named: `billing:manage` joins the owner-only powers (`OWNER_ONLY_ACTIONS`), beside closing the business and changing its web address. So an Admin no longer holds it, it is not offered for a role a business makes, it can't be given to one person as an extra, and a stored list that names it is read without it. `billing:read` is unchanged: an Admin, and any role given it, opens Plan and billing and reads the plan, the plans and Saroh's invoices, with a note that only the owner can change it and no control that would. Every write there answers anyone else 403 "Only the owner can change the plan.", which the app shows as the calm notice. A business with several Owners: each of them may, since nothing in the API marks one Owner as the payer. Saroh staff acting from the admin console are a separate path and unchanged. Still to confirm with the owner: Saroh's emails about a bill (an invoice, a failed charge, a renewal) go to whoever holds `billing:manage`, so they now reach the Owners and no longer an Admin.
- Open: a member whose access is paused by the plan (#800) can't reach the business, so can't leave it from the app. A location's Admin, Manager and Editor may do more through the API than the app offers them (rename the location and its logo, take and change its orders, change its products through the location's own routes). The invitation now promises only what all four get in the app. Offering the rest needs the API to tell the app what a person may do at each location.

## DEC-132 A location's people are offered what the API takes from them, and a business's first good moments are marked once

**Status: Accepted — 2026-10-10** · owner (UX audit, what each role sees and what the product marks)

- Context: DEC-131 left open that a location's Admin, Manager and Editor may do more through the API than the app offered. The product also passed its best moments (a first order, a first booking, a site going live) with a generic toast or nothing.
- `GET stores/:id` returns `abilities` (`edit`, `takeOrders`, `takePayments`, `changeOrders`), worked out by the same policy functions the writes ask, so the read and the guards cannot disagree. The app offers exactly those: a location's Admin, Manager or Editor takes a new order at their location, to be paid on collection, and changes the location's name and description. Never payments or refunds (DEC-106). A Viewer gets none of it. The three higher roles do the same today, and the invitation says so.
- Not offered: the catalogue (its screens are the business's, not a location's), editing an order (Order Detail writes through the business's routes) and a logo upload (no `media:write`).
- A moment is one calm line with the real fact in it and at most one action: the first order, the first booking, the 10th and 100th order, and a site's first publish. Each is shown once per business, kept on the server (`Organization.momentsSeen`), for at most seven days, and ends for everyone when one person opens or dismisses it. It is never confetti, a badge, a streak or anything that blocks work (`saroh-product.md` → Moments).
- Open: a moment is per business, so a teammate can end it before the owner sees it. A per-person marker would change that. A first online payment, a first returning customer and a day's close are not marked: no read tells the app they happened.

## DEC-133 An absent value is a dash again, the menu's last group is Manage, and a lead's Worth is in the business's currency

**Status: Accepted — 2026-10-11** · owner (three decisions on the merchant app)

- Context: the wording sweep of 10 Oct replaced the bare dash that stood for "no value" in cells and stat tiles with words ("None", "Not set", "Not known"), and they read heavier, most of all in a big stat tile and a mono SKU cell. The menu's last group was still headed "Workspace", a word the app never says for the business. A lead's Worth was a bare number with no sign, because a lead records no currency.
- An absent value in a table cell, a stat tile, a row's meta, a code cell, a quick look or a summary is a muted dash, drawn by one shared piece: `AbsentValue` (`@saroh/ui/absent-value`) hides the dash from a screen reader and says the word instead, so the sweep's words are kept as what is spoken. `absentText()` is the dash for a plain string. The dash is written in one file (`packages/ui/src/lib/absent.ts`), and `pnpm check:copy` fails one typed anywhere else in the app.
- Words stay where they are the invitation or the sentence: "Not set" in a Settings read row, beside its Edit button, and any line that reads as words.
- The menu group that holds Settings (and, in the phone's More sheet, the rows with no seat on the bar) is headed "Manage" everywhere it is drawn or spoken. The rail's landmark names the whole rail: "Main menu". Settings search still finds the web address by "Workspace address", a synonym that is matched and never shown.
- A lead's Worth is money in the business's currency. The app reads that currency the way the API's `businessCurrency` does (a location's, else what its services are priced in, else INR) and passes it to every place Worth is typed or drawn. Nothing about what is stored changes: `Lead.value` stays an integer in minor units with no currency column, and no API response changed.
- Open: the business keeps no currency of its own, so the app works it out from a location or a service on each page that shows a lead. A business with neither reads as INR. A `currency` on the business, or on the leads read, would make it one fact. The Pipeline has no column totals, so none were added. Home's follow-up evidence still carries a lead's amount with no currency, and no screen draws it.

## DEC-134 Every table ends with one footer, and a list remembers its rows per page

**Status: Accepted — 2026-10-11** · owner (two decisions on the merchant app)

- Context: lists ended three ways. Orders and Customers had Previous and Next with a fixed 50 rows; Stock and Products grew by "Show more"; every other table drew all its rows however many there were. Nobody could choose how many rows to see, or go straight to a page.
- Every table ends with the same footer, `ListPaging` (`@saroh/ui/list-toolbar`): on the left "Rows per page" (10, 25, 50 or 100; 50 until chosen) and which rows are showing; on the right Previous, the page numbers (seven places at most) and Next. On a phone the numbers give way to "Page 3 of 54". A list no longer than 10 rows has no footer.
- A list remembers the size someone chose, per list and per browser, between visits. The choice is kept in one cookie (`saroh_rows`, named in `packages/ui/src/lib/paging.ts`) so the server reads it and the first paint is the right length. The shell hands it to `PageSizes`; a list reads its own with `usePageSize`.
- A list the server reads a page at a time (Orders, Customers, Products, Stock) carries `page` and `size` in its address, so a page is a link; an address with no size opens at the remembered one. Its API reads a page by number and size. A list read whole pages in the browser: `DataView` does it for every screen it draws, `useLocalPages` for a table built by hand.
- Left as they were: a card that is one of several on a screen (Notifications, grouped by day), and the histories inside a detail page, which still grow by "Show more".
- Open: the size is kept per browser, not per person, so another device starts at 50. Orders pages by offset now, so an order placed while someone pages moves the rows one down; Export still walks the cursor, which cannot skip or repeat a row.

## DEC-135 Templates stay off until they are switched on: no gallery on saroh.in, no template choice for a new website

**Status: Accepted — 2026-10-11** · owner (the next production release shows no templates)

- Context: the Templates gallery on saroh.in was dated to appear by itself on 17 Oct (`publishOn` in `content/resources.ts`), and the merchant app offered a template to choose on `/sites/new` and in the Website step of the Turn on sheet. The owner decided the next production release shows neither, and that no date may bring them back.
- One switch per app, with the same name: `NEXT_PUBLIC_TEMPLATES`, `on` or `off`, read at build. Anything but `on` is off, unset included, so production is off by leaving it out. Unset counts as on only under `next dev`, so local work needs no setting. It is `on` in the development Workers' `vars` (saroh.io), in CI's browser-test stack and in `pnpm prepush --e2e`, so everything there is as before.
- saroh.in, off: `/templates`, every `/templates/<slug>` and their share cards are a 404, and nothing lists or links them: the nav, the footer, the sitemap, `llms.txt` and the changelog's "See templates". A `?template=` on the waitlist is ignored. Neither the date nor `RESOURCES_PREVIEW` overrides the switch. On, the date rule is as it was: shown from 17 Oct, or earlier on a preview.
- The merchant app, off: `/sites/new` and the Turn on sheet show no template and send none, so the API starts the site from the one for what is being set up (the starter for a business, Personal for "Just me", Portfolio for "A site for my work"). `?template=` on `/sites/new` is ignored.
- Unchanged: a site already made from a template, its pages and its colourways. The API still lists templates and accepts one; the switch hides the choice and is not an access rule.
- To bring them back: add `"NEXT_PUBLIC_TEMPLATES": "on"` to `env.production.vars` in `apps/saroh.in/wrangler.jsonc` and `apps/app.saroh.in/wrangler.jsonc`, and release. Each app is switched on its own.
- The changelog's launch entry no longer says a site can "Start from a template": its "Your website" line is about the domain and how a page looks when shared. The words go back when the gallery does (owner, 11 Oct).
- Open: the switch is read at build, so flipping it takes a deploy of that app.

## DEC-136 The workspace shows nothing of Saroh's plans until pricing opens, behind one switch

**Status: Accepted — 2026-10-11** · owner (the next production release goes out without pricing and plans)

- Context: the next production release carries the plan screens (Settings › Plan and billing, limit notices, plan locks, the paused and plan-ending banners) while no catalogue is published and `PLAN_ENFORCEMENT` is off. A business would open a plan page with nothing to choose, and prompts could point at it. Pricing is to arrive on its own day, by a setting, not by a code change.
- One switch for the merchant app: `NEXT_PUBLIC_PLANS`, `on` or `off`, validated in `apps/app.saroh.in/env.ts`. Only `on` shows plans. Unset is off, so production hides them by leaving the variable out. Everything asks one function, `plansShown()` (`lib/saroh-billing/plans-shown.ts`); nothing else reads the variable.
- Hidden while it is off:
    - Settings › Plan and billing: `/settings/billing` is the app's not-found (answered by the segment's layout, and by the page), and Saroh's invoice PDF route is a 404. The page leaves the Settings sections, `/settings`'s first page, the command menu and Settings search, which all ask `mayOpenSettingsPage`.
    - Every plan notice built on a read: `billingAccessOrNull` and `pausedOrNull` answer null without asking the API, so limit notices, meters, plan locks in the rail and on a page, the paused banner and its marks, and the plan-ending banner say nothing, as for a plan that couldn't be read.
    - Every way to a plan: `PlanWay` draws nothing (no link and no "the owner can change the plan"), `PlanLockedCard` and `LimitReachedCard` draw nothing, and a setup step that is the way to a plan has no button.
    - A plan's refusal from the API (`PLAN_LIMIT_REACHED`, `MODULE_LOCKED`) is read as any other failure: the API's sentence in a toast, no notice and no link. It shouldn't arrive while enforcement is off.
    - Activity leaves out "moved the plan" lines, a plan notification opens Home, a module the plan holds reads "This isn't available for your business yet.", Home never says "isn't in your plan", onboarding reads no plan picked on saroh.in and no opening-day invite, and the site editor's footer note no longer names a plan.
- Not hidden, on purpose: a business's own plans on sale and its own invoices (Payments › Subscriptions, Invoices). Those are its product, not Saroh's pricing.
- Nothing was removed. The code is gated, and the unit tests run with the switch on, with one file for the hidden state (`lib/saroh-billing/plans-shown.test.tsx`).
- Where it is set: `on` in the development `vars` of `apps/app.saroh.in/wrangler.jsonc` (saroh.io), in CI's browser stack (`ci.yml`), in `scripts/prepush.sh`, in the app's `dev` scripts and in the unit-test runner, so behaviour and specs there are unchanged. Left out of the production `vars`.
- How it comes back: add `"NEXT_PUBLIC_PLANS": "on"` to the production `vars` and deploy the workspace. It is compiled into the build, so it takes a deploy, not a restart.
- Separate release-time steps, unchanged by this: publishing a catalogue and turning on `PLAN_ENFORCEMENT` (`PRICING_ROLLOUT.md`), both on the API. This switch hides and protects nothing. With it off and enforcement on, the API would refuse and the app would say so in the API's words with no way to a plan, so turn this on first.
- On saroh.in, Pricing was already held back by the site's own launch switch (`NEXT_PUBLIC_LAUNCH_MODE`): no link in the nav, the footer, the sitemap or `llms.txt`, and `/pricing` goes to the waitlist. One gap is closed here: Home and the solution pages read the published catalogue whatever the switch said, so a catalogue published ahead of launch would have put plan names and prices in Home's "What does Start free include?", the line under the hero and the page's structured data. They now read it only once the switch is open, as the feature pages already did.
- Open: words that reach the app only as an API fact behind `PLAN_ENFORCEMENT` ("comes with a paid plan" on taking payment online or sending from your own email, "Not taking orders on your plan") keep their sentence and lose their link while the switch is off; the prompt to see plans for your own email isn't drawn at all. None can appear with enforcement off. The Terms on saroh.in still say each plan's price is shown on saroh.in/pricing and in the app, which is true only once pricing opens; legal text, left for the owner.

## DEC-137 saroh.in has an About page and a Contact page, and a message from Contact is stored for the team

**Status: Accepted — 2026-10-11** · owner (the two designs "Saroh Marketing Site V2 - About" and "- Contact")

- Decision: `/about` and `/contact` are pages of saroh.in, shown now with no publish date, in either launch mode. They are in the footer's Saroh column (About, and Contact, which was a `mailto:` until now), the sitemap and `llms.txt`. The nav is unchanged. `/about` used to redirect Home (`redirects.js`); that rule is gone.
- The designs are matched for layout, type, spacing and colour roles. Their words are kept except where one of four rules says otherwise. `MARKETING_CLAIMS.md` §14 has a row for every claim, and says what was reworded or left off:
    - **Nothing about Saroh's plans, prices or limits before launch** (with DEC-135 and DEC-136). On these pages that is content, not code: a clause or a card is marked `openOnly`, or a line has a second wording, and it comes back when `NEXT_PUBLIC_LAUNCH_MODE` is `open` (`content/launch-words.ts`). The closing band follows the same switch through `cta()`: "Join the waitlist" before, "Start free" after.
    - **Only what the product or a published page backs.** "All from the same customer list", "UPI everywhere", a free month after a bug and cancelling in Settings are not backed today and are not on the pages. Nothing was put in their place that promises anything new.
    - **A company fact that isn't set is not drawn, and never as a placeholder.** `apps/saroh.in/content/company.ts` holds them, each optional: the LLP's name and registered office (the ones the Privacy and Refund pages already give), and, unset today, the LLPIN, the GSTIN, a phone number with its hours, and the founder's name, note and photo. A row, a line or a card with no fact behind it is left out, and adding the fact there brings it back.
    - **The address is contact@saroh.in** (DEC-101), not the design's.
- The Hindi in "What the name means" is set in Noto Sans Devanagari, as designed: one variable file (400 to 700) subset to the page's own words, self-hosted and loaded on `/about` only.
- **Where a message goes.** The Contact form posts to the site's `/api/contact`, which forwards the topic, name, email, kind of business (optional) and message to the API's `POST /public/contact-messages`, the way `/api/business-reports` forwards a report. The API stores it in `ContactMessage` (migration `20261115130000_contact_messages`) with a digest of the sender's address, never the address. Per visitor it takes 3 a minute and 20 a day. If the API can't be reached the form says so, keeps what was typed and gives the email address. Nothing is acknowledged that wasn't stored.
- **Who reads it.** Staff, in the admin console at `/messages` (`GET /admin/contact-messages`): newest first, by topic on asking, read-only. A message is a person's name, email and words, so the list needs `organization:pii:read`, which Platform Owners and Support hold. No new permission. The reply goes from the team's own mailbox.
- **The team's inbox is told, and the sender is not** (owner, 11 Oct 2026). Once a message is stored, the API sends a plain-text notice to contact@saroh.in with the topic, the name, the email, the kind of business and the words, and a reply to it goes straight to the sender (`sendContactMessageNotice`, `common/email.ts`). The subject is Saroh's own words. The sender is sent nothing, so the form can't be used to make Saroh write to a stranger. A notice that fails loses nothing: the message is stored first, and the visitor is told it went.
- **A reply within one working day** is promised on the page and in the thanks (owner, 11 Oct 2026; working days are weekdays). `MARKETING_CLAIMS.md` CT2 and CT3.
- **How long it is kept.** 12 months from the day it arrived, then deleted, the rule waitlist entries, link-preview reports and QR code maker emails already follow. The waitlist's daily retention job does it (`contact-messages/contact-retention.ts`), so there is no new job chain.
- The Privacy Policy lists "Messages: what you write to contact@saroh.in" under what we collect. The owner's reading (11 Oct 2026) is that a message from the form is one of those: it reaches the same inbox. The legal text was not changed. Open: its "How long we keep it" table has no row for messages, so the 12 months above are the code's rule and not a published one.
- A session recording masks what is typed (every input, by the recorder's own rule) and the thanks that says the name and email back (`data-ph-mask`, DEC-125).

## DEC-138 Whoever reports a business gives their email and their mobile number

**Status: Accepted — 2026-10-11** · owner · amends DEC-121

- Context: the Report a business form on `saroh.in/customers` asked for the site's address and what happened, with "Your email (optional)". A report with no way to reach its sender can't be followed up.
- Decision: the form asks for four things, none optional: the business's website address, what happened, "Your email" and "Your mobile number". The hints say why the last two are asked ("So we can reach you about your report.", "In case we need to call you about your report.") and that neither is added to any list. No reply is promised.
- The number's rule is the one a customer's own phone already follows on a business's site (the bag's delivery address and the booking page): `CUSTOMER_PHONE` and `isCustomerPhone` in `apps/api.saroh.in/src/common/customer-phone.ts`. Digits with the spaces, brackets and dashes people write, an optional leading +, six digits at least, 24 characters at most, kept as typed and trimmed. India-first without refusing another country's number, and no new rule. saroh.in carries the same rule word for word (`phoneOk` in `lib/business-report.ts`), as `packages/site-blocks` does, with a test on the API's own lists.
- Where it is checked: the form (`reportProblem`, the first field at fault in the form's order, which gets the red border, the message and the keyboard), the site's `/api/business-reports` (the same function, so a post that skips the form is refused with its field named and never reaches the API), and the API (`SubmitBusinessReportDto`: `email` and `phone` required; the service also refuses a number that is punctuation alone).
- Stored in `BusinessReport.reporterPhone`, beside `reporterEmail` (migration `20261116100000_business_report_phone`). **The column is nullable** because reports sent before this have no number, and some have no email; the requirement lives in the DTO, not the table. No backfill.
- Who sees it: as the email. The console's Reports list shows the number beside the email only to staff holding `organization:pii:read`; others see that one was left. An older report shows a dash for the number. No new permission.
- What is not done with either: no waitlist entry, no news consent, no customer or contact record, no email, SMS or WhatsApp sent. The API's log line still carries the host only. `MARKETING_CLAIMS.md` §15 (RB1, RB2).
- Retention and erasure are unchanged, because there is none for a report: no job deletes `BusinessReport` rows, a report is kept when its business is deleted (DEC-121), and it is in no data export or privacy-removal plan (it is reachable from neither `Contact` nor `Customer`). So the number is kept exactly as long as the email already was. Open, for the owner: how long a report, and the email and number on it, should be kept.
- What Privacy still says (`apps/saroh.in/content/privacy.ts`; legal text, not changed here): it does not mention a report at all. "What we collect" has no row for a report's email and mobile number. Its "Account" row names a phone, but for Saroh's own users, to sign in. Its "Messages" row covers "What you write to contact@saroh.in", which a report is not. "How long we keep it" has no row for a report. Nothing in it calls the email optional, so no sentence is now false; the page is silent where the form now requires two personal details from someone who need not have an account.
- A session recording masks what is typed (every input, by the recorder's own rule, DEC-125); the form's thanks says none of it back.

## DEC-139 A business's own domain is paused, not removed, when its plan stops including one

**Status: Accepted — 2026-10-12** · owner (closes the first open question on #862)

- Context: connecting your own domain belongs to a paid plan. Nothing said what happens to the domain when a business moves to a plan without it.
- The business is told before the paid period ends, in the app and by email, that the domain will stop on a named day.
- For 3 days after the plan ends the domain still shows the site, and the notice stays up.
- After the 3 days the domain is paused: it stops showing the site and sends a visitor on to the business's Saroh address, so the business's customers can still reach it. The connection is kept: its DNS check, its certificate and its record with the host.
- When the business is on a plan with a domain again, the domain shows the site again at once. Nobody reconnects anything. A business that goes back to the free plan does not have to remove its domain first.
- This follows how a downgrade already treats everything else (DEC-131): things pause and come back, and nothing is deleted. Removing the domain would make the business that returns redo its DNS and wait for a certificate.
- It applies only while plan enforcement is on (`PLAN_ENFORCEMENT`), as every plan rule does (DEC-136).
- Amended 2026-10-12, as built. What had to be settled to build it:
    - **What says a plan includes a domain.** The entitlement `customDomain`, the key connecting a domain has always asked. No catalogue row sells it: it is on with any plan that has a price and off on one without (`PAID_PLAN_SWITCHES`, `billing/catalogue-access.ts`). Nothing was added to the catalogue and no column was added.
    - **What "the plan ends" means.** The moment the plan the business reads stops including a domain, however it gets there: a plan given until a date (the launch offer, or one an operator set) at that date; a move the business chose for its period's end, then; a 12-month term nobody paid for again, at its end; and at once for a payment that failed for good, a cancel now, or an operator taking a plan away. A business moved by an operator is treated as any other.
    - **Nothing is stored on the domain.** One rule (`billing/domain-plan.ts`) answers included, ending, grace or paused from the plan read now, an end known ahead, and a clock. The clock is the one stored thing, as the 7-day clock of DEC-114 is: a `CustomerNotice` (`DOMAIN_PLAN_ENDED`) dated at the end the business was told about, else when the hourly billing sweep first sees the plan without a domain. A plan with a domain again reads included at the next request, with no job.
    - **Told ahead** 30, 7 and 1 days before, by a line in the notice and email that end already sends (a plan that ends on a date, a term that ends, a move down), not a second email. Where none of those is sent (a chosen move that pauses nothing else) the domain has its own notice. The app names the day from 30 days ahead.
    - **A plan that ended at once can't be told ahead.** It is told within the hour, and its 3 days count from that notice, so the business always has 3 days after it was told. This is the reading taken; say if the 3 days should count from the end itself.
    - **Paused** is a 307 to the same path and query on `<address>.saroh.app`, marked `Cache-Control: no-store`, and nothing of Saroh's is drawn. While paused the Saroh address is the site's canonical address and the one in every link Saroh builds (pay links, autopay returns, notices, QR codes, an old address that forwards, the links in Web address). A pay link already sent on the domain still opens: its page goes on to the same pay page on the Saroh address, as it does from any address that is no longer the site's own. The domain's test host (`test.<domain>`) follows it to `test--<address>`.
    - **Who is told.** The business's owners, by Saroh's billing mail, and an inbox notice that opens Plan and billing: once when the domain is paused, and the notices above before.
    - **In the app** the domain's card says the day, then "Paused" and where visitors are sent, with the way to the plans. None of it is drawn while plans are hidden (DEC-136), so with enforcement on and plans hidden a paused domain's card would still read Live: turn plans on first, as DEC-136 already says.
    - **Connecting a new domain** on a plan without one is refused as every plan refusal is (`MODULE_LOCKED`), with the plans offered. No plan is named as the one to move to, because no catalogue row says which plans include a domain.
    - **When enforcement is switched on**, a business already on a plan without a domain is told within the hour and paused 3 days later, as DEC-114 does for limits.
- Open: back on a plan with a domain, the host serves again within 30 seconds (the answer is kept that long per business, as other pauses are), and pages kept from before name the domain as canonical again within five minutes, or at the next hourly sweep. "Any plan with a price includes a domain" is a rule in code, not a row in the catalogue, so the catalogue can't say otherwise for one plan; a row would also let the refusal name the plan to move to.

## DEC-140 A bare domain is connected through `www` for now, and by two records later

**Status: Accepted — 2026-10-12** · owner (closes the second and third open questions on #862)

- Context: a business connects its domain with a CNAME record, and many providers do not allow one on a bare domain (`example.com`). This will come up often.
- Now: the business connects `www.example.com`, and the connect steps guide it to forward the bare domain to `www` at its provider. Where a provider can point a bare domain the way a CNAME does (an ALIAS or flattened record), the bare domain is accepted as it is. The daily re-check says when a bare domain is not forwarding.
- Known weakness: some providers forward only `http://`, so `https://example.com` warns until the visitor uses `www`.
- Later, if this keeps coming up: every business adds two records, one for the bare domain and one for `www`, which works at every provider. That needs a forwarding service of Saroh's own on an address that never changes. How it would be built is worked out before it is started.
- Merchant sites stay on the host's free plan for now. The paid plan for the merchant-site domain is looked at again at about 40 to 50 paying businesses, with real traffic from India to measure (amends DEC-107's open question).
- **Amended 2026-10-12, as built (the "Now" half only):**
    - **What is bare** is asked of the Public Suffix List (`tldts`, in `domains/bare-domain.ts`), never a list of our own: `example.co.in` is bare, `shop.example.co.in` is not. A suffix a company sells names under (`uk.com`) counts. `www.` on a bare domain is the address it forwards to; `www.shop.example.com` is an ordinary subdomain.
    - **Typing a bare domain claims `www.<domain>`.** The API decides (`hostnameToConnect`), from DNS and never from what the app sends, and its answer carries the hostname it claimed. The app says "Your site will live at www.‹domain›. ‹domain› will forward to it" and shows a third step, "Forward ‹domain› to www.‹domain›", in provider-neutral words. No provider is named, because nobody checked their screens. Any other subdomain keeps its one CNAME and no forwarding step.
    - **A bare domain is kept as it is when its DNS already reaches the hosting**: its addresses are the ones the CNAME target answers with, which is what an ALIAS, ANAME or flattened CNAME gives. It is then an ordinary domain with its own TXT check. A `www` domain whose bare domain is seen pointing that way offers "Add ‹domain›" on its row. Nothing is registered with the host without that check: a hostname still reaches a site only through its own verified row.
    - **The canonical host does not change.** A site answers on every verified domain it has and names the oldest as canonical (`sites/primary-host.ts`), so a business that connected `www` first and added its bare domain later keeps `www` as the address named canonical to search engines and the one a QR code lands on. The bare domain serves the same site and is not redirected. The test-release host stays `test.<the connected hostname>`.
    - **Stored:** `Domain.bareStatus` and `Domain.bareCheckedAt` on the `www` row (migration `20261117110000_domain_bare_forwarding`), one of FORWARDS, FORWARDS_HTTP_ONLY, POINTS_HERE or NOT_FORWARDING. Null on any other hostname and before the first check.
    - **The check** runs wherever a verified domain is checked: "Check now" and the `domains.recheck` chain, so a live domain's bare domain is looked at once a day. It asks `http://` and `https://` on the bare domain, follows at most two redirects, reads no body, and goes through the link-preview guard (`link-preview/ssrf-guard.ts`). A secure address that forwards counts as forwarding. It is a notice on the row and never changes the `www` domain's state; nobody is emailed about it.
    - **Known limit:** a bare domain behind the same network as the hosting, on someone else's account, can share an address with it and read as pointing here. The row then offers to add it, and its own check says it isn't live.

## DEC-142 The customer's account shows what they have, in the order it matters, and what changed since they were last here

**Status: Accepted — 2026-10-12** · owner ("they should stay logged in on the URL, and they should be able to see what is happening, all their details") · builds on [ADR-011](./adr/ADR-011-customer-accounts-on-merchant-sites.md) · amends DEC-073 ("Site and accounts": a past appointment) · keeps DEC-042, DEC-049, DEC-055, DEC-083

- Context: the UX audit of 12 Oct found the account led with what a customer didn't have ("Next booking: Nothing booked" above their one order), named a tab "Me", read "Booked" on bookings that were over, and was a phone column with a bar pinned to the foot of a wide window. The owner asked that a business's customers see everything of theirs.
- **Staying signed in is unchanged.** The session is 30 days, sliding, 90 at most, in a host-only `__Host-` cookie (ADR-011). Nothing here touches the cookie, its scope or its lifetimes.
- **Home is ordered by what this customer has** (`site-blocks/account/home-order.ts`):
    - first what is in progress: a place held for them in a class, an invoice to pay, a booking coming up, an order on its way, a message they haven't opened;
    - then what is recent: their latest orders, classes left, their plan, their courses, a line they wait in;
    - last, "Book a time" and "Go to the shop", each only when the business offers it, the site can serve it, and the customer has none of it under way.
    - With nothing at all there is one welcome block that says what will show here. A block whose read failed still says so; it never reads as "nothing".
- **"Since you were last here"** leads Home when something changed: an order the business moved a step or cancelled, a booking the business moved or cancelled, messages the team wrote that are unopened, an invoice issued and unpaid. It names the business, never the person on its team, and never a staff note. What the customer did themselves is left out.
    - It is read from what is already stored: order events, booking events, the thread, an invoice's issue date.
    - "Last here" needed a mark of its own: a session's `lastSeenAt` is moved by the guard before any read runs. `CustomerAccount.lastVisitAt` and `previousVisitAt` (migration `20261118100000_customer_account_visits`) are moved only by Home's read. Opening Home again within 30 minutes is the same visit, so the changes stay through a refresh and go once the customer has been away and come back (`site-accounts/account-visit.ts`). On the account, so a phone and a laptop agree.
- **What the customer now sees, all through the allow-list** (`customer-view.ts`, third file `account-details-view.ts`):
    - **Invoices to pay**, on Home and on Your details beside the receipts. "Pay now" makes a new pay link when it is pressed, so a customer never meets an old one. An invoice the business can't take online says to pay it directly; one autopay is charging offers no second way to pay.
    - **One order and one booking each have a page**: `/account/orders/‹ref›` and `/account/bookings/‹ref›`. The Orders sheet and the Bookings sheets still work. Order and booking emails link to these pages while the account area is on; off, an order's email still links to the shop's order page and a booking's carries no link.
    - **Their places in a class's line**: where they wait, a place held for them with its deadline and the way to book it, and leaving.
    - **Their courses**, read-only: the course, its dates, their sessions attended, missed and still to come.
    - **Whether the business may email them**: one switch over the EMAIL consent that already exists. No new kind of consent. Sign-in codes are not the business's to stop.
- **Left out on purpose:** saved addresses beyond the checkout's own prefill, a language switch, and data export or removal (staff remove a customer's details, DEC-042).
- **Words.**
    - The tab "Me" is "Your details". Its address stays `/account/me`.
    - The Plan tab shows only when the customer has a plan or a pack, or the business sells one. That was already the API's rule (`AccountOffers.plans`); it is now tested as such.
    - **A booking that is over never reads "Booked".** It reads its date alone, and "Attended" or "Missed" only when the business marked it. This replaces DEC-073's "a past appointment with no attendance recorded still reads Booked"; it still never claims "Attended". The same holds for a treatment's past visits.
    - "Sign out everywhere" waits behind "More". "Sign out" stays a button.
- **Titles name the business, never the customer:** "Your orders · ‹Business›", "Your bookings · ‹Business›", "Your plan · ‹Business›", "Messages · ‹Business›", "Your details · ‹Business›", "Receipt ‹number› · ‹Business›", "Order #‹number› · ‹Business›", "Your booking · ‹Business›", and "Sign in · ‹Business›" signed out. The account layout sets the template and a share card that carries the business's name alone, so a pasted private link never wears the home page's card.
- **Private pages say so on the response.** Every path in `PRIVATE_PATH_PREFIXES` answers with `X-Robots-Tag: noindex, nofollow` (the middleware, from the one list `robots.txt` reads), as well as the page's own `<meta>`.
- **From tablet width up the account is not a phone app on a desk.** One layout: the header, the tabs, the page, in that order in the document at every width. On a phone the tabs are the bar at the foot; from 768px they are a row under the header that stays at the top, Home has two columns, and lists have room.
- **Every account page has a held layout while it loads** and its own "couldn't be loaded" block. Known cost: a page under a held layout has started answering before it can say "not found", so an account address that isn't there answers 200 with the not-found words and `noindex`, where a public page answers 404 (DEV_LEARNINGS, UX-071). These pages are private and never indexed. One order or booking that isn't the customer's says "not found" inside the account, with the way back.
- **A first sign-in that staff haven't linked** (DEC-049, DEC-055) is unchanged: nothing merges on its own. When the account stands on a contact of its own because the business already held that email unproven, an empty Home says earlier bookings and orders aren't on the account until the business has checked it's them, and how to ask. Nothing of the other record is shown.
- **Not decided here, the owner's to decide:**
    - turning the account area on in production (`SITE_ACCOUNT_AREA`, the API first, then the site);
    - making a business's own domain the one place its customers sign in. Today each address holds its own cookie, as ADR-011 says.

## DEC-143 saroh.in says to a search engine what a page is, in the words people search with

**Status: Accepted — 2026-10-12** · owner (asked for the 12 Oct SEO audit's findings to be fixed before early access; the choices under Open are the build's own and wait for the owner)

- Context: the audit found the site technically sound (one host, single-hop redirects, real 404s, a clean sitemap, honest structured data) and its words wrong for search: titles were slogans ("Orders — Every order in one list, and none slip. · Saroh"), descriptions were the page's own lead at 165 to 225 characters, three title patterns were in use, and Website and Salons had no page.
- **Every main page has search words of its own** (`SearchWords` in `apps/saroh.in/content/types.ts`): a plain category `phrase`, a `seoTitle` that leads with it, and a one-sentence `seoDescription` that opens with it. The page's headline keeps its voice, and its first screen says the phrase in plain words (the lead, or Home's eyebrow).
- **One title pattern: "‹what the page is› · Saroh"** (`pageTitle`, `lib/seo.ts`), 60 characters or fewer, the brand once and last. A description is one sentence of 150 characters or fewer. Help articles and changelog entries are "‹title› · Help · Saroh" and "‹title› · Changelog · Saroh". A share card keeps the page's headline (`socialTitle`).
- **A feature page owns "‹X› software"; a solution page owns "software for ‹trade›"**, so the two never ask for the same search. No feature's phrase names a trade.
- **Search words are claims.** They follow `MARKETING_CLAIMS.md` (§16.3) like any line, and name no price and no plan. Two phrases the audit suggested are not used because the product doesn't back them today: "online ordering" (the site's shop waits for `SITE_SHOP`) and "CRM" for the Customers page.
- **Website is the ninth feature page and Salons the fourth solution page**, in the nav, the footer, the sitemap and `llms.txt` (which now lists every feature and solution page). `/website` and `/modules/website` go to `/features/website`. Neither has a design yet. Salons has no screenshot, because no salon is seeded or captured, and shows no other trade's in its place: a solution's hero and a segment's shot are optional (`Solution.hero`, `SolutionSegment.shot`).
- **Home and the waitlist no longer share an h1.** The acronym line is Home's; on the waitlist it is a display line under a small h1 that says what that page is.
- **Screenshots are files, not optimizer requests.** Each capture has smaller copies made once and committed (`scripts/shot-sizes.mjs`, `lib/shot-sources.ts`), served in a `srcset`; `public/_headers` lets a browser keep them, and Next's fingerprinted files for a year.
- **What is dated appears with a deploy, and launch day is written down.** `docs/architecture/runbooks/LAUNCH_DAY_17_OCT.md`. In open mode `/waitlist` moves to sign-up for good (301), and help.saroh.in answers 308 once the running build has Help (it asks the build's own moment, `SAROH_BUILT_AT`, not the clock).
- Open, for the owner: the phrases themselves (they are a first reading of what an owner in India types, with no search data behind them yet); screenshots for both new pages; whether production has the hosting variables the own-domain claim needs (W4); and the three ledger rows found stale and left alone (BK2, CAP2, LP6).

## DEC-141 The starter has everything a business has switched on, the system pages are part of it, and every existing starter site gets the new look

**Status: Accepted — 2026-10-12** · owner (three decisions, after an audit of the starter site and the customer's side of it) · builds on [DEC-090](#dec-090-a-template-carries-its-own-exact-palette-and-type-scale), DEC-057, DEC-069 (L13), DEC-070, DEC-135

- Context: with the template choice switched off (DEC-135), every new business's website is the starter. It looked unstyled and half empty: the system font, one accent, three of twenty section types, nothing of what the business sells or books, no hours or place, and under every headline a note to the owner ("Say what you do and where, in one line.") that customers read.
- **The owner's three decisions.**
    1. **The starter has everything.** Every page, section and flow a business site can have, each shown only when the business has it: its module on, its data there.
    2. **The system pages are in scope**: the shop, a product, the bag and checkout, an order, booking, the customer's account, the header and the footer. A change to them reaches every site that has those features on.
    3. **Every existing starter site gets the new look**, not only new ones.
- **`starter@4`** (`packages/templates/src/templates/starter-v4.ts`), beside v1 to v3, which are never edited.
    - **A look of its own** (`starter-look.ts`): three colourways with exact palettes (Stone, the default; Harbour; Clay), Source Serif 4 over Inter, a type scale (56px display, 17px body, a 64-character line in a 1120px column) and roomier spacing. Each choice is reasoned in the file. It adds no font: both faces were already loaded.
    - **Home follows the modules**, in this order, each only where its condition holds: the headline with the business's line and one button; a product grid (it sells online); a services list (Bookings on, with a service); the week's classes; plans; class packs; "Good to know" (what a visitor can do here, from what is on, with two or more to say); the place with its hours and directions, or the hours alone; and a closing section.
    - **One primary action**, from what is on: Book where it takes bookings, the shop where it sells online, otherwise the Contact page. The same rule, order and addresses as the header's own button (`sitePrimaryAction`). The headline's button and the closing band carry the same one; nothing else on the page asks for anything. The template gives the closing band its button alone: the call-to-action block writes the band's heading and line from where the button goes. Where a message is the action, Home ends in the message form itself and has no band above it.
    - **Module pages are made by the one path that makes them** (`addModulePageIfMissing`): the manifest only names which a business gets (`modulePages`: Shop, Book, Prices, and always Contact). So a site made today and a site whose business switches the module on next month hold the same page.
    - **Nothing is written that is not true of this business.** The stock paragraphs go. Every sentence is the business's own fact or says only what the page below it shows. Where there is nothing true to say, the section, or the page, is left out: no About until there is a line and two facts to put on it; no testimonials, since the block holds typed quotes and the starter has none; no Journal page until there are posts.
    - **It needs no photograph**: a centred headline, a price list rather than cards. Two image briefs say which photo to add where; a brief is never drawn on the live site.
- **The business's line is composed, not asked for.** Nothing ever told a template what a business does, so the headline's line could only be a prompt. The business has already said it: `buildTemplateContext` joins its services' names (where it takes bookings) or the categories it has products on sale in, and its town, in its own words and spelling ("Haircut, Colour and Bridal styling in Bengaluru", `composeBusinessLine`). Nothing named, no line. **No new question is put to the owner and no column is added**; the headline's line stays theirs to rewrite in the editor. A field of its own, asked once at setup, is the next step if composed lines read poorly in practice.
- **A note to the owner can no longer go live.** The pre-publish check raises a blocking flag for a headline line that is still v3's prompt, and publishing is refused in the same words (`hasOwnerNote`). The first three starters' stock sentences, and two Personal lines the check missed, are named as placeholders (advisory, as every placeholder is: a sentence the owner decides to keep is theirs).
- **Personal and Portfolio** (the templates "Just me" and "A site for my work" start from) get a second version in the starter's look. Their pages, and the placeholder lines in them, are unchanged.
- **A site follows its business's modules** (`sites/template-sync.ts`). Switching a module on, by any route, brings a site whose template follows the modules the module's page and its Home section, in the switch's own transaction. A Home nobody has edited becomes the Home a site made that day would have; an edited one gains only the bound section. It is never the reason a module cannot be switched on: the site's changes sit in a savepoint, and if they fail they are undone alone, the switch commits and the failure is logged.
- **Existing sites are upgraded in the draft, never live** (`sites/template-upgrade.ts`, run by hand: `docs/architecture/runbooks/TEMPLATE_UPGRADE.md`). The rule is to never destroy something a merchant wrote or chose.
    - **Look**: applied when the site's style is still the one its template started it in. A style the owner changed is kept, and Website › Style then offers the new colourways, since they are its template's.
    - **Footer**: applied when the site's footer is still its template's.
    - **Pages**: a page nobody has edited becomes the new version's. A page somebody edited keeps every section, in its order, and gains only the bound sections it has nothing like (a product grid, a services list, the place): they show the business's own data and carry no words of the template's. A heading, a paragraph or a button is never added to an edited page. The one thing taken off an edited page is the note to the owner.
    - **"Edited" is read from data.** A page is untouched when its draft has never been saved (its revision is 0; every save goes through one write that counts it), or when its sections equal what its template produces for the business. Anything else is edited.
    - **A page the new version no longer makes** (v3's About, for a business with nothing yet to put on one) is hidden if untouched, never deleted.
    - **The record** moves to the new version in the same transaction, with an audit event (`site.template.upgrade`, actor `system:template-upgrade`, counts only). That is also what makes a second run skip the site.
- **Why the draft, even for a site nobody touched.** A live site is its Publication: an immutable snapshot of its pages, style and footer together, put live by a person through one path that also holds "Publishing needs approval" (DEC-071). A publish made by nobody would have no author, would step round that setting, and could not carry the look without the pages. So the owner opens the editor, sees the new look with changes waiting, and publishes. Nothing live changes, so no kept page is told to stop serving.
- **Open.**
    - A live site that still shows v3's prompt keeps showing it until its owner publishes: the snapshot is immutable. The fix that reaches those visitors today is in the hero block (do not draw a line that `isOwnerNote`), which belongs to the blocks' own change.
    - Owners are not told their draft has a new look waiting, beyond the changes shown in the workspace. An inbox notice is the obvious addition.

## DEC-144 Updates in Messages are on for every business, and each business can turn them off

**Status: Accepted — 2026-10-12** · owner ("all businesses, and they can select")

- Context: a customer's account on a business's site has a Messages tab. Saroh's own posts into it (an order's steps, a booking moved or cancelled, an invoice sent) were behind the instance switch and a per-business rollout flag that is off until an operator sets it. A business with no email provider has no other way to tell a customer their order is ready.
- **On for everyone when customer accounts go live.** The operator turns the `ACCOUNT_THREAD` rollout flag on for every business from the console. The flag's default and how rollout flags resolve are unchanged.
- **Each business can turn its updates off, and on again**, on Settings › Providers ("Updates in Messages", `comms:manage`). The choice is `BusinessProfile.accountUpdates`, on by default.
- **Saroh posts only when three things hold:** the account area is on for the instance (`SITE_ACCOUNT_AREA`), the rollout flag is on for the business, and the business has not turned its updates off. The rule is one function, `accountThreadOn`, and every caller goes through it.
- **Off stops only Saroh's own posts, from the next one on.** What is already in Messages stays, customers can still write, the team's replies still reach them, and so does a note a team member chooses to send when changing or cancelling an order.
- **With updates off, each update goes as it did before Messages was live:** by email through the business's own provider where one is connected, otherwise not at all, and the workspace says so.
- **The row is shown only while the choice can have an effect**, and it tells a business with no email provider what turning it off costs.
- Amends ADR-011's "always goes into their account".
- **Open.** The email prompt on Providers and Home still says "Your customers see their updates only in their account", which is untrue for a business that turned updates off.

## DEC-145 Test mode is a test business behind a Live / Test switch

**Status: Accepted — 2026-10-12, not built** · owner (asked for a test environment like a payment provider's, and agreed the test business) · tracked in #939

- Context: an owner trying Saroh has nowhere safe to take a payment, issue an invoice or send a confirmation. Trying it for real issues a numbered tax invoice and can message a real customer. The same need comes with the public API and MCP: a developer or an agent needs a place to try calls.
- **A test business, not a mark on every record.** Each business gets a twin, and a Live / Test switch in the header moves between them. The business is already the tenant root (ADR-001), so the twin is isolated by the same wall that separates two businesses. A live/test column on every order, booking and invoice would make every read in the API filter by it, and one missed filter would show test data to a real customer.
- **What a test business does differently:** payments use only the provider's test keys; emails and WhatsApp go only to the owner and the team; invoices are marked TEST and use their own number series, so the live series keeps no gaps; the site is labelled and not indexed; it does not count against the live business's limits; it can copy the live business's setup without its customers, and it can be reset.
- **A test key belongs to the test business and a live key to the live one.** A key never crosses.
- **When:** after early access opens, planned together with API keys. Nothing is built by this entry.
- **Open.** One test business per live business or several; which roles see the switch; what "copy my live setup" does when the live business changes later; whether a provider's test-mode webhooks need their own endpoint or secret.

## DEC-146 A GST-registered business gives every priced item a GST rate, and decides whether its prices include GST

**Status: Accepted — 2026-10-12, built** · owner ("the business add their prices, and decides the GST is inclusive or exclusive… they should have freedom to decide") · amends ADR-008

- Context: a tax invoice went out with no tax on it, because the service had no GST rate. A missing rate was read as "no GST".
- **No rate is "not set", never 0%.** For a GST-registered business the rate sits beside the price and is required with it. An item priced before this keeps working until someone bills it: a staff-raised invoice or pay link for an unrated item is refused (`GST_RATE_MISSING`) and the rate is asked for in place, in the screen that was open. A notice lists what is still unrated, and one sheet sets them, with "One rate for all".
- **The business chooses how it prices.** One setting for the business, "My prices include GST" (the default) or "GST is added to my prices", and each item can say otherwise. Included: ₹1,000 typed is ₹1,000 paid. Added: ₹1,000 typed is ₹1,000 plus GST paid. Saroh does not choose for the business.
- **The customer sees the GST before paying.** Under "added", the booking page, product page, bag and checkout show the price, the GST and the amount to pay.
- **One sum.** The API works out the charge in one place (`invoices/gst-price.ts`); the sites and the app only format what it returns.
- **Who can set a rate:** whoever can set the item's price. A rate is part of a price.

## DEC-147 Memberships, class packs and courses charge GST from the next invoice

**Status: Accepted — 2026-10-12, built** · owner ("it should be charging from the new invoices, already added ones wont be edited")

- Plans, class packs and courses carry a GST rate and a price mode, as services and products do (DEC-146).
- **New invoices only.** An invoice already issued is never edited. A renewal raised after the rate is set carries it, so a member's renewal amount can change under "added"; the plan editor says how many members that reaches.
- Not built: telling the member beforehand that the renewal amount changes.

## DEC-148 GST is part of the MRP

**Status: Accepted — 2026-10-12, built** · owner ("the GST is part of MRP")

- An MRP includes all taxes. The amount a customer pays for one, GST and all, is never more than the product's MRP.
- The product editor and the import refuse a price that goes over once GST is added. Switching the whole business to "GST is added" is refused while any product would go over; the sheet names the first few and says how to put each right.

## DEC-149 One figure, one kind; the invoice prints the price as typed

**Status: Accepted — 2026-10-12, built** · owner (confirmed the typed price as the rate on paper; agreed the figures should be consistent)

- **Money taken or expected is the amount to pay.** Sales totals, order totals, what a customer owes: all with GST.
- **A price being set is the typed price**, with "+ GST" beside it when GST is added. Two figures compared on one screen are the same kind.
- **On paper under "added", the rate column is the price the business typed**, GST is its own line, and the total is the amount to pay, with "GST is added to these prices."
- Open, for the accountant: rounding GST per unit or per line, and whether a discount comes off before or after GST.

## DEC-150 Prices keep a history

**Status: Accepted — 2026-10-12, built** · owner ("prices for products should have history… this way merchant can see the rate changes")

- Every change to a price, an MRP, a GST rate or a price mode on a product (and its options), a service or a course is recorded in the transaction that makes it: what it was, what it is, who, when. The item's first entry is what it was created at.
- The item's own page shows it as "Price history", newest first; nothing is drawn for an item with no history yet. Settings › Activity lists the changes with every other change to the business.
- History starts from this release. Earlier changes were not recorded and are not invented.
- The audit action `gst-rate.set` is no longer written; `price.changed` covers it. Rows already written still read.

## DEC-151 A site on its own domain answers there only

**Status: Accepted — 2026-10-12, not built** · owner (chose the redirect over serving both addresses)

- Once a business's own domain is connected and live, its `saroh.app` address redirects to it, path for path, with a temporary redirect (307) so a domain that is later removed leaves nothing cached.
- Not redirected: test hosts, pay links and previews.

## DEC-152 Bookings: the diary, hours and services each answer one question

**Status: Accepted — 2026-10-12, built** · owner (agreed the audit and a combination of its references)

- **Calendar** shows who is booked when; a short booking keeps to one line and an empty filter offers "Show all".
- **Availability** is where a person's hours are set, with a preview of the week a customer would see.
- **A service says what gives it its times** in a card of its own: the people who take it, or its own weekly hours for a class or a service nobody takes yet. It is not under "More settings".
- A task is finished where it was opened (rows read first, edit in a sheet); no screen sends the merchant elsewhere halfway.

## DEC-153 Subscriptions opens on who needs you, and plans are rows

**Status: Accepted — 2026-10-12, built** · owner (agreed the audit and all four units)

- Payments › Subscriptions lands on renewals that aren't paid when there are any, and the header leads with how many and what is unpaid; otherwise it lands on Active. A view someone chose (`?view=`) always wins.
- Where a subscription stands is the shared list's one dropdown with counts, not tabs or tiles.
- Plans are rows of the shared list with views Live, Archived, Drafts and All; the tab's badge counts live plans only. Archive and Sell again are in the row's menu.
- "Members can pause from their account" and "When autopay charges" are read-first rows under the list, each edited in its own sheet.
- When renewals last ran is said only when they are late.
- An amount that recurs is written "₹900 a month" everywhere; "₹900/mo" only in a column that is narrow on a phone.
- A plan's editor opens on its first unanswered question, and says what a price change does where the price is changed.

## DEC-154 Early access opens by the clock

**Status: Accepted — 2026-10-12, built, not yet rehearsed** · owner ("that should happen without me interfering"; "one time launch schedule is fine")

- Early access opens on 17 Oct 2026 at 16:00 IST without anyone acting at that moment. One instant, `LAUNCH_AT`, is written in the production vars of saroh.in, accounts and the workspace, the same in each (`check:deploy-env` refuses a difference, and refuses one in development).
- **Accounts opens at runtime.** Its prelaunch gate reads the clock on every request and steps aside at the instant, with no deploy. A value that cannot be read keeps it shut.
- **The site and the workspace open with a build.** A production build made at or after the instant is given its launch switch (`NEXT_PUBLIC_LAUNCH_MODE=open`, `NEXT_PUBLIC_PLANS=on`) by `scripts/cf-env.mjs`. A switch written in vars still wins. The build fingerprint changes at the instant, so any later deploy opens what is not yet open.
- **One exception to "no scheduled deploys" (DEC-107), once.** Two scheduled runs of `deploy-frontends.yml` on 17 Oct 2026 only: the first starts early, waits for the instant and deploys every app; the second deploys only what is still unopened. Both do nothing in another year and are deleted after launch. The rule stands for everything else.
- Plans show in the workspace at launch, which DEC-136 left open.
- Moving or cancelling: `docs/architecture/runbooks/LAUNCH_DAY_17_OCT.md`. The hand steps there remain the fallback.

## DEC-155 Everyone in a business uses one team seat, whatever their role

**Status: Accepted — 2026-10-13, built** · owner · supersedes the view-only part of DEC-105 and the Reviewer rule of #794 · amends DEC-114

- Context: since 6 Oct (#794) Reviewers were left off the team count, and since DEC-105 anyone whose role only looks used no seat and counted toward a separate limit of their own (the catalogue's `reviewers` row, "View-only people").
- Decision: every person in a business uses one team seat, whatever their role: Owner, Admin, Member, Reviewer and any role the business made. There is no free or separate allowance for people who only look. The team count is every team member, every open invitation, and everyone on the diary who takes bookings with no login (DEC-111, unchanged).
- The Reviewer role itself is unchanged: the same permissions, and still the sites it is invited to.
- Consequences:
    - Inviting anyone, a Reviewer included, is checked against the one team limit. A change of role, of a role's permissions or of someone's extra permissions never changes the count, so none of them asks the plan.
    - The `reviewers` row is retired from the catalogue (`RETIRED_MODULE_IDS` in `@saroh/pricing-catalog`), with its limit key, its words and its place on Team, Plan and the pricing table. A version published while it was sold still carries the row in the database; every reader drops it on read, so it shows, counts and caps nothing. No migration, and no stored row is rewritten.
    - Moving to a lower plan (DEC-114): the owner always stays, then the earliest to join up to the limit, Reviewers placed by when they joined like anyone else. A limit of one keeps the owner alone.
    - The move-down notice's claim is keyed by the limits it named, which no longer include a view-only one. A business told under the old key is told again and gets its 7 days again before anything pauses.
    - The member, invitation and role views no longer carry `usesSeat`.

## DEC-156 Who referred a business is recorded when the business is made

**Status: Accepted — 2026-10-13, built** · owner (record it from launch, so referrals made before the referral programme opens are known) · builds on DEC-102 · #809, #810 are not built by this

- **What is recorded.** A visitor who reaches saroh.in by a business's referral link (`?ref=`, the "Made with Saroh" credit of DEC-102) and later makes a business has that fact kept on the new business: which business referred it and when (`Organization.referredByOrganizationId`, `referredAt`). Nothing else of a referral programme exists yet.
- **Written once.** Only as the business is made. Nothing changes it afterwards.
- **How the code travels.** saroh.in keeps the code in one first-party cookie, `saroh_ref`, on the domain it shares with accounts and the workspace, for 90 days. The workspace's server reads it as the business is made, sends it to the API with the business, and clears it once the business exists. It is functional: set whatever the cookie notice was answered, holding the eight characters from the link and nothing about the visitor, and never given to an analytics, advertising or recording tag. The address it came from is still cut before any tag loads (DEC-127).
- **The last link wins** in the browser. A page cannot tell a real code from a mistyped one, so a newer link replaces an older one.
- **The API decides, from the database.**
    - A malformed or unknown code, or a deleted business's, refers nobody, and the new business is made all the same. The caller is never told which.
    - Nobody refers themselves: someone who is already in the referring business, in any role, is not recorded as referred by it. A business can never name itself (a CHECK on the column).
    - One level: only the business whose code was carried is recorded.
- **A waitlist entry's id is not a business's code.** Both arrive as `?ref=` and look alike, so they are told apart by table, never by shape. saroh.in keeps no code from the waitlist page, where `?ref=` is an entrant's id. The waitlist looks for an entrant first and a business only when there is none. Setup reads businesses only, and a code that is also an entrant's id refers nobody.
- **Until sign-up opens, the waitlist keeps it.** Someone who arrives by a business's link and joins the waitlist has that business kept on their entry (`WaitlistSignup.referredByOrganizationId`). When they make a business with no code in the browser, the entry's is used, found by the account's confirmed email. A code the browser carried comes first.
- **Who sees it.** Operators, on the business's page in the console: "Referred by ‹business›" and the day. No business is shown who referred it or whom it referred, and no screen or message says anything follows from a referral.
- Consequences: three nullable columns, an index and a foreign key (`20261122100000_organization_referred_by`). `POST /organizations` takes an optional `referralCode` and never refuses it, so the API is released before the workspace sends one. The rules are `apps/api.saroh.in/src/modules/organizations/referral.ts`; the cookie is `apps/saroh.in/lib/referral.ts` and `apps/app.saroh.in/lib/organizations/referral-carry.ts`. The Privacy Policy's Cookies section does not yet name this cookie: the owner's text to settle before launch.

## DEC-157 An add-on is priced and capped for the plans it names

**Status: Accepted — 2026-10-13, built** · owner (packs and extra seats cost differently on each plan, and each plan has its own ceiling on how many can be held)

- An add-on in the catalogue may name the plans it is offered on (`plans`) and the most of it one business may hold (`max`). Naming no plan means every plan, and no maximum means the ceiling for any add-on (`MAX_ADDON_QUANTITY`), so a catalogue published before this reads as it always did.
- "The same thing at another price on another plan" is two add-ons of one kind, each naming its plans, with its own price and maximum. The operator sets all of it in Admin › Plans › Offers; nothing is released.
- A plan has one price for a thing. A catalogue does not validate when two add-ons of the same kind (and the same module, for a module on its own) are offered on the same plan, when an add-on names a plan that isn't there, or when a maximum is below 1 or above the ceiling.
- A business sees and buys only the add-ons offered on its plan. More than the maximum is refused in words; the pricing page shows a plan-specific add-on under the plans it names, and not at all when none of them can be chosen.
- **A maximum never takes anything away.** A business that holds more than a maximum set since keeps all of it, is charged for all of it and has all of it in its limit; it can hold fewer, and cannot buy more.
- **A change of plan ends the add-ons the new plan isn't offered.** They end with the old plan (an upgrade, a move at the period's end, a move from a publish), and the new plan's own add-on is never bought for the business: it chooses that in Settings › Plan. What a period already owed is still charged, as when an add-on is removed by hand. An add-on held on a plan it isn't offered on counts for nothing and is charged nothing, whatever path left it there.
- **The business is told before it confirms.** The change-plan quote names the add-ons held today that the change ends (`addonsEnding`: the add-on, how many, and the new plan's own add-on of that kind when it can be added there), and the dialog says so in a note above Confirm. No price is shown for the new plan's add-on, since it is not being bought. The quote and the change share one rule (`addons-ending.ts`), so the note cannot name anything the change does not end. A move to a free plan, or a checkout that starts afresh, names every add-on held.
- **The operator sees it.** Each add-on a plan change ends is written to the audit log after the change commits, as `organization.plan.addon.changed` with what was held, `to: 0` and `reason: "plan-change"`. The actor is whoever made the checkout, the billing provider for a move its event applied, or the hourly sweep. No email is sent for it.
- Rules: `packages/pricing-catalog/src/schema.ts` (`addonOfferedOn`, `addonMaxQuantity`), `apps/api.saroh.in/src/modules/billing/offers.ts` (`addonProblem`), `addon-charges.ts` (`endAddonsNotOfferedInTx`, `recordAddonsEnded`), `addons-ending.ts` (`addonsNotOffered`, `addonsEndingWith`). `PRICING_ROLLOUT.md` › "Trials, yearly, coupons and add-ons (U16)".

## DEC-158 A plan caps how many variants one product may have

**Status: Accepted — 2026-10-13, built** · owner (decided the cap; "variants do not count towards the product limit")

- A plan may cap the variants of **one product**: a small number on the free plan, more on each paid plan. The numbers are the catalogue's, set per plan in Admin › Plans on the row `variants`, and raised for one business with a limit override. None is written in code.
- **Variants never count as products.** The products limit counts products; this is its own cap, inside each product.
- **It is a cap inside one thing, not a count across the business** (`MODULE_MAP.variants.within`). So it has no usage meter, no "used X of Y", no notice at 80%, and nothing is ever "over" in total or paused for it. The one thing that happens: a save that would take a product past its cap is refused, with the usual plan-limit notice and its way to another plan.
- **Nothing is removed and selling is never blocked.** A product that already has more than the cap (made before it, or after a move to a lower plan) keeps every variant, keeps selling, and is still edited, reordered and made smaller. Only adding one more is refused while it is at or past the cap. A copy of such a product is refused too, since the copy would start past the cap; the original is untouched.
- **The row is a limit, never a lock.** A plan whose cell has no number, or leaves the row out, caps nothing. A catalogue version published before the row existed caps nothing either, so no business loses the ability to add variants when this ships.
- A catalogue made before the row is offered it on the Modules tab ("Add Variants row"). It arrives with no limit on any plan and hidden from the pricing page, so nothing changes until a number is set and the version is published.
- Only behind `PLAN_ENFORCEMENT`, and fail open as every limit is: a plan that can't be read refuses nothing.
- Code: `billing/item-limits.ts` (the rule), `products/variant-cap.ts` (the two writes that add a variant: a new variant, a copy), `itemLimitNotice` in `@saroh/pricing-catalog` (the words, shared with the editor).

## DEC-159 The first-month offer is its plan's; a dearer plan starts today, anything else when what was paid runs out

**Status: Accepted — 2026-10-13, built** · owner (after a test payment on the dev environment: a business in its first month moved between paid plans, each time with nothing charged, and so used the dearest plan for the first month's amount) · amends DEC-093

- **The first-month offer belongs to the plan it is set on.** The catalogue says which plans carry one. A plan without it starts at its full price from Free, charged as it is authorised.
- **Once per business.** A business has the offer when it first starts a paid plan that carries it, and never again, whatever happens after (`hadTrial`, as before). No plan chosen during a first month gets a first month of its own.
- **Moving up during the first month starts today at the full price.** A plan that costs more a month than the one the business is on ends the first month there: its full first charge is taken now and its 12-month term starts now. What the first month cost is not refunded and not set against it. Nobody uses a dearer plan for the first month's amount.
- **Moving down during the first month waits for the month to end.** A cheaper paid plan, or Free, takes effect when the first month ends and never at once. The business keeps the plan it started until then, and nothing more is charged for it.
- **No refunds, so a move down never comes before what was paid for has run out.** In a paid period a cheaper plan, the other cycle or Free takes effect at the end of the cycle already paid. The business keeps its plan until then, and the screen says the date.
- **Upgrades in a paid period start today**, paying the difference for the rest of the period, as before.
- Decided in the same spirit:
    - **The same price is not a move up.** A different plan at the same price waits for the end of the first month, as it waits for the end of a paid period.
    - **Yearly during the first month** follows what the plan costs a month: a dearer plan's year starts today, as one payment. The year of the plan it is on, or of a cheaper one, is paid now and starts when the first month ends.
    - **Cancelling during the first month** is the move to Free: the plan runs to the month's end, nothing more is charged, then Free.
    - **Free first days** (a first month that costs nothing) follow the same rules.
    - **A change that waits is replaced by the next change.** Free chosen instead gives up the plan that was authorised for the date. A dearer plan chosen instead starts today and nothing waits any more. A plan that waits and whose autopay is then withdrawn at the provider becomes Free on the same date, because nothing would pay for the plan the business is on.
    - **A change that already waits has no way to undo it on the screen** other than choosing another plan. The plan it is on reads "you're already on" it, as before this decision. Wanted next: a way to keep the current plan.
    - **Add-ons.** A dearer plan started today starts afresh, like any plan started at its full price: every add-on held ends with the first month and nothing owed for them is charged. A plan that starts at the month's end keeps the add-ons it is offered and ends the rest (DEC-157). Free ends them all. The quote names what ends before the business confirms.
    - **A coupon** is for a checkout that starts a plan. It can be used on the dearer plan started today, and not on a plan that waits. One used on the first checkout is not carried to another plan, and since it was never redeemed it can still be used.
    - **The provider's side ending early never cuts a plan short.** If the provider's subscription ends before the date the business's move waits for, the plan stays to that date.
- **The business is told before it confirms.** The quote and the dialog say "Starts today" with what is paid now for a move up, and "From ‹date›: you keep ‹plan› until then" for anything that waits. The plan picker says the same on each row.
- **Supersedes in DEC-093:** nothing of how a plan is paid. It replaces what was built on it: another paid plan chosen during the first month kept the first month and moved the business at once with nothing charged, and Free during the first month took effect at once. DEC-093's "Cancel before the month ends and you pay nothing more" stands, and the plan now runs to the month's end.
- Consequences:
    - A business in its first month when this ships is not moved or charged by it. Its next change follows these rules.
    - The first month's provider subscription is cancelled at once when the business leaves it, in every case, so the full charge due at the month's end is never taken for a plan the business has left. Saroh keeps the plan running to the date by itself, and the hourly sweep or the new plan's first charge applies the move.
    - No schema change. The quote gains `firstMonth` (`NOW`, `AT_END` or null).
    - The Terms and the Refund and Cancellation Policy do not say that moving up during the introductory month is charged in full that day. The owner's text to settle.
- Rules: `apps/api.saroh.in/src/modules/billing/change-timing.ts` (`paidUntil`, `firstMonthEnd`, `firstMonthMove`, `leavesWithCycle`, `runsToMoveDate`), read by `checkout-quote.ts`, `checkout.service.ts` and `billing-webhook.service.ts`. The words: `apps/app.saroh.in/lib/saroh-billing/quote-words.ts` and `plan-view.ts` (`pickerRows`, `waitingMove`). `PRICING_ROLLOUT.md` › "During the first month".

## DEC-160 Page visits in the workspace and on saroh.in

**Status: Accepted — 2026-10-14** · owner ("turn on PostHog web analytics on saroh.in and in the workspace, so I can see which pages people spend time on") · supersedes in DEC-125 only Decision 7's "no pageviews"; see [ERROR_TRACKING_AND_UPTIME.md](./ERROR_TRACKING_AND_UPTIME.md) → Page visits

- Context: recordings show how one person used a page. Nothing said which pages are opened most, or how long people stay on them, on the site or in the workspace.
- Decision 1, **`$pageview` and `$pageleave`, and nothing else new**: a view for the first page and each page after it, and a leave when the tab goes, so the time on a page is known. Still no autocapture, heatmaps, dead clicks, surveys, feature flags, network or console capture, and no `identify()` with personal data. Still nothing in the browser of accounts, the admin console or a merchant site (`check:merchant-site-tracking` now refuses the page-visit switch and call there too).
- Decision 2, **the same people as the recording, by the same rules**. The workspace: a signed-in person who shares usage ("Help improve Saroh", one choice for recording and page visits) and has been shown the notice, in the shell or the goal picker, with neither Do Not Track nor Global Privacy Control; by internal user id and organization id only. saroh.in: only after the cookie notice's first answer is accepted (the one Google Analytics and the recorder wait for), never in a Saroh team browser, never with Do Not Track or Global Privacy Control, never on a pricing draft preview or the sign-up hand-off; about nobody.
- Decision 3, **the app names the page; the address bar is never read**. The workspace sends the route's shape (`/commerce/orders/[orderId]`, from Next's own parameters), so no record's id, token or business name leaves, and never the tab's title. saroh.in sends its public path and only the query its tag allow-list keeps (`lib/page-address.ts`). The referrer, where the session began and every person property are dropped at the last gate (`pageBeforeSend`). posthog-js's own `history_change` capture is not used: it reads the address as it changes, before the app knows the route.
- Decision 4, **one PostHog instance with the recorder**, so a page's visits and its recordings share a session id, and a visit is sent for a session whose recording was sampled out. Each has its own switch.
- Decision 5, **nothing stored; no cookieless mode**. `persistence: "memory"` as before. On saroh.in a "visitor" and a "session" in PostHog are therefore one page load and what is browsed from it: time on a page and views per page are right, unique visitors are over-counted, and Google Analytics remains the visitor count. PostHog's cookieless mode would count a visitor once a day with nothing stored, but posthog-js sends no recording in that mode and makes its sessions on PostHog's side, which would cut page visits off from recordings (Decision 4); it also needs a project setting and the visitor's IP address for its hash.
- Decision 6, **switchable per environment**: `NEXT_PUBLIC_POSTHOG_ANALYTICS` (`on` | `off`), `on` in the production `vars` of the workspace and saroh.in, `off` in development's. No key, nothing, as ever.
- The words: the workspace's notice now reads "We record how Saroh is used and which pages are opened, to make it easier. …", and the setting "Share how I use Saroh and which pages I open (…)". saroh.in's cookie notice is unchanged: "records how the site is used" covers it.
- Consequences: these events count towards PostHog's free monthly allowance of product-analytics events; a person profile exists for each workspace user's internal id, with no properties set by Saroh. Owner, outside the repo: the Privacy Policy's "What we collect" and "Cookies" must say so before the production deploy (`apps/saroh.in/content/privacy.ts`, the owner's text).
- Rules: `packages/error-tracking/src/browser.ts` (`pageBeforeSend`, `BrowserTracking.pageview`), `apps/app.saroh.in/lib/usage-sharing/route-shape.ts`, `apps/saroh.in/lib/tags.ts` (`pageRoute`).

## DEC-161 An autopay covers 12 monthly charges; prices can change with 30 days' notice and the business's approval

**Status: Accepted — 2026-10-14, built** · owner · supersedes the 12-month term as a price promise in DEC-093 and DEC-100 (and the Terms' "Your price doesn't change during your term" and "A new price applies only from your next term"); keeps how a plan is charged

- Context: a paid plan was sold as a 12-month term at a fixed price: the provider subscription ran 12 monthly charges, the Terms promised the price wouldn't change during the term, and near its end the business was asked to "pay for the next term". The owner wants to keep the mechanics and drop the price promise, and may later make one approval last longer (60 months, or 10 years).
- Decision 1, **charging is unchanged.** The business sets up autopay (UPI Autopay or card) and is charged monthly. Yearly, while switched off, stays one payment for the year.
- Decision 2, **one autopay approval covers 12 monthly charges, and that is all the 12 means.** It is how long one approval lasts, not a price guarantee. Before it runs out the business is asked to approve the next one with one confirmation (the renewal step, reworded: 30, 7 and 1 days ahead, by email and in the inbox); if it doesn't, the plan runs to the end of what was paid and then moves to Free, as before.
- Decision 3, **the count is one setting, in the pricing catalogue.** `autopay.charges` on a catalogue version, 12 today, edited in Admin › Plans › Offers ("One approval covers N monthly charges") and validated from 2 to 1,200 (the most Razorpay accepted for a monthly `total_count` in test mode on 3 Oct; a UPI mandate's own longest validity is not checked — try a new count with a test payment before publishing it). It changes with a publish, not a release, and is in the change log ("One autopay covers 12 → 60 monthly charges"). A version published before it reads 12. New autopays are made for the count of the version their plan is on; one already approved keeps the count it was made with, because a published version never changes and the count is read from the version of its checkout's plan. No schema change.
- Decision 4, **no price lock.** A new catalogue version may change what a business already on a plan pays. Published with "move them", each such business gets a move at its first billing date at least **30 days** after go-live (7 days, as before, for a move that doesn't change its price), and is told **30 days ahead**, by email (`PRICE_CHANGE`) and in its inbox, and on Settings › Plan and billing from the publish ("‹Plan›'s price changes to ‹new› on ‹date›. Approve the new amount before then. Until you do, you keep paying ‹current›."). The provider never changes an autopay amount by itself: approving is a new autopay for the new amount from the move's date (the existing SCHEDULED checkout).
- Decision 5, **a business that doesn't approve keeps the price it has.** From the date the move waits for approval (`needs-authorisation`): the old autopay keeps charging the old amount, the plan stays, nothing moves it to Free and nothing stops a charge. The screen says "‹Plan›'s new price, ‹new›, was due to start on ‹date›. Approve the new amount to move to it. Until you do, you keep paying ‹current›." Only when that autopay itself runs out does the business face the usual choice: approve the next one (at today's price) or move to Free at the end of what was paid — never cut short because a new price was still waiting (the provider's `completed` event now replaces a waiting "move them" with the move to Free at the period's end).
- The words: no business reads "term", "12-month term", "your price doesn't change" or "pay for the next term" any more. The plan screen, its status line, "How billing works", the change dialog ("Autopay: Covers 12 monthly charges. Before it runs out, we ask you to approve the next one"), the renewal ("Approve your next ‹Plan› autopay") and the emails say: the autopay covers 12 monthly charges; before it runs out we ask you to approve the next one; prices can change with at least 30 days' notice, and then we ask you to approve the new amount. A yearly payment says "year". Admin text names the 30 days and the approval.
- The Terms (the owner's approved sentences, published 14 Oct): "A paid plan is paid monthly by UPI Autopay or card. Each autopay you approve covers 12 monthly charges; before it runs out we ask you to approve the next one, and if you don't, your plan moves to Free." and "We'll give you at least 30 days' notice by email before a price you pay goes up, and ask you to approve the new amount. Until you do, you keep paying the price you have." The sentence on the term's end is folded into the first; "Moving to a lower plan" now says "don't approve the next autopay". The Refund and Cancellation Policy needed no change.
- Consequences:
    - A count other than 12 changes what the Terms say: publishing one needs the owner's Terms text first.
    - "Keep" (they keep their current terms) remains a publish policy: such businesses stay on their version and its price until they change plan or their autopay runs out and they approve the next one at the live price.
    - Businesses already subscribed keep their 12-charge autopays; only the words they read change.
- Rules: `packages/pricing-catalog/src/schema.ts` (`autopay`, `autopayCharges`, `AUTOPAY_CHARGES_*`) and `moves.ts` (`PRICE_NOTICE_DAYS`, `moveNoticeDays`); `apps/api.saroh.in/src/modules/billing/billing-term.ts` (`termCheckoutOf`, `autopayChargesOfVersion`), `price-change.ts`, `pricing/moves.service.ts`, `pricing/move-notice.handler.ts`, `billing-webhook.service.ts` (`completed`); `apps/app.saroh.in/lib/saroh-billing/plan-view.ts`, `plan-status.ts`, `quote-words.ts`; `apps/admin.saroh.in/components/plans/offers/offer-autopay.tsx`. `PRICING_ROLLOUT.md` › "Checkout and term (DEC-093)" and "Price changes (DEC-161)".

## DEC-162 Saroh's own invoice numbers run by the financial year

- Status: Accepted (owner, 14 Oct 2026; the monthly form first agreed that morning was replaced the same day)
- Context: Saroh is a product of Virashi Softwares LLP, which also issues its own invoices from the same GSTIN. GST allows several invoice series from one registration if every number is unique within the financial year, runs in order, and is at most 16 characters (CGST Rule 46(b)), and every series is reported in GSTR-1's documents-issued table.
- Decision: Saroh's invoices to businesses for their plan are numbered `‹prefix›/‹FY›/‹count›`, for example `SA/26-27/0001`: the prefix (a setting, `SAROH_INVOICE_PREFIX`, default `SA`), India's financial year (April–March, `Asia/Kolkata`), and a count of at least four digits that runs the whole financial year and never starts again inside it. Each financial year is one series in `SarohInvoiceSequence`. A number longer than 16 characters is never written: with a prefix of up to three characters a year has room for 999,999 (9,999,999 with two).
- Replaced the same day: `‹prefix›/‹YY›/‹MM›/‹count›` (`SA/26/10/0001`), a count that started again each month. It never reached production; the local test numbers made in it (`SA/26/10/0001`…) stay as issued.
- Not changed: the numbering of the invoices a business issues to its own customers (`invoices/numbering.ts`), which follows that business's own settings.
- Supersedes: the yearly `SRH/26-27/00001` series (a five-digit count). Numbers already issued in it stay as they are.

## DEC-163 Home lists an open order only when it is late or due by tomorrow

- Status: Accepted (owner, 16 Oct 2026), built
- Context: Needs you listed every open order as a task, so a busy made-to-order kitchen (the demo Ammi Ki Barni, some 40 orders in progress, every one within its promised days) read "Needs you 50".
- Decision: Needs you lists an open order only when it is **late**, or **due today or tomorrow**: "due" is the moment it would turn late, by its storefront's own thresholds (B17, DEC-045), and "tomorrow" is the business's calendar day in its time zone. In SQL, the order is late at the start of the day after tomorrow (`lateSql(soonCutoff(now, zone))`). Orders due later, and orders that never turn late (on their way), stay off the list and in Orders; Home says so once beside the count, as a quiet link to the Open tab: "15 things · and 17 more in progress" (or "17 orders in progress" when nothing else needs you) — one line, not a second note. The rail's Orders badge counts the same soon orders.
- Unchanged: the problem cases with rows of their own — not collected, not delivered and unpaid (R34), refunds that failed, renewals not paid.
- Rules: `apps/api.saroh.in/src/modules/home/home-open-orders.ts` (`soonCutoff`, `readOpenOrders` → `count`, `later`), `home.service.ts` (`ordersInProgress`); `apps/app.saroh.in/lib/home/needs.ts` (`inProgressLabel`), `components/home/needs-you.tsx`. The demo kitchen keeps about twenty in progress with a few due by tomorrow (`packages/database/src/seed/showcase/achaar.ts`, `dueOrders` in `demo-shop.ts`).

## DEC-164 A double charge is refunded automatically; a payment after Saroh let go is honoured

**Status: Accepted — 2026-10-17, built; Decision 3 revised twice the same day** · owner ("if they cancel before a month, then we dont refund for now, if we charge twice, the double charge should be sent back, they can request us or it would automatically be refunded to their accounts"; then "we wont pay any refunds from the app, I will do that from razorpay myself"; latest, which stands: "for double charge we can make the payment automatic refund")

- Context: a review found money Razorpay could take after Saroh had let go of what it was for — a checkout replaced or lapsed and approved late, a subscription Saroh ended whose cancel Razorpay refused, a yearly order paid after its checkout lapsed — with no plan, no invoice and no word, and paths where Saroh showed Free while Razorpay kept charging.
- Decision 1, **a cancel is never refunded**: a business that cancels or moves down keeps its plan to the end of what it paid, and nothing is given back (unchanged).
- Decision 2, **a payment Saroh can honour is honoured**: when the business has no other live paid plan for that period, a payment on a dropped checkout or on a subscription Saroh ended or left puts it on the plan it paid for, for the period paid, with Saroh's invoice.
- Decision 3 (latest, 17 Oct 2026), **a double charge is refunded automatically through Razorpay; every other refund stays the owner's, by hand**: a payment that would have the business pay twice for one period (another paid plan is live, the checkout's quote is stale, the business is closing) has its autopay stopped at once, no Saroh invoice written, and a job (`billing.refund.double-charge`) gives it back in full: `GET /payments/:id` first (one already refunded in full is done), then `POST /payments/:id/refund` with no amount (the whole payment). Once per payment, however often the provider repeats the event (a platform audit row is the claim). Refunded: a second audit row, the log `billing_double_charge_refunded`, one email to the people who manage billing ("usually within 5 to 7 working days"), and an admin note on the business naming the refund and the amount. A refusal (4xx) is never retried: the owner gets an admin note "Refund payment pay_… (₹1,180) in Razorpay by hand: the automatic refund was refused (Razorpay's own words)" and an ERROR log. No answer (5xx, network) is retried by the queue, 10 tries with its backoff, the same note on the last. A payment with no id gets a note to find it in the dashboard and refund it by hand. A cancel mid-period is still never refunded, and a refund a business asks for otherwise is the owner's, in Razorpay. History: the first version (morning) refunded automatically; the second ("we wont pay any refunds from the app") made every refund the owner's and left only a note; the latest restores the automatic refund for a double charge alone.
- Rules: `apps/api.saroh.in/src/modules/billing/paid-after-end.ts` (what conflicts), `double-charge.ts` (the claim), `double-charge-refund.job.ts` (the refund, the email and the notes), `billing-webhook.service.ts` (`onDroppedCheckout`, `onLeftCheckout`, `chargedAfterCancel`), `provider-cancel.job.ts` (a refused cancel), `providers/billing-provider.port.ts` (`ProviderRefundCapability`). `PRICING_ROLLOUT.md` › "Money after Saroh let go (DEC-164)", with what to verify in Razorpay.

## DEC-165 One Razorpay customer per business, made at sign-up

**Status: Superseded by DEC-167 (2026-10-18)** · was Accepted — 2026-10-17, built · owner ("make sure to create a razorpay customer when they join the app, and then update the details based on info they fill in for billing, this way we will make sure the data is consistent and we wont create customer again, and make sure that we are able to track down these")

- Context: a checkout asked Razorpay for the business's customer each time with `fail_existing: "0"`, which matches on email and phone, so an owner's two businesses were handed one customer, a customer was only made at the first checkout, and nothing kept its details current or tied it to the business in Saroh.
- Decision: every business has one customer at Saroh's billing provider, its id kept on `BillingCustomer` and copied to every checkout, subscription and Saroh invoice. It is made when the business is created, by an outbox job (`billing.customer.sync`) that never blocks sign-up and skips quietly where the provider's keys aren't set, and brought up to date (name, email, phone, GSTIN) whenever the business's billing details change in Settings › Business or at a checkout. It is made with `fail_existing: "1"` and notes naming the business; an owner's second business with the same email and phone, which Razorpay refuses, is made without the phone, and a business is never handed another's customer. A checkout uses the stored id, making it only if the job hasn't. The address can't be updated on a Razorpay customer (notes are create-only), so it stays on each subscription's or order's notes and on Saroh's invoice. Existing businesses get theirs from a one-off backfill.
- Consequence: every business's name, owner's email, phone and GSTIN reach Razorpay at sign-up, before any payment; the privacy notice's Razorpay row says so in the owner's agreed wording (17 Oct 2026: "Billing you for Saroh: we register your business with Razorpay when you sign up … and keep it up to date"), `apps/saroh.in/content/privacy.ts`, published 17 Oct.
- Rules: `apps/api.saroh.in/src/modules/billing/billing-customer.ts`, `billing-customer-sync.ts`, `providers/razorpay.provider.ts` (`createCustomer`, `updateCustomer`), `packages/database/src/backfill/billing-customers.ts`; `backend-integrations.md` › Saroh billing on Razorpay.

## DEC-179 Admin Billing: all Saroh invoices and subscriptions in the operator console (numbered DEC-163 until 21 Oct; renumbered because Home's open orders took DEC-163 the same day)

**Status: Accepted — 2026-10-17** · owner ("as an admin, where can I see all the invoices generated by us? … this is very important for us, and we should have a way to handle all these subscriptions details for our platform too"; and, the same day, "only Saroh admins may view all invoices")

- Context: Saroh's own GST invoices to businesses (`SarohInvoice`, DEC-162) were listed only to each business, on its own Plan and billing page. No operator could see every invoice, file GST from them, or see every business's Saroh subscription and what the billing provider sent about it.
- Decision 1, **a Billing section in the admin console, read-only**: `/billing/invoices` lists every invoice newest first (number, date in India time, the business, plan and cycle, before GST, CGST + SGST or IGST as stored, total, buyer GSTIN, the provider's payment id), filtered by the month issued (India time), a search across business, buyer and number, and with or without a GSTIN, with the filtered set's totals on top, each invoice's PDF (the renderer the business gets) and the month's CSV for GST filing. `/billing/subscriptions` lists every business's subscription (plan and version, cycle, state, paid until, a pending move or a chosen end, the provider and its subscription and customer ids, when the autopay runs out by `billing-term.ts`, the last invoice), filtered by state, plan, "ending or moving in 30 days", "in their first month" and "payment failed", with counts by state and plan and the monthly figure at list price. A row opens a side sheet with the business's checkouts and the billing provider's events (type and time, never the payload).
- Decision 2, **a new staff permission, `saroh-billing:read`, held by Platform Owners and Billing only** (owner: never Support, Operations, Release manager or the read-only Auditor). Every `/admin/billing/*` route declares it, and `AdminBillingService` checks it again itself, so a route that lost its decorator still refuses. A business's members, owners included, a workspace session and a support-access session for one business open none of it (401 with no session, 403 otherwise). The business's own `GET …/billing/invoices` and its PDF stay scoped to its own organization, unchanged.
- Decision 3, **every read is on the admin ledger** (`billing.invoices.list`, `billing.invoices.export`, `billing.invoice.pdf`, `billing.subscriptions.list`, `billing.subscription.read`), with the filters asked for but never the search text, since an invoice carries the business's billing name, GSTIN and address.
- Decision 4, **no support-access session**: these are Saroh's own documents about a business, and the lists span every business; the permission and the ledger are the control.
- Decision 5, **amounts only from the database**: invoices' stored paise, and the monthly figure from each plan row's `priceCents` (a year's price spread over twelve), ACTIVE and PAST_DUE only, before GST; coupons, custom prices and add-ons are not counted, and the screen says so. No price is written in code.
- The CSV: one row per invoice in number order — document, number, date (India), buyer name, buyer GSTIN, place of supply (state name and code), B2B or B2C, SAC (from the lines), taxable value, CGST, SGST, IGST, total, in rupees with paise. No totals row. A cell a spreadsheet would run as a formula is prefixed with an apostrophe.
- Open: Saroh issues no credit notes and holds no refund of its own charges (nothing in the schema stores one), so every invoice is a paid charge and the CSV's "Document" column always says "Invoice". When credit notes exist they join the same export.
- Rules: `apps/api.saroh.in/src/modules/admin/admin-permissions.ts` (`SarohBillingRead`), `admin-billing.controller.ts`, `admin-billing.service.ts` (`assertSarohBillingReader`), `admin-billing.ts` (month, CSV, MRR, views), `admin-billing-terms.ts`; `apps/admin.saroh.in/app/billing/`, `lib/billing.ts`, `lib/billing-words.ts`; `docs/patterns/backend-auth-and-access.md` → Cross-tenant reads.

## DEC-166 Admin billing controls: Needs action, refunds on record, a daily reconcile and `saroh-billing:act`

**Status: Accepted — 2026-10-17, built** · owner ("we need to store the data so that we can match them in razorpay also, and also update the info there too, this is not good that we are currently not able to process anything and not able to do anything here, like a few things missing. You should check and verify the controls for the admin as well"). Builds on DEC-163 (Admin Billing), DEC-164 (double charges) and DEC-165 (one Razorpay customer).

- Context: a review of DEC-179's console and DEC-164/165 found every money problem the billing code can't solve itself (a refund Razorpay refused, a cancel it keeps refusing, a payment on a dropped checkout) left only as an admin note on one business, readable only with a support session the Billing role doesn't have; no admin control over Saroh's own billing at all; a billing webhook that matched nothing marked processed as "ignored" with no trace; nothing that noticed a charge whose webhook never arrived; refunds and disputes never recorded; and no way to find a business from a Razorpay id.
- Decision 1, **Needs action**: every billing problem an operator must act on is a `BillingAction` row (business or none, a code, the provider's ids, Saroh's words), written beside every billing ops notice (`billing-ops-notice.ts`), by the daily reconcile, by an unmatched webhook and by a refund on an invoice, once per thing it is about where it repeats (`dedupeKey`). Admin › Billing › Needs action lists them across businesses, oldest open first, with the failed `billing.*` jobs beside them (the Billing role has no Jobs screen: `jobs:read` can't be narrowed to billing's jobs). The business directory flags such a business "Billing needs action" (`BILLING_ACTION`) and lists it under Needs attention. "Mark resolved" asks a reason.
- Decision 2, **a new staff permission, `saroh-billing:act`, held by Platform Owners and Billing only**, for every billing write in the console: mark resolved, end a business's autopay, re-check a double charge's refund, sync the Razorpay customer again, record a refund the owner made by hand. Each is a POST with a reason and an idempotency key (`once()`), checked again in the service, on the admin ledger (`billing.action.resolved`, `billing.autopay.ended`, `billing.refund.recheck`, `billing.customer.sync`, `billing.refund.recorded`), and reads where things stand first, so asking twice changes nothing. Never with a support session: it is Saroh's own billing of the business. The subscription sheet carries them, so Billing needs no view-as; "Open the business" shows only to those who hold `organization:view-as`.
- Decision 3, **ending autopay is the business's own Cancel plan, done by Saroh**: the plan runs to the end of what is paid, then Free; Razorpay is told to stop charging; nothing is refunded (owner: a cancel keeps the plan to the end of the paid period). It runs through `CheckoutService` as the operator (`billing:manage` alone, the business's history showing Saroh support), and the people who manage the business's billing get an email (`AUTOPAY_ENDED`).
- Decision 4, **refunds and disputes are on record** (`BillingRefund`, by the provider's refund or dispute id): the automatic double-charge refund (AUTO), one the owner made by hand and an operator recorded against the invoice (MANUAL; the owner refunds by hand in Razorpay, Saroh refunds nothing else), and Razorpay's `refund.created/processed/failed` and `payment.dispute.*` webhooks (PROVIDER), matched to the invoice by its payment. Whichever comes first makes the row; the others fill in and move its status on, never back. A failed refund and an open dispute are raised in Needs action. **Saroh issues no credit note**: a refund or dispute on an invoiced payment raises "a credit note may be needed: ask the CA". After a refused refund the owner refunds by hand and "Check the refund again" re-queues the job: Razorpay answers a payment already refunded in full with that refund, so it records the refund, emails the business and notes it, never refunding twice.
- Decision 5, **a daily reconcile against Razorpay** (`billing.reconcile`): every live provider subscription (and those ended or begun in the last 40 days) is read back (`GET /invoices?subscription_id=`, an order's `GET /orders/:id/payments`). A payment on a Saroh invoice keeps the amount Razorpay took (`SarohInvoice.providerAmountPaise`), also kept from the charge's own webhook, and one that differs from the invoice's total is raised; a payment with no Saroh invoice and no double-charge claim is raised once. It is not invoiced automatically: a charge applied out of order could move a plan Razorpay has moved since, so an operator looks first. A billing webhook that names a subscription or order no business has, or a charge Saroh can't match, is raised with no business and left **not applied**; Admin › Billing › Provider events lists every event, filtered "Not applied" or "No business", with the provider's ids and never the payload.
- Decision 6, **find and link by Razorpay's ids**: invoices are searched by `pay_`, `sub_` and `cust_` ids and subscriptions by business, `sub_`, `cust_`, `order_` or `pay_`; the provider's ids are on each row, in the GST CSV ("Payment id", "Subscription id", "Customer id") and link to Razorpay's dashboard.
- Decision 7, **a closing business's billing can still be stopped**: Admin › Jobs retries a failed `billing.provider.cancel`, `billing.refund.double-charge` or `billing.payment.notes` of a suspended or closing business (`PROTECTIVE_JOB_TYPES`); every other job of such a business stays "unsafe".
- Consequences: Razorpay's webhook must also subscribe to `refund.created`, `refund.processed`, `refund.failed` and the `payment.dispute.*` events (Dashboard › Webhooks; owner to do). Unverified until production's first case: the dashboard link paths (`dashboard.razorpay.com/app/payments/…`, `/subscriptions/…`, `/customers/…`, `/orders/…`, `/refunds/…`, `/disputes/…`; test-mode objects open with the dashboard switched to Test mode), the refund and dispute entities' field names, and `amount_paid` on a subscription's invoices.
- Rules: `apps/api.saroh.in/src/modules/billing/billing-actions.ts`, `billing-ops-notice.ts`, `billing-refunds.ts`, `billing-unmatched.ts`, `billing-reconcile.job.ts`, `invoice-amount.ts`, `providers/razorpay-reconcile.ts`; `apps/api.saroh.in/src/modules/admin/admin-permissions.ts` (`SarohBillingAct`), `admin-billing-controls.controller.ts`, `admin-billing-controls.service.ts`, `admin-billing-actions.service.ts`, `admin-operations.service.ts` (`PROTECTIVE_JOB_TYPES`); `apps/admin.saroh.in/app/billing/actions`, `app/billing/events`, `components/billing/`; `docs/patterns/backend-jobs.md` › Saroh billing, `backend-billing-and-classes.md` › Saroh's own invoices, `backend-integrations.md` › Saroh billing on Razorpay.

## DEC-167 A business pays through a billing profile, one Razorpay customer per profile

**Status: Accepted — 2026-10-18, step 1 built (batch-2026-10-18-1); step 2 the next sprint** · owner ("they can have a profile, but billing email can be different"; "step 1 first, accounts page later"; "once the step 1 is merged, we will then build the step 2, in the next sprint"). Supersedes DEC-165's one customer per business.

- Context: Razorpay refuses a second customer with the same email and phone, so DEC-165 left an owner's second business without a customer (17 of 32 on saroh.io after the 17 Oct backfill). One person often pays for several businesses that need invoices addressed to different GST entities (GST is per state; one state's locations may share a GSTIN or not).
- Decision: a billing profile holds a legal name, GSTIN, billing address with state and a billing email, belongs to the owner who made it, and is one customer at Razorpay. Two of an owner's profiles can't share a billing email (asked before saving). Every business uses one profile; an owner's first business gets one at sign-up, creating a later business asks the owner to keep an existing profile, pick another or make a new one (no silent default: a charged invoice's GST details can't be changed), and it can be switched later in Plan & billing. Editing a profile applies to every business on it from the next invoice. A paid business switched to another profile moves at the next renewal. Subscriptions and payments still name the business in their notes. Only owners see profiles; teammates are never customers.
- Review fixes (18 Oct 2026): creating a later business with no choice sent is refused only when the owner has two or more profiles; with exactly one, the API uses it, so an app from before profiles still works during the release window (the new app always shows the step; this is only the API's default; release note: ship app.saroh.in straight after the API, PRICING_ROLLOUT step 10). A business with no profile chooses one at once even on a renewing plan (nothing to move from). A paid business's switch waits while a coupon still comes off charges to come (409 `discount-running`, "Your discount runs until <date>. You can move to another billing profile after that.") — the minimal default, owner. A profile deleted with its owner's account before a renewal that moves to or bills it: the renewal still takes the new subscription over, leaves the business's pointer as it is (no profile, if it was billed to that one) and raises `billing_profile_gone`; deleting the account raises `billing_profile_owner_left` for each business billed to, or with a payment on, one of the person's profiles, and is never refused for it (`@saroh/auth`'s `onUserDeleting`). The checkout handoff (the provider window's prefill and notes) goes only to whoever holds `billing:manage`, and with another owner's profile carries no email or phone and notes naming only the profile and the business; a quote names the profile only to `billing:manage`. The migration's data move is checked against rows by `pnpm run check:migration-fold` (prepush and CI, after the replay).
- Owner's other businesses (18 Oct 2026, owner): a profile may also adopt a customer its provider already has for the same details when the customer's notes name no profile and name a business the profile's owner owns (an OWNER membership) that is on no profile yet, or is on this one — the per-business customer of DEC-165. Never one whose notes name another profile, a business the owner doesn't own, or a business on another profile, and never one another profile holds. Found on saroh.io, where the seeded owner's profile (no phone, one of twelve businesses) was refused "the provider has a customer with these details".
- Step 2 (next sprint, once step 1 is merged): a Billing profiles page in accounts.saroh.in listing every profile and the businesses each pays for.
- Step 2 as built (19 Oct 2026, #1015, plan 2026-10-18-003): accounts.saroh.in's account area (`app/account/(area)/`, `components/account-area/account-frame.tsx`) holds Profile and sign-in and Billing profiles in one frame; Billing profiles is in its menu only for someone who owns a business or a profile. The list, a profile's own page (pays for, Saroh's invoices with PDFs through the business's own invoice route, details, Remove), Edit and Add side panels and the Move and Remove dialogs are `components/billing-profiles/*`, their words `lib/billing-profiles.ts`. Account-level routes on `billing-profiles.controller.ts` (`billing-profiles-account.service.ts`), owner only, every business named in a path checked as the caller's OWNER membership: a move is the business's own Plan & billing choice run in its RLS context, free now and paid at the renewal, and a paid move only to a profile Razorpay has linked (409 `profile-not-linked`); a move waiting for authorisation is cancelled from the profile it leaves (`DELETE …/businesses/:organizationId/pending`); Remove deletes a profile only while no business and no open or authorised checkout points at it (invoices keep their snapshot). A paid move started from the account then asks for the payment at once (Razorpay's page, else the business's Plan & billing), since nothing emails the owner to authorise it and the checkout lapses in a day. app.saroh.in links in from the "Who Saroh bills" card and the account menu, owners only, in the same tab.
- Consequence: production's customer backfill (PRICING_ROLLOUT step 10) waits for step 1; today's code can be released, as production has no live Razorpay keys or paying customers.
- How it is built (18 Oct 2026): Settings › Business stays the business's own seller identity and is separate from the profile; the first profile copies the business's details once, and saving Settings › Business no longer touches billing. Saroh's invoices take their bill-to (name, GSTIN, address, state, email, phone) from the profile at issue, and their emails also go to the profile's billing email. An account email change no longer touches billing. A profile's owner who stops being an owner of a business on it (moved to another role, removed or leaving) leaves billing unchanged and raises one Admin › Billing › Needs action (`billing_profile_owner_left`): an owner should choose their own profile in Plan & billing. Admin's subscription sheet shows the profile, its customer and the other businesses on it; a `cust_` search finds every business on the profile; "Sync again" queues `billing.profile.sync` for the business's profile (ledger `billing.profile.sync`, was `billing.customer.sync`). A business the data move left without a profile chooses one before it can pay.
- Checkout asks before changing a shared profile and never changes another owner's (owner, 18 Oct 2026): details given at checkout that would change a profile billing more than one business are refused (409 `profile-shared`) until the owner confirms "This changes Saroh's invoices for N businesses." (the button reads "Save for N businesses and continue"); a profile that isn't the signed-in owner's is refused (409 `profile-not-yours`) with a way to choose one of their own. Nothing is written or made at Razorpay first. `checkout.service.ts` (`assertMayChangeProfile`), `apps/app.saroh.in/components/settings/plan-billing/change-plan-dialog.tsx`.
- Rules: `apps/api.saroh.in/src/modules/billing/billing-profiles.service.ts` (owner-only reads and writes, the email rule), `billing-profile-sync.ts` (`billing.profile.sync`), `billing-customer.ts` (one customer per profile; DEC-165's `billing.customer.sync` handler drains into it), `billing-details.ts` (what a charge needs, read from the profile), `checkout.service.ts`, `saroh-invoices.service.ts` (the bill-to snapshot and `billingProfileId`), `billing-email.job.ts` (the profile's billing email), `billing-profile-owner.ts` (the owner-left notice, raised from `organizations/organization-members.service.ts`); `packages/database/prisma/migrations/20261126100000_billing_profiles` (table and data move); `packages/database/src/backfill/billing-profiles.ts` (+ `.cli.ts`); `apps/api.saroh.in/src/modules/admin/admin-billing.service.ts` (`detailExtra`, `subscriptionSearch`), `admin-billing-controls.service.ts` (`syncCustomer`); `apps/admin.saroh.in/components/billing/subscription-billing.tsx`, `lib/billing-words.ts`; `backend-integrations.md` › Saroh billing on Razorpay.

## DEC-168 The admin console is built around the owner's jobs: a tabbed one-view business page, custom offers in place, Releases and Users as list and detail

**Status: Accepted — 2026-10-18, to build** · owner ("the admin panel where I can control is not good… I'm not able to fix anything there"; "the UI should be completely tabbed like we have inside the customers, and the products pages"; "this should give me a one view overview of all the details of a business, and should be easy to update the plan access or other controls for me so that I can give them custom offers if needed"; "People is better we can say them as Users"). From the 18 Oct admin console audit (4.5/10) and its mock.

- Decision: a business page is a header (status, View as the business…, **Give a custom offer…**, ⋯ More actions with Copy id, Suspend…, Schedule deletion…) and tabs like the app's product and customer pages: Overview · Modules · Billing · Website and payments · Team · Notes · History. Overview shows everything about the business in one view, each card with its action. Modules give each module's state, the reason in words from one resolver (release × plan × the business's switch × what it needs) and the one fix. A custom offer is a plan until a date, a custom price, one module, or a limit, each with a reason and a preview of what the business will see, over the existing admin overrides. Releases and Users (renamed from People) are a filtered list and a tabbed detail page. Every change says what it did, with Undo where it can be undone.
- Names: a module's plain name first, its code small below (reverses the 8 Oct Releases choice); "Bookings" for MODULE_APPOINTMENTS everywhere; "Users" for the console's list of sign-ins, "Team" for a business's people.
- Access: Operations and Billing staff roles reach the controls their permissions allow on the business page and the subscription sheet, without a support session. Things only the merchant can change (website, payments, business details) are said so, with steps to send them; staff never edit a merchant's own settings (DEC-021 stands).
- Users get sign-in help: resend verification, mark verified, change sign-in email, a one-time sign-in link, recent sign-in tries and signing out everywhere, each with a reason on the record.
- Rules: added when built (plan 2026-10-18-002, local).

## DEC-169 Saroh's team are account managers: one per business, brought in or assigned, paid a share of what the business pays

**Status: Accepted — 2026-10-18, to build** · owner ("my team would be assigned to leads or connecting with them frequently, and managing as customer relationship manager or accounts manager, and based on that we will make payments to them"; "only one manager per business, as I have to hire a few people commission based"; "the leads will come from website or they can bring themselves by cold calling"). Mock: the Team and team member boards on the 18 Oct admin canvas.

- Decision: a person on the console's Team has a job ("works as": Account manager, Finds new businesses, or another job) separate from their console role. Every business has at most one account manager. The manager comes from how the business arrived: through the manager's own link or id, or because the manager recorded the sign-up email on their lead before the business was made, it is **brought in**. That includes website leads handed to a manager. Otherwise staff **assign** one. The first proof wins: the link carried at sign-up, then an id entered, then the earliest recorded lead email. A business-to-business referral (DEC-156) is still recorded alongside and pays nobody. Moving a business to another manager ends the old link and starts the new one as assigned. The link is append-only history, so who looked after a business, and when, is never lost.
- Leads: Saroh's own sales leads are separate from a business's Leads (the merchant CRM). They come from website enquiries and the waitlist, or a manager adds their own. They move through stages to Won, which links the lead to the business it became. Calls and visits are logged on the lead or the business, along with what the business said about the product.
- Pay: a manager earns a share of what each of their businesses pays Saroh: one rate for brought-in businesses and a lower one for assigned ones. It is counted on cleared payments before GST, for as long as the business pays and has that manager. Free plans, trials, failed and refunded payments earn nothing. Upgrades and downgrades change the amount, not the rate. Commission on a payment becomes payable only once the period it covers has ended with no refund or dispute, and is paid at the end of that month. Example: a period of 21 Nov to 20 Dec is paid on 31 Dec. A refund inside the period cancels the commission, so nothing is clawed back; a refund after payout goes to the owner as a Needs action. A paid first month in a trial earns. Statements are monthly; staff mark them paid with a reference. To prevent claims on businesses a manager didn't bring in, the first manager to record a lead's email owns it, a lead email counts only if recorded before the business was made, and an email marked verified by staff doesn't count. **The rates live in the database, set in the console; they are never written in code, tests, docs or issues** (the repo is public). Earnings are seen only by Platform owner and Billing.
- The business sees its manager: the app's Help shows the manager's name and work email (an Email button), only while a manager is linked. Nothing shows when there is none. The phone is not shown for now (owner, 18 Oct).
- A manager's details (phone, city, languages, joined, reports to, engagement, tax id, emergency contact) are kept on their team record. The tax id is shown only to Platform owner and Billing.
- Rules: added when built (plan 2026-10-18-002 Part 3, local).
    - Brought in (U19, 19 Oct): decided once, in the business's create transaction, and never in the way of it; first proof wins (the `?am=` link, then a typed code, then the owner's own verified email on the manager's lead recorded before the business was made); only a current Account manager, never for their own business; the link is append-only with its evidence. `backend-auth-and-access.md`.
    - Assigned (U25, 19 Oct): Support and Platform owner give, move and end links and Share out evenly (paying businesses first, to Account managers on commission with the fewest, up to their capacity); a move ends the old link and starts an assigned one, so a business brought in becomes assigned once moved; a link ends when its manager stops holding the role (revoke and amend at once, an expiry by the hourly sweep at the moment it ran out). `backend-auth-and-access.md`.
    - Commission (U21, 19 Oct): a line per cleared Saroh payment for the manager linked when it cleared, at the rate then in force for the link's kind, copied onto the line, on the amount before GST; written by a job after the payment's transaction commits and never in its way; pending until its period ends with no refund or dispute open, then payable in that month in India (or the next month not yet paid); held while the provider's amount differs, waiting while no rate is set; a refund or a lost dispute before payout cancels it, after payout raises a Needs action and takes nothing back; Mark paid with a reference locks the month and is never one's own; rates are set in the console from now on, never backdated, and live only in the database. `backend-billing-and-classes.md`, `backend-jobs.md`, `backend-auth-and-access.md`.
    - Yearly payments (owner, 19 Oct): commission on a yearly payment is one twelfth a month, each month payable as its month ends; Saroh sells no yearly plan yet, so this is to revisit when one exists (owner: "we dont have an yearly plan right now, so we can think of later, lets keep the one-twelfth each month for now").
    - No back-pay (owner, 19 Oct): a payment made while no rate was set for its kind earns nothing, for good. Its line stays NO_RATE with no amount, a rate set later starts from its own date and never prices it, and the console says "earned nothing: no rate was set when it paid". A business's own rate (below) is the one exception.
    - A business's own rate (#1035, owner 19 Oct): a Platform owner (`commission:rates`) can give one business its own rate for the manager who looks after it, with an "Earns from" day (the start of that day in India), an optional last day and a reason, on the audit trail. For that manager's payments from that business in its window it wins over the general rate for the link's kind. The earliest Earns from is the later of the business's first paid plan (the day its first Saroh payment with an amount before GST cleared: the earliest invoice `issuedAt` with `taxablePaise > 0`, which is how every line is dated) and the first day (in India) of the month the manager the rate is for took it on (their open link's `startedAt`, owner 19 Oct): "businesses joined without any manager, the commission won't be paid to any manager until they are added to the business, and it will only be paid for the month they are added. Example: a business joins on Nov 1 on Pro, a manager is assigned on Jan 1, then the commission for the business is paid for January, on January 31." "The month counts" (owner, 19 Oct): a payment made in the month (India time) a manager takes the business on earns for that manager, even one that came in earlier that month, so a manager added at 11:00 on 1 Jan after the 00:05 renewal, or on 20 Jan, earns January; one added on 1 Jan earns nothing for a payment on 31 Dec, and earlier months earn nothing. An earlier Earns from is refused ("Arjun took it on in Jan 2027. A rate can start from 1 Jan 2027, the start of that month."), and so is any day for a business that hasn't paid yet. The same holds without an own rate: a payment's line is written for the link open when it was made, and only when none was open, for the first link started later that same month (`linkForPaymentInTx`); a previous manager whose link was open at the payment keeps it. Assigning a manager (one business or Share out) writes the lines of that month's earlier unlined payments in its own transaction (`settleMonthBeforeLinkInTx`), and the sweep's Re-run finds them too, once. "Commission can only be paid for the amount paid by the business": it is on what the business paid, before GST and after any discount or offer (`taxablePaise`); a free month (nothing paid), a refunded payment or a lost dispute earns nothing. Saving it is the only back-pay there is, once: that manager's NO_RATE lines for payments in the window are priced at it and move on (PENDING, HELD, or PAYABLE in the month their period ended or the next unpaid one); a refunded payment stays NO_RATE, lines a general rate already priced keep their price, PAID and CANCELLED lines never change, and the dialog shows the dry run first. One runs per business at a time: a new one ends the one before at its start (or, starting on or after it, before it began), and End… stops it now. General rates still start from their own date and never back-pay. Rules: `commission/own-rate-rules.ts`, `own-rate.ts`, `admin/admin-own-rate.service.ts`; `migrations/20261202100000_business_commission_rate`.
    - Work email (owner, 19 Oct): what a business sees on "Your Saroh contact" is the work email Saroh's team sets on the teammate's page, never the address they sign in with, however they sign in; until one is set the card shows the name alone. Reviewers don't see the card. How a work email gets added (for example asked for when someone is added) is the owner's to decide.

## DEC-170 Bookings: a caller with just a name and phone can be booked, the front desk books, hours save themselves

**Status: Accepted — 2026-10-19, to design then build** · owner, answering the Bookings and Availability UX audit (#1016; audit and boards on the "Saroh App Designs" canvas). Amends [DEC-113](#dec-113-one-word-for-each-thing-a-merchant-sees) (the pending word).

- **A booking needs a name and phone, not an email** (owner: "yes"). A caller who gives only those is booked as a customer kept by phone, as a walk-in with a phone already is for orders; the email is optional and can be added later.
- **A booking waiting for its payment reads "Awaiting payment"** everywhere a merchant sees it (calendar, list, the booking's page, quick look). DEC-113's "To confirm" no longer applies to bookings.
- **A Member can make bookings and mark arrivals** (owner: "yes they can"). The front desk books a caller and marks Came / Didn't come; what a Member may see of money still follows DEC-098.
- **Hours and time off save themselves** (owner: "we can save automatically"). Each change on the availability page saves when its control is done, with Undo; there is no Save bar there.
- **A booking made by hand defaults to "Pays at the visit"**; a payment link or "Paid now" stays one choice away.
- Consequences: the improved designs are drawn with these first; code follows once the owner signs off the boards. The word list in `docs/patterns/saroh-product.md` changes with the code.
- **Owner answers on the phone plan (19 Oct, plan 2026-10-19-001):**
    - A Member also moves and cancels bookings, and **sets hours and availability for other people** too (owner: "the team member should be able to add availability/create hours for others"). To revisit with feedback.
    - Refund or keep on a cancelled paid booking follows **the business's own policy**; no role decides it (owner: "it should be controlled by the merchant… its there policy").
    - Times follow **the business's time zone**, labelled (IST or the zone's own short name) as designed.
    - "Book their next visit" fills the service and person and leaves **the date to the merchant** (Tomorrow, Next week, Pick a date); no fixed gap.
    - After booking: WhatsApp, SMS and Copy message through the phone's own apps; Saroh sends nothing.
    - The Overview tab is renamed **Calendar**; "Also use these hours on" and "Change several days" replace Copy Monday.
    - Header C on every calendar screen; Hours and time off is the V2 weekly list under the Whose hours card.
    - A service's **Who can book it** is two tick boxes, Customers (on the booking page) and Your team (from Bookings), so any of the four combinations works; neither ticked pauses it, and bookings already made stay.
    - Tapping a free time opens one sheet with **Book someone · Block this time** at its top; "Close these extra hours" is a quiet link at its foot, only on extra opening hours.
    - Bookings **remembers the last view** (Day, Week or List) on each device, and a person can pin **Start Bookings on** in the "…" sheet.
- **Owner answers on the desktop pass and sign-off (19 Oct, canvas page "Bookings on desktop: improved journey"):**
    - Desktop and phone are signed off together; each screen is built once for both sizes. A phone bottom sheet is a right-hand side panel on desktop.
    - Day / Week / List stays only under **Show as** in the date popover, on desktop too.
    - **Whose diary opens is the person's own choice** ("Show bookings for": the last person I picked, Everyone, Just me). It opens on Everyone until they pick someone, then on their last pick.
    - A closed day says **"Closed on Sundays · Open hours on this day"** in Week and List, on phone and desktop.
    - **Each person can have their own timing rules** for their diary (notice needed, how far ahead, gap between bookings, cancelling), falling back to the business's. How customers pay and refunds stay business-wide. A Member changes only their own. The business-wide rules gain **"Gap between bookings"** (no gap by default).
    - **"Members' rule changes need approval"** is the business's switch, on for every new business. When on, a Member's change waits for an owner or admin to Approve or Turn down (with an optional reason), and they can Withdraw it. When off, it applies at once with Undo. Hours, time off and extra hours stay instant for Members (#1038).
    - **All bookings keeps its view chips** (owner, 19 Oct): Upcoming · Needs an outcome · Awaiting payment · Today · Next 7 days · All, each with a count, one tap each. A named exception to the one-dropdown rule for lists (the rule DEC-153 follows); other lists keep the dropdown.
    - **Rule requests are told by email and in the app** (owner, 19 Oct): owners and admins get a request in the app AND by email; the Member who asked gets the outcome (approved, or turned down with the reason) in the app AND by email. A Member sees their own alerts in the app, not the business's. Email helps more than in-app alone. The same goes for other permission requests made to owners and admins.
    - **Refunds on a cancelled paid booking** (owner, 19 Oct, refining Q14): what the business's policy says sets the choice (whether the store refunds, and how: in time or late, deposit kept or returned), whoever cancels. Changing it, such as refunding a late cancel or keeping money the policy would return, needs the permission to refund payments; without it the choice is shown but locked, saying why.
    - **Account managers' commission** (owner, 19 Oct, DEC-169): earned only from the month a manager takes a business on. A business that joined without one earns its manager nothing for the months before; in the owner's example a business on Pro from 1 Nov whose manager is assigned on 1 Jan earns commission for January, paid on 31 Jan. Commission is on what the business actually paid for its plan before GST (after discounts and offers; free months, credits and refunds earn nothing). A business's own rate can start no earlier than the later of its first paid plan and the day its manager took it on.
- **Owner answers on per-person booking rules (20 Oct):**
    - **The free-cancel window always follows the business's refund policy, for now.** A person has no cancelling rule of their own: their timing rules are notice needed, how far ahead and the gap between bookings. The API refuses a person's own `freeCancelHours` with a 400 that says why; the column is dropped and any value a person had is cleared, so every new booking takes the business's window (bookings already made keep the deadline they were made with). This replaces "cancelling" in the 19 Oct answer above.
    - **A Platform owner may set, or back-pay, their own business's rate** (the account manager's commission, DEC-169). Nothing changes; recorded here.
    - **A waiting rule request is closed automatically** when that person's rules are changed directly by someone allowed to, and when the business switches "Members' rule changes need approval" off. It reads **"Replaced by a newer change"** (status `REPLACED`). The person is told as they are of an approval or a turn-down: in their own alerts in the app (`notification:read-own`) and by email.

- **Change who (#1157), owner 20 Oct 2026:** giving someone else's booking to another person needs `service:write` as well as `booking:write`. Without it, a person can hand over a booking from their own diary, or take one that has nobody, for themselves; another business's booking or person is a 404. The customer gets one notice, both people an in-app alert, and the booking's history keeps who changed it, from whom and to whom.

## DEC-171 Home is "Today first"; Insights is an overview with tabs; comparisons are the last 7 days against the 7 before

**Status: Accepted — 2026-10-19, designs first** · owner, choosing between the improved Home (A/B/C) and Insights (A/B/C) boards after the Home and Insights UX audits (canvas pages "Home: current and improved" and "Insights: current and improved"). Plan: `docs/plans/2026-10-19-002-feat-home-insights-plan.md`.

- **Home is A, "Today first"**, on desktop and phone, built once per screen for both sizes: four tiles (Bookings today, To pack, Money in today, Arrived); **Needs you grouped by kind**, each group with one count, one total and one action, its rows opening inside the group with their inline actions; today's schedule beside it; **"How it's going"** with a link into Insights; setup as one line (progress, the next step, its button), the done steps folded.
- **A small "New" menu** by the greeting: take an order, book someone, send an invoice, showing only what the person's role allows.
- **Remind all** on the unpaid bills group, skipping anyone reminded in the last 3 days, with Undo before anything is sent.
- **Low stock shows on Home only once a product has a stock level set.**
- **Insights is B, "Overview and tabs"**: an overview with **one suggestion at a time** ("1 of 3", Next suggestion, Not now) and three answer cards that lead to tabs: **Money** (am I making more: 12 weeks of bars against the 4 before, this week, where money comes from, who owes by how late), **What sells** (best sellers, booked most and how full, busiest days and times, best customers) and **Where customers come from** (the path from visit to paid, sources, visits every day including empty days, pages opened, a site picker). **One period control drives the whole page.**
- **Comparisons are the last 7 days against the 7 before**, on Home and Insights, so a Monday no longer reads "0 · 19 fewer than last week".
- **What sells is built now; Where customers come from next**, once the merchant site tracks where a visit came from with Saroh's own first-party beacon (no third-party tracker on a merchant site, ERROR_TRACKING_AND_UPTIME rule 2).
- **Suggestions follow three rules**: a class nearly always full; a bill more than 3 weeks late; something selling less than before. One at a time; **"Not now" hides one for 7 days**.
- **Nothing is taken away**: every control today's Home and Insights have keeps a place on the new screens (the plan lists each one and where it goes). Money still follows permissions (DEC-098).
- **The full designs come first** (owner, 19 Oct): every screen of Home A and Insights B is drawn for desktop and phone and confirmed by the owner before issues are opened or code starts.
- Rules: `docs/patterns/backend-billing-and-classes.md` → "Overdue bills have one definition" and "Remind all" (U8 #1085); `docs/patterns/saroh-product.md` → Insights, "where a site visit came from" and "what visit tracking collects" (U15 #1099: five groups and a label from a link made in Saroh (DEC-181: any other `ref` counts under its group), the visit in tab memory only, no id; never the booking page's own `ref`, no label with seven digits or an id's shape, labels under 3 visits folded into "Other links"; steps stored to the hour with no visitor, paid the visit's own `site.paid` from its confirmation page; the visitor hash on a page view salted per day and per site; the server cuts paths, keeps the referrer's origin, drops titles and refuses private pages, one list with the site in `@saroh/block-contract`; nothing about a visit kept on an order or a customer (DEC-181); the retention sweep reads the legal hold again each batch; privacy review 21 Oct); the rest added as each unit is built.
- Rules: `docs/patterns/backend-billing-and-classes.md` → "Overdue bills have one definition" and "Remind all" (U8 #1085); `docs/patterns/saroh-product.md` → Insights, "where a site visit came from" (U15 #1099: five groups and a label from a link made in Saroh, the visit in tab memory only, no id, totals only with paid as the visit's `site.paid` (DEC-181); privacy review 21 Oct), and "From visit to paid" and "Where do visitors come from?" (U16 #1101: `GET analytics/sources`, the path never going up, shares as "1 in 7" never a percentage, visits never people, sources under 5 visits folded into Other sites, from when it counted, the Next marker gone); the rest added as each unit is built.

## DEC-172 Merchant sites get three looks on one engine: Folio and Quiet fully, Live for gyms

**Status: Accepted — 2026-10-20, to build** · owner, answering the Website v2 variant audits (VA, VB, VD findings; boards on the Website v2 design canvas). Plan: `docs/plans/2026-10-19-003-feat-site-templates-v2-plan.md`.

- **Looks:** build **A · Folio** and **D · Quiet** fully; **B · Live** is offered too, built under the 200 ms motion rule as redrawn (no springs, no number tickers). **C is dropped** (its boards stay, unfixed). The three looks' boards were fixed after their audits and are the visual source.
- **One engine:** the same blocks, one booking flow for services, classes and courses with the step in the URL (Back and deep links work), and one customer account. A, B and D differ only by tokens (colour, type, radius, motion) and a few layout variants per block. Booking is its own page or a panel as a look variant on that one route: Quiet uses a page, Folio a panel.
- **Launch on today's data.** Nothing on a site promises what the product can't do yet; every API gap is a later phase. The first piece is **image resizing with srcset** (photos are served at upload size today, `packages/site-blocks/src/lib/site-image.ts`). Later, in order: staff photo and bio, service pages, service reviews, online course enrolment, pick-up and delivery slots with a cut-off, Order again and Book again, saved addresses, message threads linked to a booking or order, WhatsApp.
- **Motion stays at** fade or rise, 200 ms or less, no bounce and no loops, reduced motion respected. Longer moments drawn on the boards are cut or shortened to fit.
- **Data removal:** the customer account gets "Ask to remove my data", a request the business sees and acts on (API, the merchant's Customers requests, the account's Your details). It is not instant deletion. Saroh emails the customer an acknowledgement when they ask and again when it's done (from Saroh's identity email, beside sign-in codes; this widens the 7 Oct rule under DEC-011). Anyone who can run a customer removal today can act on a request. Receipts and invoices are kept as the law requires, and the confirmation says so.
- **Live facts** ("Next free", "places left", "Open now") are fetched in the browser on cached pages, with loading, unknown and stale states; the cached page never carries them.
- **No-photo layouts** for every block; "No photo yet" is shown only in the owner's preview.
- **Code sign-in** for every email, new or returning, with the same words.
- **Merchants choose a look per site,** with an industry default: Quiet for salons, clinics, studios, bakeries, shops and makers; Folio for classes and yoga; Live for gyms. Existing sites keep working as they are (Classic) and are offered the new looks only from the Website › Style row, with no card in the workspace; Classic is always one choice away.
- **Phase 1 stays on today's data:**
    - The business's own WhatsApp chat link (`site-footer-contact.tsx`, `reach-links.tsx`) is kept in every look. The no-WhatsApp rule covers only automatic messages, which Saroh doesn't send.
    - The owner's cut-off line ("Order by 9 pm") is optional free text the owner writes. A real cut-off is Phase 2.
    - The existing owner-entered testimonials block stands in for service reviews until Phase 2.
    - Service pages and each person's "next free" are drawn but built in Phase 2; Phase 1 uses the booking page and the existing data.
    - Gallery album tabs are cut: photos have no tags.
- **Rollout:** the new looks stay on development until testing is done. `SITE_LOOKS` is on only in the development environment (saroh.io) and stays off in production until the owner says so.
- Consequences: a look is a style choice published with the site; the rollout is behind the API flag `SITE_LOOKS`; look code is inert for Classic, and shared changes that reach every site (image resizing, the booking step URL, live facts, the removal request) go to production only in a release the owner approves. Owner direction recorded 20 Oct 2026; one question stays open in the plan (Quiet's serif at small sizes for clinics).
- **Owner direction at rollout (20 Oct 2026):** Folio and Quiet are the main looks; Live is an option for gyms and classes (a classes template still starts in Folio). `SITE_LOOKS` stays on in development and off in production until the owner has tested the looks. Existing sites stay Classic until their owner chooses a look.
- Rules (as built, U18 #1111): `docs/patterns/frontend-design-system.md` → "A look is data, chosen per site" (U2 #1086, U6, U7, U10, U15), "A photo is sized for the screen" (U1 #1043), "A look's pair" and "A look's ₹" (U3 #1088, U4), "A merchant site's motion under a look" (U4 #1090) and "A look's chrome" (U5 #1092); `docs/patterns/frontend-data-and-state.md` → "A fact that changes by the minute is a live fact" (U8 #1042) and "A look is part of the publication"; `docs/patterns/frontend-app-structure.md` → "Booking is one route with the step in the address" (U9 #1098); `docs/patterns/frontend-verification.md` → "The looks have quality gates" and `pnpm run check:site-motion` (U17 #1110, which also set every merchant page's `lang` to `en-IN`). The flag, the production steps and the known gaps: `docs/architecture/runbooks/SITE_LOOKS_ROLLOUT.md`. The units' own notes follow.
    - **The removal request (U13, #1106)** is a `CustomerDataRequest` row with RLS, one OPEN per account (asking again returns it; at most 3 new a day per account). Only the privacy removal marks it DONE, in its own transaction, clearing its account link before the account goes; the team closes one only as `CLOSED_WITHOUT_REMOVAL` with a reason, which never reaches the customer. Both need `customer:remove`. Every relation and personal field of it is in the merge, removal, unlink and retention rule tables (`merge-plan.ts`, `privacy-removal-plan.ts`, `unlink-plan.ts`, `personal-data.ts`, `retention-erase-plan.ts`). Saroh's two emails are `customer.data-request.email` (`backend-jobs.md`); the sign-in footer's wording is left to #1156.
    - **Live facts (U8, #1042)** are read in the browser from the site's `today` read, which now names `nextFree`: the soonest start any service on the booking page can still be booked at (a full class never), today first and then the next 13 days through the booking page's own read, per service (per person is #1041). One read per address per page (`useLiveRead`), every 30 s while in view (the VB00Live board; the plan said 60), none while hidden, an 8 s timeout. A count shows only while the answer is under 60 s old and 5 or fewer ("Last place" for one, in `--site-accent-text`); an older answer keeps the time and hides the count; a failed or empty read falls back to "See times". The look hero's slot, Live's Now strip (with "Open now" and "Checked 5:20 pm") and the phone's Book bar draw it; Classic's On today is unchanged. Stock on cached product pages stays with the rest of #1042.
    - **The screens (U14, #1107):** the customer asks from Your details' "Your data" card (`site-blocks/src/account/data-request.tsx`): a dialog saying receipts and invoices are kept as the law requires, then "Request sent on {date}" for as long as it is open; a request closed without removal shows its date and offers the button again. On a test release the site's action refuses, as every site write does (DEC-071 T6), though the API would allow it. The team works them on Sell › Customers › Requests (`?tab=requests&status=`, `components/customers/data-requests/`), shown with the list's banner only to `customer:remove`: rows read first, each opening a side sheet with the existing removal and "Close without removal" (a reason, 1 to 500 characters, never sent to the customer). The customer's page shows one banner while a request is open, with Review removal opening the existing preview, and leaves its other notes out.
    - **The account in each look (U12, #1104):** under a look the account is a page of the site, inside its header and footer (`site-blocks/src/account/look-account.tsx`); Classic keeps its compact header and fixed tab bar, unchanged (`classic-account-pin.test.tsx`). The tabs are the API's (they follow what the business offers, not what the customer has), a nav of links with `aria-current="page"`, never a tablist; "Details" is the tab and "Your details" its page. On a phone Quiet's tabs are a row at the top that scrolls inside itself, and the one fixed bar stays Book's; Folio's are a bar at the foot and Live's stand in its dock's place, and `StickyActions` then draws neither Book's bar nor the dock on an account page, so a phone has one fixed bar. On a desk Folio keeps the row under "Your account at …" with Sign out; Quiet and Live move the tabs to a column from 1000px. The page's one heading is Home's greeting on the business's clock (Live: "Hi, Asha.") or the tab's title. The cards, rows, tags and buttons wear the look by one scoped stylesheet over the classes they already carry (`look-account-rules.ts`), not a second copy of each screen, so every control, the data-removal request among them, is the same in every look. Signing in is on the account's own page with the booking's inline code (U10), and returns to the page "Sign in" was pressed on (`sign-in-return.ts`). An order's stage reads from one mapping (`status-words.ts`): a pick-up is never "on its way". With packs and no membership, Plan shows the packs first and plans as one line under them. With the account area off the middleware still answers `/account` with a 404 before the site is known; the look's "Sign-in isn't used on this site" page stands only where it doesn't.
    - **The Look row (U16, #1109)** leads Website › Style (the editor's Brand panel, `components/sites/look-picker.tsx`): Classic, Quiet, Folio and Live, each with a phone picture and one line on what it suits (`LOOKS[].suits`), the template's default marked "Suggested for {trade}" (`lookSuggestion`, `TEMPLATE_INDUSTRIES` beside `TEMPLATE_LOOKS`; "Suggested" alone for a template with no trade). With `SITE_LOOKS` off a Classic site gets no row; a site whose draft or live site has a look keeps the row with those looks and Classic, and the API accepts the live site's look back as well as the draft's (`assertLookAllowed`). The site's read names `liveLook`, and one line under the row says a failed save (the previous look put back, never a toast too), else "Not published yet" while the draft's look differs from the live one, else that the look sets its own type, corners and spacing. Every Style control stays; Reset keeps the look. The canvas, the Add block pictures and a past version draw the look as the owner's own view (`isOwnerPreview`), the preview in the safe colours publishing uses (`withLookColours`). The pictures are the renderer's (`/template-renders/…?look=`, captured with `shots:templates --looks` into `lib/sites/look-thumbnails.ts`); until captured, each is drawn in the business's colours with the look's corners and heading face.

## DEC-173 Invoices: part payments in a ledger, cheques with a bank status, share and remind by WhatsApp link, three invoice styles

**Status: Accepted — 2026-10-20, to build** · owner, answering the Payments audit (INVAudit) and the round-2 boards on the design canvas, page "Invoices: current and improved". Plan: `docs/plans/2026-10-20-001-feat-invoices-rebuild-plan.md`. Subscriptions are not part of this decision.

- **Every capability stays.** The rebuild changes the look and adds what is listed here. No control is removed or merged (`00-universal.md` §15).
- **List (A+C):** search by name, invoice number and amount; one money strip (Owed / Overdue / Paid this month, plus Drafts as drawn) whose figures are filters; the GST notice is one status line. A row opens the invoice's details in a side sheet, and the action finishes there, never on another page.
- **Invoice details (A):** one main button per state, then Share, then More (which holds Cancel and every other action). "Record payment" is the one name.
- **New invoice (A)** plus "edit on the paper", with three styles (Classic, Band, Compact) in the business's colour with its logo. The Rule 46 GST fields are locked: no style drops one. A style is frozen on issued paper; the logo stays live (DEC-082).
- **Share (A and B) and bulk reminders by channel:** email through the business's own provider (DEC-086/091); WhatsApp as click-to-chat (`wa.me` with the message filled in, so Saroh sends nothing); copy link, PDF and print. A WhatsApp reminder counts towards one reminder a day. Automatic WhatsApp sending is later.
- **Part payments:** "Partly paid ₹1,000 of ₹2,500". Payments on an invoice are a ledger (one row per payment, in integer paise, the ledger's exception to "never Int for currency", as `PaymentIntent` already is). The invoice's status is derived from the ledger in the same transaction. Partly paid is derived, like Overdue, never stored. An order's invoice keeps the order as its ledger (ADR-008).
- **Cheques** are recorded as received, with a bank status: Mark as in the bank, or Bounced (owed again; no bounce charge). A waiting cheque counts as received.
- **"Cheques not in the bank"** is one line, shown only while a cheque waits: under the money strip and on Home. The API serves it as `chequesWaiting` on `GET organizations/:id/home` (`week.chequesWaiting`) and on `GET organizations/:id/invoices/summary`. The Home plan (DEC-171) draws it.
- **A payment recorded by mistake can be removed.** It is a soft remove with a reason, kept in the history. An online payment is refunded, not removed.
- **Cancel or correct (A) now.** The credit note page (B: GST s.34, Rule 53, GSTR-1), "Take some off" and the 30 Nov deadline block are Phase 2.
- **Defaults while open:** an overpayment is blocked (no advances yet); styles, colour and logo are in; a credit note on a paid invoice is a later decision (refund or credit), so today's Refund… stays and a partly paid invoice can't be cancelled until its payments are removed; corrections after 30 Nov aren't touched.
- Consequences: owed figures everywhere read what is left to pay; the pay link charges what is left; every path that pays an invoice writes the ledger through one helper.
- Rules (as built, U17 #1129): `docs/patterns/backend-data-and-money.md` → Money (the ledger in integer paise, U1 #1113); `docs/patterns/backend-billing-and-classes.md` → Invoices → "Cancel or correct" (U13 #1125: credit, credit and write again in one transaction, the credit note previewed, void and write again, Write again on a void invoice, a partly paid one refused, Refund… unchanged), "Payments on an invoice are a ledger" (the write path, refusals, remove, cheques, events, U2 #1114; every other path that pays an invoice writes the ledger and owed is what is left to pay, U3 #1115; the list's search, views and money strip and `GET invoices/summary`, U4 #1116; the whole-journey spec and the demo data that shows every state, U17 #1129), "Sharing an invoice, reminding many, and the receipt" (U5 #1117: WhatsApp a link, the share log, one reminder a day either way, Remind many, the automatic receipt, a cheque's receipt when it is in the bank; the share sheet, U11 #1123; Remind many's three steps, U12 #1124), "Invoice styles: Classic, Band, Compact, frozen at issue" (U6 #1118), and "Paying an invoice from a link" (the amount is what is left, U3; the page says what was paid, and only that, U16 #1128); `docs/patterns/frontend-design-system.md` → "Figures over a list are filters, said once" and "A list's phone screen may take the compact bar" (U8 #1120); `docs/patterns/frontend-forms.md` → "A form with no publish step saves as it is typed on the shell's autosave alone" (U14 #1126), "Money recorded by hand is one sheet, written at once with Undo" (U10 #1122) and "A record's details open from its row in a side sheet, and its page draws the same view" (U9 #1121). The words and the action rules every invoice screen shares are `apps/app.saroh.in/lib/invoices/words.ts` and `detail-actions.ts` (U7 #1119). Edit on the paper (U15 #1127) adds its own line when it lands.

- **Receipts are automatic (owner, 20 Oct 2026).** Recording a payment is an event: it is noted on the invoice's history and the receipt email goes to the customer through the business's own email provider, with no tick box. It waits for the Undo window, so a payment removed by Undo sends nothing. Without a provider nothing is sent and the owner can share the receipt on WhatsApp.

- **The customer's pay page (U16, #1128):** shows paid so far and left to pay, and each payment with its method and date. A cheque's number, bank and status are shown too. References, notes, reasons and who recorded it are never shown. A cheque waiting for the bank is "Cheque received", never "Paid". A bounced cheque says why the money is owed again. Pay, autopay's "just pay" and the UPI amount all use what's left, never the total.
- Rules (U15 #1127): `docs/patterns/frontend-forms.md` → "A record edited on the paper is the same form, pressed where it prints" (the parts, their editors, the Rule 46 labels, settings changed in place); `docs/patterns/backend-billing-and-classes.md` → "Invoice styles" → "Chosen in the app" (the draft's own look, Use my default, Make this my default and Settings › Invoice style for `org:update`, the details paper in each style).
- **Money in is one rule (code review, 20 Oct 2026).** The Invoices strip's Paid this month, Home (Money in today, This week, How it's going, the last 24 hours) and Insights' takings count money on the day it came in, by one rule (`invoices/money-in.ts`): paper that isn't an order's counts each live ledger payment (not removed, not bounced; a cheque waiting counts) on its `receivedAt`; an order's paper keeps its paid date and total. A part payment counts the day it came in, a bounced cheque or a removed payment stops counting where it fell, and a back-dated payment counts on the day it was received. Money handed back stays as each surface read it: the strip is money received; Home takes a refund's credit note off on the day it was issued; Insights takes an invoice's credit notes off its latest payments. "So far" figures compare with the same time of day in the earlier window, never part of today against a whole day. What a booking's desk take and Due see as paid is its paper's ledger, however it was paid. Rules: `docs/patterns/backend-data-and-money.md` → Money; `docs/patterns/backend-billing-and-classes.md` → "Money in is one rule", "'So far' compares with the same time of day", "One zone reader", and "Money taken at the desk"; pinned by `money-in.db.spec.ts`.

## DEC-174 Automatic notices: customers hear about their bookings, orders, memberships, refunds and packs by the business's own email; staff hear about their own bookings

**Status: Accepted — 2026-10-20, to build** · owner, answering the notifications audit of 20 Oct (D1–D10). Plan: `docs/plans/2026-10-20-002-feat-automatic-notices-plan.md`, epic #1131.

- **D1, yes.** Booking and order notices go to the contact's own email through the business's own provider when one is connected, not only to live site-account holders. Consent is still checked.
- **Customer notices only ever go through the business's own provider** (DEC-086 reversal). Saroh's own email sends only what DEC-011 and its amendments allow. WhatsApp sends only once #1058 exists; until then, click-to-chat.
- **Every new default-on notice has a switch the business can turn off,** kept with "Updates in Messages" on Settings › Providers, and starting on:
    - **Renewals and failed charges:** the renewal invoice is sent automatically (hand-made invoices keep their Send button); a failed autopay charge tells the customer, with the payment link.
    - **Membership emails** (one switch): joined, paused, resumed, plan changed, cancelled, ending in 7 days. The team is alerted when a member cancels or pauses themselves, or cancels autopay at their bank.
    - **Refunds:** an online refund is told automatically; a cash refund at the counter sends nothing by default. Cancel notices say whether the money was refunded, kept or the credit returned. The team is alerted when a refund fails or an automatic refund is refused. Booking refunds are written to the booking's history.
    - **Staff and replies:** the person a booking is with gets their own alerts for new, moved and cancelled bookings, bell and email by default. A team reply in the customer's Messages thread is emailed to the customer.
    - **Also on:** the enquiry auto-reply where a provider is connected; Delivered and Sent for shipped and digital orders (Collected stays off); pack credits (receipt when bought online, 1 credit left, 7 days before expiry); back-in-stock "Tell me", emailed once when the product is back.
- **D3, overdue reminders: opt-in.** At most 2 automatic reminders per invoice, 3 and 10 days after the due date, inside the one-a-day rule.
- **D6, the pre-debit notice for card and eMandate:** to be confirmed in Razorpay test mode (U21) and with the owner's CA. If Razorpay doesn't send it, Saroh must, and card autopay stays off until then.
    - **Found 21 Oct (U21, #1152), from Razorpay's docs:** card, yes: "Bank will send a pre-debit notification SMS to the customer immediately" ([card FAQs](https://razorpay.com/docs/payments/recurring-payments/cards/faqs/)), and the debit lands ~36 h later; Saroh sends nothing extra. **Card autopay stays on.** UPI, yes (Razorpay, D11 spike). eMandate, none: "For Cards and eMandate, the debit is being processed directly" ([integrate overview](https://razorpay.com/docs/payments/recurring-payments/overview/integrate/)); the RBI framework covers cards, PPIs and UPI, not NACH.
    - **Still open for the owner:** the CA on whether eMandate customers must be told before each debit (if yes, a Saroh email through the business's provider ~24 h before `debitAfter`, a new issue); a live ₹1 card charge on the owner's own card to see the bank's SMS (test mode sends none). Evidence: `docs/architecture/research/2026-10-pre-debit-notice.md`.
- **Already decided:** the invoice payment receipt is automatic (DEC-173, invoices U5 #1117). This decision depends on it and doesn't duplicate it.
- **Fixes with no decision needed:** the ten untrue messages and the waitlist offer's claim link; "has moved" for a booking awaiting payment; a lapsed hold read as a customer cancel (and the customer told); an online pack purchase's missing "sold" row; the rule-request bell; tracking added after hand-over; invoice history; team alerts for money events; course and class notices.
- **DEC-086's code is deleted, not fenced** (U3): the flag was never on, and every notice this decision adds would otherwise carry its route and tests. A source scan fails if a customer-notice path imports a Saroh sender.
- **Defaults taken while open** (the plan's Assumptions A1–A17): D1 has no switch of its own; a renewal with live autopay isn't sent as a pay request; the refund notice goes when the provider accepts it; "Tell the customer" on an order cancel starts ticked; a team reply is held 60 s and coalesced; one enquiry auto-reply per address per day; Delivered, Sent and later tracking share one switch; the pack receipt is DEC-173's receipt with a pack line; staff alerts reach only staff with a login; overdue reminders count only automatic ones; a back-in-stock opt-in makes no contact and is no marketing consent.
- Rules: added when built (`docs/patterns/backend-jobs.md` → Customer notices and Team alerts; `docs/patterns/saroh-product.md` → Communications).

## DEC-175 A booking page on the business's address without building a website

**Status: Accepted — 2026-10-20** · owner, issue #1158 · amends DEC-069 (selling online makes the website) the same way for Bookings; builds on DEC-141's starter

- Context:
    - A business that only takes bookings has a web address but nothing customers can book on: `/book` is drawn only when the website is published, and only selling online made a website (DEC-069). A salon or a physio had to go through Website and publish a whole site.
- Decision:
    - **Bookings makes the booking page, as selling online makes the shop.** When Bookings is turned on, or a service customers can book online is added or opened to them, and the business has no website, Saroh makes the starter site (DEC-141, whatever the kind) on the business's address, with Website switched on and its Book page, Contact and a plain Home. Nothing is published.
    - **One row in Bookings › Services:** "Your booking page", the address (`<address>.saroh.app/book`, or the verified custom domain).
        - Before it is live: "Not live yet: customers can't open it", with no Copy link and no QR code. **Publish booking page** opens a sheet that publishes it and finishes there with Copy link and the QR code.
        - Live: the address, Copy link and the QR code (the existing QR button, kind BOOK).
        - Read first; the sheet does the one task in place.
    - **Who may:** making it asks what turning Website on asks (`site:create` and `module:manage`: Owner and Admin). Publishing it asks `site:publish`, with "Publishing needs approval" applied as in Website. Anyone else reads the row and is told who can.
    - **One site, never two.** A business with a website just sees its link; Bookings adds its Book page to it (DEC-141's module sync). A website once deleted is never brought back by itself. Turning Website on later, or editing it, is the same site.
    - **Every capability stays.** Website › Publish works as before; publishing from Bookings is the same publish of the same site.
    - Defaults taken while open:
        - The row sends a website that is already published but whose `/book` isn't served to Website, rather than publishing from Bookings, which would put every waiting change live too.
        - A business with Bookings on before this decision and no website gets **Make my booking page** on the row.
        - When Website is turned on in the same sheet as Bookings, it goes first, so the site is the one its fields say and Bookings joins it.
        - A refusal while making it by itself (no room on the plan, an address taken since) is logged and Bookings carries on; the address it offers instead is tried once.
- Consequences:
    - Turning Bookings on switches Website on too for a business with no website, so Website shows in the menu, as it does after selling online.
    - The Turn on sheet says the booking page comes with Bookings, from `setup-defaults`' `alsoBookingPage`.
- Rules: `docs/patterns/backend-auth-and-access.md` → "Bookings makes the booking page, as selling online makes the shop".

## DEC-176 The GST rate is chosen with buttons: 0, 5, 18 and 40%, with the rest behind Other rate

**Status: Accepted — 2026-10-20, to build** · owner. Plan: `docs/plans/2026-10-20-003-feat-gst-rate-picker-plan.md`, issue #1160.

- One shared picker, shown as buttons, everywhere a GST rate is asked. It replaces the dropdowns and the paper editor's own chips.
- **Main buttons** are the slabs since GST 2.0 (22 Sep 2025): 0% (nil-rated or exempt), 5%, 18% and 40%. **Other rate** opens 0.25%, 1.5%, 3%, 12% and 28% in place.
- **1.5% is added** to the rates GST has, for cut and polished diamonds.
- **Nothing saved changes:** a rate saved at 12% or 28% keeps it and opens with Other shown; issued invoices are never touched.
- Not set stays only where a field may be left empty today. There is no new business "usual rate" setting.
- Rules: `docs/patterns/frontend-forms.md` → "A GST rate is always chosen with `GstRatePicker`"; checked by `lib/consistency/shared-pieces.test.ts`.

## DEC-177 Looks, fonts and colours: free ones for everyone, the rest on paid plans, chosen in admin

**Status: Accepted — 2026-10-20, amended 2026-10-21 (owner: Classic is the only free look)** · owner, issue #1163 · part of the looks release (epic #1076, DEC-172) · amends plans catalogue U13 (the "themes" row guarded every style save)

- Context:
    - Every save in Website › Style checked the "Themes, fonts and templates" plan row (`themes`). That row is on no plan, so no business could pick a look or change its typeface or colours. The owner: looks, fonts and themes belong to the plans; some are free and the rest come with paid plans, and both lists keep growing.
- Decision:
    - **Each look, font pair and colourway is either free or paid.** Free ones work for every business. Paid ones need the "Themes, fonts and templates" row on the business's plan.
    - **Which are free is kept in the plan catalogue and chosen in admin › Plans and modules,** never written in code, so adding or moving one needs no release: it is published with the next catalogue version, like any other change.
    - **To start:** Classic is the only free look; Quiet, Folio and Live come with paid plans (the themes row). Owner, 21 Oct, superseding the 20 Oct choice that all four looks start free. For typefaces and colours, a few are free and the rest are paid; the owner picks which in admin.
    - **Until the owner picks:**
        - The visitor's system font is free.
        - A site's own template fonts and colourway are free, so nobody loses what they started with.
        - Going back to Classic, or to anything the site already has, is always allowed.
    - **In the Style panel:**
        - A paid choice shows a small "Paid plans" mark.
        - Choosing it on a plan without the row is refused in the panel: the picture stays on the old choice and one line says why, with a link to see plans.
        - It never fails silently, and it doesn't rely on a toast.
    - **Preview** (owner, 20 Oct, added to the issue): every look in the Look row has a Preview button ("Preview Folio"), so a business can see a look before choosing it. It opens in a large dialog on a desk and a full-height sheet on a phone, never in the editor's canvas: the business's own home page in that look, a desk and phone switch, the look's name and its one line on what it suits, and "Use this look" and Close. Nothing saves and the draft doesn't change until "Use this look", which follows the free and paid rule above; previewing works on every plan. Closing returns to the chosen look exactly as it was, with focus back on that Preview button, a 44px target on a touch screen.
    - The "themes" row keeps guarding picking another template.
- Defaults taken while open:
    - Colour swatches and the spacing sliders are the merchant's own choices, never a look, font pair or colourway, so they are never paid.
    - "A site's own template fonts" are the font pairs its template's colourways set; "its colourway" is the one it was made in (`Site.templateStyleId`, else the template's first). The live site's look counts as something the site already has.
    - The free list is the **live** catalogue version's, not the business's own version, so a list the owner publishes applies to every business at once. A version published before DEC-177 frees nothing beyond the always-free ones.
    - A colourway is named in the catalogue as `template:colourway` (`salon:kesar`); a colourway's id is unique only within its template.
    - A paid choice is marked on every plan, including one with the row.
- Consequences:
    - `PricingCatalogVersion.catalog` gains `freeStyles: { looks, fontPairs, colourways }` (optional, ids only, no prices). The sample catalogue frees no look beyond Classic (owner, 21 Oct) and leaves typefaces and colourways to the always-free ones.
    - Publishing refuses a free id this build has no look, typeface or colourway for.
    - Before the looks reach production, the owner turns the themes row on for the paid plans, ticks the free typefaces and colourways in admin, and publishes (`SITE_LOOKS_ROLLOUT.md`).
- Rules: `docs/patterns/backend-auth-and-access.md` → "A look, typeface or colourway is free or paid, and the catalogue says which"; `docs/patterns/frontend-design-system.md` → "A paid style is refused in the Style panel, and every look can be previewed".
- Rules: `docs/patterns/backend-data-and-money.md` → Money (the ledger in integer paise, U1 #1113); the rest added as each unit is built.

## DEC-178 Automatic notices, owner follow-ups: reminder timing, a stop link for back in stock, how to pay on a renewal, and a reason when a class is cancelled

**Status: Accepted — 2026-10-21** · owner · follows DEC-174 (automatic notices, PR #1168)

- Context:
    - After the automatic notices build merged, four choices the units made on their own were put to the owner.
- Decision:
    - **Overdue reminders: the business sets the timing.** The 9 am to 8 pm window is right as the default. In the Overdue reminders setting the business chooses which days after the due date the two reminders go (default 3 and 10) and the hours they may go in (default 9 am to 8 pm, in the business's time zone). The one-a-day rule and the two-reminder cap stay.
    - **Back in stock gets a stop link.** Asking to be told sends a short "We'll email you when ‹product› is back" with "Stop waiting", and only that email carries it. The back-in-stock email itself has no stop link (owner, 21 Oct, after #1173): by then the watch is told, so there is nothing left to stop. Stopping stays a page and a button, never a link that acts when opened.
    - **A renewal the business can't take online says how to pay.** With no payment provider connected, the renewal email lists the business's "How to pay us" (UPI ID, bank transfer). If none is filled in, the invoice is not sent by itself: the business is told to add how to pay or connect payments, and sends it by hand.
    - **Cancelling a class asks for a reason.** The business gives a short reason when it cancels a class; the customer's email says "‹Business› cancelled this class: ‹reason›", and the booking's history keeps it. The words stay the business's own; nothing is written for them.
- Consequences:
    - A reminder-timing setting, a sign-up email for back in stock, a renewal check on "How to pay us", and a reason field in the cancel-class flow and the API.

## DEC-180 eMandate autopay: the customer is told before each debit

**Status: Accepted — 2026-10-21** · owner · settles DEC-174 D6's open question (research `docs/architecture/research/2026-10-pre-debit-notice.md`, U21 #1152)

- Context:
    - For card autopay the issuing bank sends the pre-debit notice, and Razorpay asks for it for UPI. For eMandate (bank account, NPCI's API e-mandate) nobody sends one: Razorpay doesn't, and the RBI's 2026 framework doesn't name NACH.
- Decision:
    - **Every eMandate debit is announced to the customer before it is taken.** About a day before the charge, the customer gets "₹X will be taken from your bank account on ‹date› for ‹plan›" through the business's own email, with what it is for and who to ask.
    - **No notice, no debit.** If the notice can't go (no email provider connected, no address, or the customer turned email off), that period is not taken by autopay: the renewal invoice goes as it would without autopay (DEC-174 U10), and the team sees why.
    - Card and UPI are unchanged: their notices come from the bank and from Razorpay.
- Consequences:
    - A notice job keyed to the charge, run ahead of `debitAfter` for EMANDATE only; the charge job checks the notice went before it debits.
- Built (#1175): the eMandate debit is planned at least 26 h after its charge is prepared, the email is queued 26 h before it, and the debit goes no sooner than 24 h after the email went (a late email moves the debit, never shortens the notice). A period not taken is NOT_CHARGED_NO_NOTICE on the subscription's history with why.
- Rules: `docs/patterns/backend-integrations.md` → "eMandate: Saroh's notice, or no debit".

## DEC-181 Where a visit came from is counted only as totals, from links the business made in Saroh, like a cookieless analytics tool

**Status: Accepted — 2026-10-21** · owner · follows the U15 privacy review (#1099); amends DEC-171 and plan A13

- Context:
    - The privacy review of site link tracking found that any `?ref=` value could be recorded (a booking id, a person's name) and that the visit's source was kept on the order, which makes it personal data once the order names a customer. The owner asked how Plausible does it: no cookies, no visitor id, a daily-rotating salt, totals only, and one line in the site owner's privacy policy instead of a banner.
- Decision:
    - **Totals only.** Saroh counts visits, steps and paid by source as totals. Nothing about a visit is kept on an order or a customer: no `Order.visitSource` or `visitRef`, no "came from" on the order. Paid is counted by the visitor's own confirmation page sending a "paid" step with the group and label only, never the order, so a payment made later another way is not counted to a source.
    - **Only links the business made in Saroh.** The business names a link on Insights › Where customers come from ("diwali-post") and copies it; only those labels are counted, checked by the server against the site's list. Any other `ref` counts as its group with no label.
    - **No banner.** Like a cookieless analytics tool: no pop-up and no new footer link. The site's cookie notice stops saying it uses "no analytics tools", and Saroh's privacy policy says in one line that sites on Saroh count visits without cookies or personal data, as totals only. The owner sees the exact words before they ship.
- Consequences:
    - The order fields and their migration go before release (never applied to an environment). A site's link list (name, label, made by, when) is new. The privacy-review fixes stay (daily per-site salt, server-side cleaning, private pages silent, hour-only step times).
- Rules (as built, #1099): `docs/patterns/saroh-product.md` → Insights, "where a site visit came from", "the links a business makes to share its site" and "what visit tracking collects". `SiteLink` (migration `20261225100000_site_links`, RLS `org_isolation`), read with `analytics:read`, made and archived with `site:update`, each write in Activity; the intake keeps a step's label only when it is a live link's of that site (a minute's cache per site, dropped on every write). `site.paid` is sent by the private `/shop/order/<id>` page, which sends no page view, only for an order paid online at the checkout; a refund isn't taken off a source.

## DEC-182 A look's Preview shows its own showcase template with sample words, and its starter content can be taken into the draft

**Status: Accepted — 2026-10-22** · owner · amends KTD-6 of the templates gallery (sample words were gallery-only) and DEC-177's Preview

- Context:
    - Preview drew the business's own home page in each look. With little content of its own (a heading and "No photo yet"), the owner found it showed nothing of what each look and its sections can do, so a business couldn't tell the looks apart.
- Decision:
    - **Preview shows each look's showcase template, filled in.** Quiet previews the Salon template, Live the Gym template, Folio the Studio template (until a Yoga or Classes template exists) and Classic the Bakery template, each with its gallery sample words and pictures. One mapping in code, easy to change.
    - **"Use this look" offers the starter's content too.** In Preview the business can choose the look alone, or the look with that template's sections and sample words copied into its draft. Copying replaces the draft's pages it covers; nothing goes live until Publish; Undo puts the previous draft back.
    - **Sample words may now reach a merchant's draft**, only by that explicit choice. The check before publishing lists every sample word or sample price, hour or name still on a page, so none goes live unnoticed. `instantiateTemplate` still never adds them on its own.
- Consequences:
    - `gallery-samples.test.ts`'s "none reach a merchant's site" holds for site creation only; the copy path is tested on its own, and the pre-publish check learns the sample words.
- Amended 2026-10-22 (owner) — **the business's own details in place of the samples, and the previous site kept:**
    - **Confirm and Undo, both.** The copy keeps its confirm step and its Undo, an allowed exception to "Undo or confirm, never both" (`frontend-error-feedback.md`): the confirm is the only place that says the words are a sample business's, and it replaces Home. The wording as built is approved.
    - **One step by default.** The confirm has "Fill in my details", on by default: as the starter copies, sample words are replaced with what Saroh already knows (the staff in place of sample people, the registered address, the town under a place fact; the name, services, prices, hours and contact the template already lays down or reads live). Unticked, the samples go in alone.
    - **Two steps always possible.** "Bring in my details" under the looks does the same fill at any time. It replaces only text that is still a sample's own words, never what the owner typed; what has nothing to fill it stays, and the pre-publish check still lists it. Its toast says what it filled, with Undo.
    - **The previous site is kept.** Every starter copy, fill, roll back and section brought in keeps the draft as it was (`SiteDraftSnapshot`, kept as long as the site). "Previous versions" under the looks lists them, newest first. Roll back (its own confirm) puts a version's pages, look and menu back, whatever was saved since, and keeps the draft as it was first so the roll back has its own Undo; pages added since stay, off the menu. "Bring in a section" copies one section of a version to the end of its page (or Home, if that page is gone). Nothing goes live until Publish.
    - Rules: `packages/templates/src/fill-details.ts`, `apps/api.saroh.in/src/modules/sites/starter-content.ts`, `apps/app.saroh.in/components/sites/draft-tools.tsx`.

## DEC-183 Components folders get feature sub-folders, and a component's UI is kept apart from its business rules

**Status: Accepted — 2026-10-22** · owner · from the `components/organizations/` refactor audit; amends the "Not adopted" hook → view → index note in `frontend-app-structure.md`

- Context:
    - `apps/app.saroh.in/components/organizations/` grew to 75 flat files across a dozen unrelated features, and `team-screen.tsx` (1,486 lines) and `roles-tab.tsx` (836) mix drawing with rules, so a visual change means editing logic.
- Decision:
    - **Feature sub-folders** once a domain folder holds more than three unrelated files, or more than about 25: `components/<domain>/<feature>/`, named after what the merchant sees, tests beside their file, no barrels, `./` inside a folder and `@/components/<domain>/<feature>/…` across.
    - **UI apart from business logic.** `.tsx` only draws; rules and derivations are pure `.ts` functions with unit tests; state and actions are `use-*.ts` hooks. A UI change shouldn't touch business logic, and a rule change shouldn't touch the UI. New components follow it; existing ones move when next changed.
- Consequences:
    - `components/organizations/` is reorganised in steps (pure moves first, then splits and fixes), each verified on its own. Other domain folders that meet the trigger are moved when next worked on, not in a sweep.
- Rules: `docs/patterns/frontend-app-structure.md` → Rules, "A domain folder that grows mixed or big gets feature sub-folders" and "The UI layer is separate from the business layer".
