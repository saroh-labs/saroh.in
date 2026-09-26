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

## DEC-037 A business's customers sign in on its own site, with a code, one account per business

**Status: Accepted — 2026-09-26** — see [ADR-011](./adr/ADR-011-customer-accounts-on-merchant-sites.md) · supersedes in part [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) §2 "The public booking page" and §3 "Not sending email or SMS" · amends DEC-011 · round-2 plan A

- Context: the Customer Site and booking-page designs give a business's customers an account: their bookings, orders with tracking, plan, packs and messages. ADR-008 kept the booking page anonymous because Saroh could not check who was asking. So there were no credits online, no packs bought online, no waitlist, no recognition, no sign-in and no customer messages.
- Options: one Saroh-wide customer identity; Better Auth users with a customer role; a separate customer account per business.
- Decision: **people who sign in on a merchant's site are that business's customers**. Each has a **`CustomerAccount` per business**, never shared across Saroh and never a Better Auth `User`, linked to exactly one Contact. **Sign-in is a one-time code** by SMS or email; email codes go through Saroh's identity email in the business's name. **The session is a host-only cookie on the site's own host.** The site's server routes read it and call the API with it, and the API accepts it only for the business that host belongs to. A signed-in customer may **spend class credits and buy packs online, join a class waitlist, be recognised, and message the business**. Messages about their own orders, bookings and invoices always reach them in their account. They go by email, SMS or WhatsApp only through the business's own connected provider (DEC-011).
- Consequences: ADR-008's list of what the booking page may not do is lifted for signed-in customers. A first sign-in links to the one contact with that verified phone or email. Otherwise it makes a new contact and lists the possible duplicates; it never merges silently. Copy may promise a message only where one is really sent.
- Open, to confirm: **who pays for SMS**, Saroh's SMS account or the business's own connected provider. Email-only sign-in ships first.
- Migration: new tables `CustomerAccount`, `CustomerSignInCode` and `CustomerSession` (organization-owned, RLS), plus the messaging tables in plan A.

## DEC-038 Autopay, card-on-file and per-session charges run on the business's own payment provider

**Status: Accepted — 2026-09-26** — amends [ADR-007](./adr/ADR-007-subscriptions-invoices-classes.md) ("No card-on-file, no auto-debit") and DEC-019 · round-2 plan D

- Context: the Plan Editor, Subscription Detail, Home ("Retry") and the customer site ("UPI Autopay for plans", "saved methods") assume a renewal can charge the customer without a link. ADR-007 invoiced each period and left mandates for later.
- Decision: **autopay (a saved card or a UPI mandate) and charges per session come from the provider the business connects**. Razorpay comes first, and Cashfree or another provider goes through the same port, **using the provider's own mandates and subscriptions**. Saroh stores the provider's customer, mandate and token references, never card or bank details. It never charges without a mandate the customer set up. **Each period is still invoiced** (DEC-023), and a successful mandate charge pays that invoice. **A pay link stays the fallback**: with no provider, no mandate, or a failed or cancelled mandate, the invoice goes out with a pay link as today.
- Consequences: "Retry" on a failed renewal retries the mandate charge when there is one, and sends a pay link otherwise. The provider port gains mandate set-up, charge, cancel and status calls, and the webhook inbox gains their events. Copy says "UPI Autopay or card" only where the business's provider supports it and the customer has set one up.
- Migration: a mandate table (organization-owned, RLS) and a subscription's link to it; nothing changes for subscriptions without one.

## DEC-039 Staff permissions for the new screens are settled in one matrix before they ship

**Status: Accepted — 2026-09-26** — [docs/plans/2026-09-26-permission-matrix.md](../plans/2026-09-26-permission-matrix.md)

- Context: the designs gate by permission: `customer:read/contact/sensitive/merge/remove`, `order:create/fulfil/edit/refund/export`, `pack:sell`, `booking:settings`, and a Member who sees no money. Some of them differ from DEC-020 and DEC-024; the design's Member reads orders with money and takes new orders.
- Decision: **every action the round-2 designs need is listed against Owner, Admin, Member, Reviewer and custom roles**, marking what exists and what is proposed. **The user reviews it in detail before any unit adds or changes a permission**, and those units are marked "blocked on the matrix review". Until then the shipped map stands: Members read no money (DEC-024), and a Reviewer sees only the sites they were invited to (DEC-006).
- Consequences: screens can be built against today's actions and gain the new ones after the review. The API goes on refusing what it refuses today.
- Migration: none until the review.

