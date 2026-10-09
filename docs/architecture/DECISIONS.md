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

**Status: Reversed — 2026-10-07 (owner)** · was Accepted 2026-10-06 · user · in conversation · built 6 Oct for the booking notices (U1–U4), behind the `SAROH_BUSINESS_EMAIL` flag, off by default, and left off

- Context: DEC-011 sends a business's messages to its customers only through a provider the business connects. Most new businesses connect none, so their customers get no booking confirmation or order update by email at all.
- Decision: while a business has no connected email provider, Saroh's own email (Amazon SES, DEC-085) sends its customer notifications: booking confirmations and the other transactional messages the business would send through its provider. When the business connects a provider, its provider sends them and Saroh stops. Marketing and broadcasts never go through Saroh.
- Settled with the owner the same day: the booking notices (confirmed, moved, cancelled) come first. Each email Saroh sends counts against a monthly plan allowance; Free gets a small allowance and Grow and Pro more, with the numbers kept only in the plans catalogue. At the allowance, or when it can't be read, Saroh does not send (the customer's account message still stands). Mail goes from its own subdomain (`bookings@notify.saroh.in`, own DKIM and MAIL FROM) as "‹Business› via Saroh", replies to the business. A separate AWS account comes only if volume grows, since SES judges reputation per account.
- Settled with the owner after the code review (6 Oct): Saroh sends at most 3 emails about one booking in any 24 hours, so a customer moving a booking again and again can't drain the business's allowance through Saroh's address (past it the account message still stands and nothing is counted); the business's own provider has no such cap. A plan cell marked soft gives Saroh no allowance, since a soft cap never stops a send.
- Amended 2026-10-06 (owner): **a business connects its own email provider on Grow and Pro only.** The catalogue's `integrations` row decides (a plan without it, or at its cap, can't connect one); Free relies on Saroh's allowance and upgrades to get its own. Settings and the allowance's notices offer connecting only when the plan has room for it, read by the connect's own check (`MeteringService.hasRoom`), and otherwise lead with seeing plans.
- Still open: review invitations (MARKETING_CLAIMS D11), and the other notices after booking emails have run clean.
- Consequences: the booking notices (confirmed, moved, cancelled) go through Saroh when the rule allows: no provider of its own, the business's flag on, an allowance with room, and no global stop. Every other notice keeps DEC-011's rule: no provider, no customer email.
- **Reversed 2026-10-07 (owner).** (1) A business's messages to its customers go only through the business's own connected email provider; Saroh sends none of them. The code built for this decision (`sarohMaySend`, the Saroh sender, the allowance, Settings' "Booking emails" block) stays in place and stays off: the `SAROH_BUSINESS_EMAIL` flag is not switched on for any business. (2) On Free, which can't connect its own email (DEC-091), customers get no emails; they see their updates in their account on the business's site. That is intended. (3) Review invitations go through the business's own provider only; with no connected email provider, no invitation is sent (settles MARKETING_CLAIMS D11). (4) Unchanged: a site's sign-in codes and the email-changed notice stay on Saroh's own identity email (ADR-011).

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

**Status: Accepted — 2026-10-07** · user · from the UX audit (UX-003, D1/D2)

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

**Status: Accepted — 2026-10-07** · user · clarifies DEC-093

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

**Status: Accepted — 2026-10-07** · user · from the UX audit (D6)

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
    - What's over the limits is worked out from the plan the business reads now and a fixed order; nothing is stored per item. Team (seats as DEC-105 and DEC-111 count them, view-only people against their own limit): the owner always stays, then the earliest to join, then open invitations. Products and posts: the newest stay. Locations (SHOP storefronts, DEC-109) and websites (DEC-094): the first made stay.
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
- Consequences: `Order.refundedByHand` keeps what was handed back by hand (migration `20261103100000_order_refunded_by_hand`). Insights' `order.refunded` is still written only for a full refund, since that figure is net of full refunds by design (#867). An online refund's cap doesn't subtract refunds recorded by hand yet. `docs/patterns/backend-billing-and-classes.md` → "Orders and the shelf".