## DEC-040 Needs attention is one field on the customer, and sensitive entries need their own permission

**Status: Accepted — 2026-09-26** — round-2 plans C, B, E, F and A

- Context: today allergies are structured note allergens (ADR-008), shown in Order Detail's allergy banner. A clinic needs medical notes and access needs on the same record, and a front desk that must not read them.
- Decision: **each customer has one Needs attention list**. Each entry has:
    - a kind (Allergy, Medical, Access or Other), a short label and optional detail;
    - a sensitive flag, on by default for Medical;
    - where it came from (staff, the booking page's "Anything we should know?", or the customer), and who added it and when.

    **Sensitive entries go only to a role holding the sensitive permission.** The API leaves them out; the screen does not just hide them. The same list shows on Customers, Customer Detail, Orders and Order Detail (the kitchen view included), Bookings, Home and the booking page's intake. Allergy entries keep their structured allergen, so the allergy banner still matches exactly.

- Consequences: existing allergen notes become Allergy entries. A note from the booking page arrives as a suggestion that staff confirm ("Add to Needs attention" or "Nothing to add"). It never goes straight onto the record.
- Migration: a `ContactAttention` table (organization-owned, RLS) and a backfill from `ContactNoteAllergen`.

## DEC-041 CRM stays as it is; Customers is everyone who pays or signs in

**Status: Accepted — 2026-09-26** — round-2 plan C · amends `saroh-product.md` "Selling, customers and identity"

- Context: the Customers design is one list for the whole business: "Only people who have paid are customers; everyone else lives in People". Today `/commerce/customers` merges store customers per storefront on the client, and Leads, Pipeline and Contacts are the CRM.
- Decision: **Leads, Pipeline and Contacts stay as they are.** **The new Customers list replaces the storefront customers list** and is keyed on the Contact. A customer is a contact who has paid (for an order, an invoice, a subscription or a pack) **or who has signed in on the business's site** (DEC-037). One organization-level API serves the list.
- Consequences: `/commerce/customers` becomes the business-wide list, and the old per-storefront customer pages redirect to the contact. A paying store customer with no linked contact gets a new contact, linked to them, when the list is backfilled or when they next pay. Where the business already has a contact with that email (email is unique per business), no second contact is made. The pair is suggested for the merchant to link or merge, and is never linked automatically.
- Migration: a backfill that makes and links a contact for every paying store customer without one.

## DEC-042 Duplicate customers are merged, and a customer's details can be removed

**Status: Accepted — 2026-09-26** — round-2 plan C · supersedes in part [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) §2 "One read of a customer" ("records are never merged")

- Context: #120 links a store customer to a contact. The design merges two customers and removes a person's details for privacy; the build offers a link and a hard delete instead.
- Decision: **a merchant can merge two customers.** The surviving contact keeps every order, note, booking, subscription, pack, invoice, message and Needs attention entry of the other. Orders and invoices keep the contact details they were placed with. The merge is recorded on both timelines and in Activity. Saroh suggests likely duplicates but never merges on its own. **Privacy removal anonymises the person**: their name, phone, email, address, notes, Needs attention, messages and site account go. Their orders and issued invoices stay, with what was printed on them, because the law needs the paper.
- Consequences: a hard delete stays only for a contact with no orders or invoices (today's rule, #384). Linking (#120) stays for a store customer whose contact is known; merging is for two contacts.
- Migration: none for the rule; the merge and the removal are services.

## DEC-043 Plans and packs keep unpublished changes on the server, edited in one editor shell

**Status: Accepted — 2026-09-26** — round-2 plans D and E

- Context: the Plan Editor and Pack Editor autosave. They show "Publish" for a new record and "Publish changes" for a live one, and offer Discard and Delete draft. A live plan's price or classes must not change under its members while someone is still typing.
- Decision: **a plan or a pack can be a Draft**, which is never offered on the site or at the desk. **A live one can carry one set of unpublished changes, stored on the server** beside it. Publish changes applies them in one step, and Discard throws them away. Both editors share **one editor shell** in the workspace: autosave, the publish banner, Publish, Publish changes, Discard, Delete draft, and a warning before leaving with unsaved work. Courses can use it later.
- Consequences: sales, subscribe and the site read only the published record. Publishing a price change keeps existing members on the price they bought at (ADR-007).
- Migration: a `DRAFT` status on plans and packs, and a pending-changes column on each.

## DEC-044 Courses wait for a later round; class packs go ahead

**Status: Accepted — 2026-09-26** — round-2 overview, "Later"

- Decision: **the Courses, Course Detail and Course Editor designs are not planned in this round.** Courses as built (ADR-007) keep working. **Class packs are in: Packs, Pack Detail and Pack Editor.** Nothing in this round removes or rewires a course feature. Shared pieces (the editor shell, per-session charging, the waitlist) are built so courses can use them later.

## DEC-045 Orders carry a fulfilment type, and shipping records the courier and tracking number

**Status: Accepted — 2026-09-26** — round-2 plan B · amends [ADR-008](./adr/ADR-008-operations-staff-gst-kitchen.md) "The kitchen stage sits under the order status" (collect or delivery)

- Context: today an order is Collect or Delivery, with a typed tracking link. The Orders designs have Pick-up, Local delivery, Shipping, Digital, and Appointment in person or online, each with its own steps and late rule.
- Decision: **an order has one of six fulfilment types**: Pick-up, Local delivery, Shipping, Digital, Appointment (in person) and Appointment (online). Each has its own steps under the order status, its own "late" rule and the stages it may use. **Shipping records the courier's name and the tracking number**, with an optional link. **Saroh does not book couriers**, so "Book pickup" is dropped. How an order is fulfilled can change until it is handed over.
- Consequences: Collect becomes Pick-up and Delivery becomes Local delivery, and the existing stages stay. An appointment order is fulfilled by its visits (bookings).
- Migration: widen the fulfilment enum and add courier and tracking-number columns; existing orders keep their meaning.

## DEC-046 Brand and fonts are their own track, and Saroh's fonts stop reaching merchant sites now

**Status: Accepted — 2026-09-26** — round-2 plans G and H

- Context: the Site Editor and Customer Site designs add a brand (any colour, backgrounds, heading and body fonts, a logo and automatic contrast), module pages, Hindi and more. Separately, `apps/saroh.app` loads Saroh's Geist and Bricolage Grotesque for every merchant site, and the booking flow styles its headings with `font-display`. That puts Saroh's brand on a merchant's page, which the `--site-*` rule forbids.
- Decision: **the font leak is a bug, fixed in the first phase**: merchant pages load no Saroh font, and the booking flow uses the site's own type tokens. **Brand v2** (per-site fonts, the brand API and panel, a logo and contrast) **is its own design-system epic**. **The site editor keeps free-form pages and adds module pages beside them.** **Hindi is a later step** of its own.
- Consequences: until Brand v2 ships, a merchant site's text uses a neutral system font stack, with its existing colours.
- Migration: none for the fix.

## DEC-047 Publishing while a page is in review stays allowed

**Status: Accepted — 2026-09-26** — keeps #278 · round-2 plan G

- Decision: **the bypass wins.** Someone with `site:publish` can still publish a page that is out for review, and the bypass is recorded as it is today (#278). The design's block on publishing during review is dropped.

## DEC-048 A storefront's people are on the business's team

**Status: Accepted — 2026-09-26** — round-2 plan F · amends the Team design note "Team is business-scoped"

- Context: a storefront has a "People who work on it" roster (`StoreMembers`: Admin, Manager, Editor, Viewer). The Team design says a role is held in a business and there is no second roster.
- Decision: **the storefront roster stays**, and **adding someone to a storefront also adds them to the business's team**. There is one roster underneath, and the storefront role is a narrower grant on top of it. Team Roles otherwise stays as it is, except that **the empty "Extra permissions" column is hidden** until something fills it.
- Consequences: inviting someone to a storefront needs the permission to invite them to the team. Removing someone from the team removes their storefront roles.
- Migration: a backfill that gives every storefront member without a business membership one, as a Member.
