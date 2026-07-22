# Cross-Product UX Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn Saroh's existing service and commerce capabilities into clear, connected, mobile-accessible operational journeys built around enabled modules and customer work.

**Architecture:** Build shared UX composition patterns on the existing `@saroh/ui` foundation, then deliver four vertical releases: module-aware shell, shared customer operations, service/commerce workflows, and operational growth. Reuse existing domain APIs, introduce explicit read models where cross-module composition is needed, and keep accessibility and error/state behavior in every task's acceptance criteria.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Tailwind CSS, `@saroh/ui`, React Hook Form, Zod, TanStack Table, NestJS read APIs, Jest, `agent-browser` for rendered verification.

---

## Current baseline

The July 20 audit scored the product at 5.3/10, but recent commits have already landed the sidebar/mobile shell, command palette, shared `PageHeader`, `EmptyState`, DataTable adoption, validated forms, dark-mode control, brand CTA, and shared-UI consolidation. Before changing UI, regenerate a delta against the current branch; do not reimplement closed issues #91–#102, #108, or #109.

AI is excluded. The former design-system M5 AI item conflicts with `DEC-015` and must remain deferred.

## Release 1: Modular foundation and navigation

### Task 1: Refresh the UX baseline and task metrics

**Files:**

- Create: `docs/design-system/17_CURRENT_STATE_DELTA.md`
- Modify: `docs/design-system/00_FINAL_REPORT.md`
- Modify: `docs/design-system/11_DESIGN_BACKLOG.md`
- Modify: `docs/design-system/12_IMPLEMENTATION_PLAN.md`

**Step 1: Re-audit recently changed surfaces**

Verify the current shell, mobile navigation, command palette, forms, DataTables, theme control, brand button, PageHeader, and EmptyState. Mark old findings resolved, partial, or still present with commit evidence.

**Step 2: Define task success measures**

Record baseline clicks/time/errors for:

- enable a module;
- publish a site;
- create and progress a lead;
- create a service and booking;
- create a product and fulfil an order;
- connect a provider;
- find one customer's history.

**Step 3: Correct roadmap conflicts**

Remove AI from the active UX implementation milestone and link to `DEC-015`. Replace size-based assumptions with need-based module selection.

**Step 4: Verify and commit**

Run documentation link checks and `git diff --check`.

Commit: `docs(ux): refresh audit baseline and task measures`

### Task 2: Make context and capability navigation unambiguous

**Files:**

- Modify: `apps/app.saroh.in/components/shared/app-shell.tsx`
- Modify: `apps/app.saroh.in/components/shared/app-header.tsx`
- Modify: `apps/app.saroh.in/components/shared/app-sidebar.tsx`
- Modify: `apps/app.saroh.in/components/shared/mobile-nav.tsx`
- Modify: `apps/app.saroh.in/components/shared/nav-items.tsx`
- Modify: `apps/app.saroh.in/components/shared/command-menu.tsx`
- Create: `apps/app.saroh.in/components/shared/context-bar.tsx`
- Create: `apps/app.saroh.in/components/shared/quick-create.tsx`

**Step 1: Write pure projection tests**

Test navigation and quick actions for Organization-only context, a Project with CRM+Appointments, a Project with Commerce, a hybrid Project, and restricted MEMBER access.

**Step 2: Add the context bar**

Show Organization, optional Project, effective role, and module-readiness attention without consuming excessive vertical space. Context changes must have a clear loading state and preserve a valid destination or redirect to Home.

**Step 3: Add capability-aware quick-create**

Offer only valid actions: customer, lead, booking, service, product, order, site. Disabled/setup-required modules link to setup rather than presenting a failing form.

**Step 4: Browser verification**

At 390x844 and 1440x1000, verify keyboard navigation, current-page state, drawer focus restoration, 200% zoom, long Organization/Project names, and no inaccessible action leakage.

Commit: `feat(app): clarify context and module navigation`

### Task 3: Build the module onboarding experience

**Files:**

- Modify: `apps/app.saroh.in/app/onboarding/page.tsx`
- Modify: `apps/app.saroh.in/components/organizations/create-organization-form.tsx`
- Create: `apps/app.saroh.in/app/onboarding/modules/page.tsx`
- Create: `apps/app.saroh.in/components/modules/module-goal-picker.tsx`
- Create: `apps/app.saroh.in/components/modules/setup-progress.tsx`

**Step 1: Test onboarding state transitions**

Organization creation remains minimal. Module choice follows it and supports Website, Services, Commerce, or any combination. Skipping module selection is allowed and leads to Settings → Modules.

**Step 2: Build need-based selection copy**

Ask what the business needs to do, not how large it is. Explain that modules can change later without losing data.

**Step 3: Generate setup tasks from readiness blockers**

Do not hardcode a second setup model in the frontend. Translate API blocker codes into actionable steps and deep links.

**Step 4: Verify and commit**

Browser-test no-module, service-only, commerce-only, and hybrid onboarding on mobile and desktop.

Commit: `feat(app): add need-based module onboarding`

## Release 2: Shared customer operations

### Task 4: Replace store-first Home with next actions

**Files:**

- Modify: `apps/app.saroh.in/app/page.tsx`
- Create: `apps/app.saroh.in/components/home/home-dashboard.tsx`
- Create: `apps/app.saroh.in/components/home/setup-checklist.tsx`
- Create: `apps/app.saroh.in/components/home/next-actions.tsx`
- Create: `apps/app.saroh.in/components/home/recent-activity.tsx`
- Create: `apps/app.saroh.in/lib/home/service.ts`
- Create: `apps/api.saroh.in/src/modules/home/home.controller.ts`
- Create: `apps/api.saroh.in/src/modules/home/home.service.ts`
- Create: `apps/api.saroh.in/src/modules/home/home.service.spec.ts`

**Step 1: Write ranking tests**

The highest-severity setup/operational action appears first. Examples: provider failure before create-product suggestion; overdue follow-up before generic analytics; no appointment actions when Appointments is disabled.

**Step 2: Build one aggregated read endpoint**

Return small counts and recent records; avoid frontend waterfalls. Respect Project scope and permissions.

**Step 3: Build Home states**

Cover new Organization, partially configured, active service business, active commerce business, hybrid, restricted MEMBER, API error, and no recent activity.

**Step 4: Verify and commit**

Prove the page has one primary next action, no store-size assumptions, and no hidden module leakage.

Commit: `feat(app): make Home action oriented`

### Task 5: Create the unified customer workspace safely

**Files:**

- Create: `packages/database/prisma/migrations/<timestamp>_add_customer_identity_links/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `apps/api.saroh.in/src/modules/customer-workspace/customer-workspace.module.ts`
- Create: `apps/api.saroh.in/src/modules/customer-workspace/customer-workspace.service.ts`
- Create: `apps/api.saroh.in/src/modules/customer-workspace/customer-workspace.controller.ts`
- Create: `apps/api.saroh.in/src/modules/customer-workspace/customer-workspace.service.spec.ts`
- Create: `apps/app.saroh.in/app/customers/page.tsx`
- Create: `apps/app.saroh.in/app/customers/[subjectId]/page.tsx`
- Create: `apps/app.saroh.in/components/customers/customer-timeline.tsx`
- Create: `apps/app.saroh.in/components/customers/identity-link-dialog.tsx`

**Step 1: Write identity-safety tests**

Never auto-link by name. Exact normalized email/phone can create a suggestion, not a merge. Confirmed links are Organization-scoped, auditable, reversible, and cannot cross Organizations.

**Step 2: Add an explicit link record**

Link Contact and commerce Customer records without merging or changing their domain ownership. Preserve provenance and actor.

**Step 3: Build a timeline read model**

Combine leads/activities, bookings, orders, payments, messages, consent, and tasks into stable typed events. Exclude unavailable modules and unauthorized Projects.

**Step 4: Build list/detail UX**

The list distinguishes CRM-only, commerce-only, and linked people. The detail shows identity, next action, module summaries, and chronological activity with empty/error states.

**Step 5: Verify and commit**

Run two-Organization adversarial tests and browser-test long histories, duplicate suggestions, unlinking, mobile timeline, and keyboard operation.

Commit: `feat(customers): add unified customer workspace`

## Release 3: Service and commerce excellence

### Task 6: Complete the appointment operations journey

**Files:**

- Create: `apps/app.saroh.in/app/appointments/page.tsx`
- Create: `apps/app.saroh.in/app/appointments/calendar/page.tsx`
- Create: `apps/app.saroh.in/app/appointments/settings/page.tsx`
- Modify or redirect: `apps/app.saroh.in/app/services/**`
- Modify or redirect: `apps/app.saroh.in/app/bookings/**`
- Create: `apps/app.saroh.in/components/appointments/appointment-calendar.tsx`
- Create: `apps/app.saroh.in/components/appointments/booking-detail-sheet.tsx`
- Modify: existing API bookings/services endpoints only where the UX needs missing queries

**Step 1: Write journey tests**

Cover enable → create service → availability → public booking → confirmation → owner view → reschedule/cancel → customer timeline. Include timezone, no availability, provider missing, payment optional, and disabled-module behavior.

**Step 2: Unify navigation, not domain concepts**

Appointments becomes one module with Schedule, Services, and Settings views. Services remain reusable booking definitions; bookings remain immutable operational records.

**Step 3: Add calendar/list responsive modes**

Desktop may use calendar; mobile defaults to agenda. Never force horizontal calendar scrolling for core operations.

**Step 4: Verify and commit**

Complete the journey keyboard-only and at mobile/desktop viewports. Confirm no double booking regression.

Commit: `feat(appointments): unify service and booking operations`

### Task 7: Complete the commerce operations journey

**Files:**

- Create: `apps/app.saroh.in/app/commerce/page.tsx`
- Create: `apps/app.saroh.in/app/commerce/orders/page.tsx`
- Create: `apps/app.saroh.in/app/commerce/catalog/page.tsx`
- Create: `apps/app.saroh.in/app/commerce/settings/page.tsx`
- Reuse/redirect: `apps/app.saroh.in/app/stores/[storeId]/{orders,products,customers}/**`
- Create: `apps/app.saroh.in/components/commerce/order-workspace.tsx`
- Create: `apps/app.saroh.in/components/commerce/inventory-alerts.tsx`
- Modify: order/product APIs for Organization rollups and pagination

**Step 1: Write Organization/Project rollup tests**

OWNER/ADMIN see all allowed channel records; MEMBER sees grant-scoped Project data only after the relevant records support `projectId`. Totals, filters, and pagination must reconcile.

**Step 2: Build org-level operational views**

Commerce Home shows orders requiring action, payment/refund exceptions, and low stock. Stores remain sales channels/configuration rather than the primary application shell.

**Step 3: Build dense and mobile representations**

Use DataTable on desktop and task-focused cards/sheets on narrow screens. Preserve URL-backed search, filters, sorting, and pagination.

**Step 4: Verify and commit**

Test catalog → checkout → paid order → fulfilment → refund → customer timeline, including Cashfree/Razorpay failure and replay-safe webhook states.

Commit: `feat(commerce): add organization-wide operations workspace`

## Release 4: Operations and growth

### Task 8: Add provider and dependency health

**Files:**

- Create: `apps/app.saroh.in/app/settings/providers/page.tsx`
- Create: `apps/app.saroh.in/components/providers/provider-health-card.tsx`
- Create: `apps/api.saroh.in/src/modules/provider-health/provider-health.module.ts`
- Create: `apps/api.saroh.in/src/modules/provider-health/provider-health.service.ts`
- Create: `apps/api.saroh.in/src/modules/provider-health/provider-health.service.spec.ts`

**Step 1: Test redaction and health semantics**

Health checks never return secrets. Distinguish not configured, verification pending, active, degraded, and failed. Rate-limit live provider checks and prefer last-known webhook/delivery evidence.

**Step 2: Build one provider settings surface**

Separate merchant payments, Saroh billing, business communication, identity email, domain verification, and storage concepts. Show ownership and impact clearly.

**Step 3: Connect readiness blockers**

Module setup cards deep-link to the exact provider action. Provider failure creates an actionable Home alert.

**Step 4: Verify and commit**

Test credential redaction, OWNER/ADMIN access, MEMBER denial, mobile layout, and recovery actions.

Commit: `feat(settings): surface provider and dependency health`

### Task 9: Add saved views, bulk actions, and cross-module insights

**Files:**

- Create: `packages/database/prisma/migrations/<timestamp>_add_saved_views/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `apps/api.saroh.in/src/modules/saved-views/**`
- Modify: `apps/app.saroh.in/components/stores/{orders-table,products-table,customers-table}.tsx`
- Modify: CRM and appointment list components
- Modify: `apps/app.saroh.in/app/analytics/page.tsx`
- Modify: `apps/app.saroh.in/components/analytics/analytics-dashboard.tsx`

**Step 1: Test safe bulk-operation contracts**

Bulk commands are authorized per record, idempotent, bounded, auditable, and return partial-failure detail. Saved filters contain no unsafe raw SQL and are actor/Organization scoped.

**Step 2: Add URL-backed filters before persistence**

Search, filters, sort, and page must be shareable and survive reload. Persist a view only after the URL contract is stable.

**Step 3: Add decision-oriented insights**

Show enquiry→lead, booking, order, payment, and communication outcomes only for enabled modules. Explain zero/no-data versus disabled/unauthorized.

**Step 4: Verify and commit**

Test large datasets, 320px reflow, keyboard table controls, screen-reader labels, and aggregate tenant isolation.

Commit: `feat(operations): add saved views bulk actions and insights`

### Task 10: Cross-release quality and activation gate

**Files:**

- Create: `apps/app.saroh.in/tests/activation/*.spec.ts` using the repository's approved browser-test approach
- Modify: `docs/design-system/13_ACCESSIBILITY_GUIDE.md`
- Modify: `docs/design-system/14_RESPONSIVE_GUIDE.md`
- Modify: `docs/architecture/IMPLEMENTATION_BACKLOG.md`

**Step 1: Automate the four activation variants**

Cover service-only, commerce-only, hybrid, and no-module Organizations. Include OWNER, ADMIN, and restricted MEMBER.

**Step 2: Apply quality thresholds to every journey**

- no inaccessible module/action leakage;
- no keyboard traps;
- visible focus and restored focus;
- WCAG AA contrast in light/dark;
- reduced-motion compliance;
- 320px/390px reflow without hidden operations;
- deliberate loading, empty, error, success, disabled, setup, attention, and forbidden states;
- no client-side-only authorization or entitlement gate.

**Step 3: Measure activation**

Capture module enabled, setup completed, first publish/lead/booking/order/provider connection, and time-to-first-value using the canonical analytics event model without customer PII.

**Step 4: Run final gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Run rendered checks for every changed route using `agent-browser` and attach the evidence to the corresponding issue/PR.

Commit: `test(ux): gate modular activation journeys`

---

## Detailed execution packets

Each packet must produce one reviewable user outcome and rendered evidence. Backend work that is shared with epic #110 lands first; UI must not fake unavailable APIs.

| Packet | GitHub issue | User-visible outcome                       | Depends on        | Evidence required                 |
| ------ | ------------ | ------------------------------------------ | ----------------- | --------------------------------- |
| U-00A  | #118         | Current audit reflects shipped remediation | None              | Source delta and screenshots      |
| U-00B  | #118         | Baseline task metrics exist                | U-00A             | Reproducible task script          |
| U-01A  | #119         | Need-based module selection                | #115              | Four onboarding variants          |
| U-01B  | #119         | Setup checklist from readiness             | U-01A             | Setup/error/skip states           |
| U-01C  | #119         | Action-oriented Home                       | #117              | Six role/module fixtures          |
| U-02A  | #120         | Safe identity-link domain                  | #117              | Cross-tenant and reversal tests   |
| U-02B  | #120         | Customer timeline read model               | U-02A             | Event-order contract tests        |
| U-02C  | #120         | Customer list/detail UI                    | U-02B             | Mobile/desktop/keyboard evidence  |
| U-03A  | #121         | Appointments route and shell               | #117              | Legacy redirect and nav tests     |
| U-03B  | #121         | Calendar/agenda and booking detail         | U-03A             | DST/mobile/keyboard evidence      |
| U-04A  | #122         | Organization commerce rollup API           | #117              | Reconciliation tests              |
| U-04B  | #122         | Commerce operations workspace              | U-04A             | Large-data and mobile evidence    |
| U-05A  | #123         | Provider health read model                 | #114              | Redaction tests                   |
| U-05B  | #123         | Provider settings/recovery UX              | U-05A             | Degraded/recovery evidence        |
| U-06A  | #124         | URL-backed filters                         | U-02C/U-03B/U-04B | Reload/share tests                |
| U-06B  | #124         | Saved views and bulk commands              | U-06A             | Idempotency/partial failure tests |
| U-06C  | #124         | Cross-module insights                      | U-06B             | Aggregate reconciliation          |
| U-07A  | #125         | Automated activation journeys              | All above         | Four capability variants          |
| U-07B  | #125         | Accessibility/responsive release gate      | U-07A             | Automated and manual evidence     |

## Current route transition map

Preserve bookmarks and provide server redirects during IA changes.

| Current route                 | Target route                                | Transition behavior                                                             |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| `/`                           | `/`                                         | Replace store list with Home; stores remain linked from Commerce                |
| `/contacts`                   | `/customers?view=crm`                       | Temporary redirect after customer workspace is complete                         |
| `/contacts/[contactId]`       | `/customers/[subjectId]`                    | Resolve a Contact-backed subject; preserve query/referrer                       |
| `/leads`                      | `/customers/leads` or stable `/leads` alias | Keep pipeline workflow addressable; do not bury leads inside commerce customers |
| `/services`                   | `/appointments/services`                    | Permanent redirect only after new route parity                                  |
| `/services/[serviceId]`       | `/appointments/services/[serviceId]`        | Preserve edit deep links                                                        |
| `/bookings`                   | `/appointments`                             | Default to agenda/list                                                          |
| `/stores/[storeId]/orders`    | `/commerce/orders?store=<id>`               | Preserve Store filter in URL                                                    |
| `/stores/[storeId]/products`  | `/commerce/catalog?store=<id>`              | Preserve Store filter in URL                                                    |
| `/stores/[storeId]/customers` | `/customers?store=<id>&view=commerce`       | Preserve source context                                                         |
| `/analytics`                  | `/insights`                                 | Redirect only when Insights is enabled; Settings remains discoverable otherwise |

Do not move a route until target behavior, permissions, loading/error states, and analytics attribution match. Maintain redirects for at least one stable release cycle and instrument their use before removal.

## Shared screen-state contract

Every new or changed screen must intentionally implement these states:

| State              | Required content                              | Primary action rule                  | Accessibility requirement                                          |
| ------------------ | --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Loading            | Skeleton mirrors final structure              | None                                 | `aria-busy` only where meaningful; avoid announcing every skeleton |
| Empty              | What the module does and why it matters       | One creation/setup action            | Heading and description are programmatically associated            |
| Setup required     | Exact missing dependency                      | Deep link to first solvable blocker  | Do not communicate only through color                              |
| Active             | Operational data and next action              | At most one dominant CTA             | Logical headings and landmark structure                            |
| Attention required | Impact, evidence time, recovery               | One recovery action                  | `role=status` for new non-blocking health changes                  |
| Error              | User-safe explanation and correlation ID      | Retry or safe navigation             | Focus moves to error summary after failed submit/navigation        |
| Forbidden          | What is unavailable without leaking existence | Return to accessible context         | No upsell when authorization is the blocker                        |
| Disabled           | Retained-history explanation                  | OWNER/ADMIN: enable; MEMBER: none    | Never masquerade as 404 when history is intentionally readable     |
| Archived           | Read-only history and archive date            | Reactivate when safe                 | Controls expose disabled/read-only state semantically              |
| Success            | What completed and what happens next          | Next useful action, not generic Done | Announce once; restore focus predictably                           |

Use `@saroh/ui` `PageHeader`, `EmptyState`, `Alert`, `Skeleton`, `Button`, `Form`, `DataTable`, `Sheet`, and `Dialog`. Add a new shared primitive only when at least three screens need the same anatomy.

## Module onboarding specification

### Screen 1: Organization

Ask only name and required business identity fields. On successful creation, route to `/onboarding/modules`; do not present eight modules in the Organization form.

### Screen 2: Needs

Present task-oriented choices rather than technical module names:

- “Publish a website and collect enquiries” → Website + CRM suggestion.
- “Manage leads and follow-ups” → CRM.
- “Accept appointments” → CRM + Appointments.
- “Sell products online” → Commerce; suggest Payments.
- “Send business messages” → CRM + Communications.
- “Understand performance” → Insights, with dependency explanation.

Users may choose any combination, review the actual module list, or skip. Never ask number of employees, revenue, or business size to determine availability.

### Screen 3: Setup

Render server blocker codes in dependency order. Example for paid appointments:

1. Create service.
2. Add availability.
3. Connect Razorpay or Cashfree.
4. Publish booking section.
5. Send a self-test confirmation.

Completion updates from the availability API. The UI must not mark a step complete optimistically before the server confirms readiness.

## Home ranking contract

The Home endpoint returns candidates; the server ranks them consistently:

```ts
type HomeAction = {
    id: string;
    kind: "BLOCKER" | "OVERDUE" | "OPERATIONAL" | "SETUP" | "GROWTH";
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    moduleKey?: ModuleKey;
    title: string;
    description: string;
    href: string;
    occurredAt?: string;
};
```

Sort by:

1. Critical provider/security/financial blockers.
2. High-impact overdue tasks, failed deliveries, payment/refund exceptions, and bookings requiring action.
3. Active operational work due today.
4. Setup blockers for enabled modules.
5. Growth suggestions based on completed prerequisites.

Tie-break with oldest unresolved operational item, then stable ID. Return no more than five actions and one dominant action. Do not infer “recommended” from business size.

Home response shape:

```json
{
    "primaryAction": {},
    "secondaryActions": [],
    "setup": { "completed": 3, "total": 5, "items": [] },
    "recentActivity": [],
    "moduleSummaries": [],
    "generatedAt": "2026-07-22T00:00:00.000Z"
}
```

Use bounded counts and recent rows. Do not make the frontend issue one request per module.

## Unified customer workspace contract

### Identity-link model

The final schema may use a neutral name such as `CustomerIdentityLink`:

```prisma
model CustomerIdentityLink {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  contactId      String
  contact        Contact      @relation(fields: [contactId], references: [id], onDelete: Cascade)
  customerId     String
  customer       Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  status         String       @default("CONFIRMED")
  reason         String
  confirmedByUserId String
  createdAt      DateTime     @default(now())
  revokedAt      DateTime?
  revokedByUserId String?
  @@unique([organizationId, contactId, customerId])
  @@index([organizationId, contactId])
  @@index([organizationId, customerId])
}
```

Add compound ownership validation so both linked records belong to the same Organization. Because commerce Customer is currently store-specific with nullable `organizationId`, complete/verify its Organization migration before enabling links.

### Linking rules

- Never link by name alone.
- Exact normalized email is a high-confidence suggestion, not automatic confirmation, unless the commerce record was created from the same authenticated/transactional identity flow.
- Exact normalized phone is a suggestion only.
- Conflicting email or phone is displayed clearly before confirmation.
- Revocation does not delete either record or its history.
- Suggestions rejected by a user are remembered so they do not reappear immediately.
- Every confirm/revoke action emits an Organization audit event.

### Timeline event contract

```ts
type CustomerTimelineEvent = {
    id: string;
    source: "CRM" | "APPOINTMENTS" | "COMMERCE" | "PAYMENTS" | "COMMUNICATIONS";
    type: string;
    occurredAt: string;
    title: string;
    summary?: string;
    status?: string;
    amountMinor?: number;
    currency?: string;
    actor?: { id: string; displayName: string };
    href?: string;
};
```

Order descending by `occurredAt`, then source priority, then stable ID. Paginate with a cursor; do not load an unlimited customer history. Currency amounts use shared minor-unit formatters. Raw message content, provider payloads, and private submission data are not included in the list projection.

## Appointment experience specification

### Information architecture

- `/appointments`: agenda/list with today/upcoming/attention segments.
- `/appointments/calendar`: week/month visual planning for wide screens.
- `/appointments/services`: reusable services.
- `/appointments/services/[serviceId]`: service, availability, public booking settings.
- `/appointments/settings`: timezone, defaults, providers, cancellation rules.

### Core journey acceptance

1. Enable CRM and Appointments.
2. Create a service with duration, capacity, timezone, and optional price.
3. Add availability and preview next slots.
4. Publish a booking section.
5. Visitor chooses slot and submits details.
6. Booking is committed once under concurrency.
7. Owner sees it in agenda; customer timeline links it.
8. Confirmation delivery status is visible.
9. Owner reschedules/cancels according to policy.
10. Analytics reflects the outcome after aggregation.

The mobile primary view is an agenda. Calendar cells must not be the only way to inspect or act on a booking.

## Commerce experience specification

### Information architecture

- `/commerce`: operational queue and KPIs.
- `/commerce/orders`: Organization rollup with Store/Project filters.
- `/commerce/orders/[orderId]`: items, customer, payment, fulfilment, refund, and audit timeline.
- `/commerce/catalog`: products, variants, inventory, categories.
- `/commerce/settings`: channels/stores, checkout, payment provider, order defaults.

### Operational priority

Commerce Home ranks:

1. payment/refund/reconciliation failures;
2. paid orders awaiting fulfilment;
3. cancelled/failed orders needing review;
4. low stock or oversell risk;
5. incomplete provider/catalog setup;
6. informational revenue/conversion metrics.

Organization rollups must be computed server-side with filters and pagination. Do not fetch every Store in the browser and merge totals client-side.

### Responsive behavior

- Desktop: DataTable with selectable rows, column headers, filters, sort, and pagination.
- Mobile: summary cards showing status, customer, total, time, and one next action; full detail opens as a page or Sheet.
- Bulk actions appear only after selection and remain within a sticky action region that does not cover content or safe areas.

## Provider-health contract

```ts
type ProviderHealth = {
    domain:
        | "MERCHANT_PAYMENTS"
        | "SAROH_BILLING"
        | "BUSINESS_EMAIL"
        | "WHATSAPP"
        | "DOMAIN"
        | "STORAGE";
    provider: string;
    status: "NOT_CONFIGURED" | "PENDING" | "ACTIVE" | "DEGRADED" | "FAILED";
    checkedAt?: string;
    lastSuccessAt?: string;
    reasonCode?: string;
    recoveryHref?: string;
};
```

Never include access keys, secret fragments, webhook secrets, encrypted blobs, or raw provider responses. `reasonCode` maps to reviewed copy. A live provider check is a privileged, rate-limited command; normal page loads use stored health evidence.

## Saved-view and bulk-operation contracts

### URL query contract

Use stable names shared by server and client:

```text
?q=<search>&status=<csv>&store=<id>&project=<id>&sort=<field>:<asc|desc>&page=<positive-int>&pageSize=<25|50|100>
```

Reject unknown sort/filter fields. Clamp page size. Clear dependent filters when Organization/Project context changes.

### Saved view

```ts
type SavedViewDefinition = {
    resource: "CUSTOMERS" | "LEADS" | "BOOKINGS" | "ORDERS" | "PRODUCTS";
    name: string;
    query: Record<string, string | string[]>;
    visibility: "PRIVATE" | "ORGANIZATION";
};
```

Private views belong to the actor; Organization views require an explicit manage action. Never persist raw SQL, arbitrary JSON operators, inaccessible Project IDs, or secrets.

### Bulk result

```ts
type BulkOperationResult = {
    operationId: string;
    requested: number;
    succeeded: Array<{ id: string }>;
    failed: Array<{ id: string; code: string; message: string }>;
};
```

Require an idempotency key and cap each synchronous batch. Large operations use the existing durable job runner and expose progress/retry without reapplying successful records.

## Activation analytics contract

Extend the canonical event registry with versioned, PII-minimized events:

| Event                           | When emitted                      | Required properties                           |
| ------------------------------- | --------------------------------- | --------------------------------------------- |
| `module.enabled.v1`             | Server commits enablement         | organizationId, moduleKey, optional projectId |
| `module.setup_completed.v1`     | Readiness first becomes Active    | organizationId, moduleKey, duration bucket    |
| `organization.first_value.v1`   | First approved value event        | organizationId, valueType, elapsed bucket     |
| `site.first_published.v1`       | First publication                 | organizationId, optional projectId            |
| `crm.first_lead_progressed.v1`  | First non-default stage movement  | organizationId, optional projectId            |
| `appointments.first_booking.v1` | First confirmed booking           | organizationId, optional projectId            |
| `commerce.first_paid_order.v1`  | First reconciled paid order       | organizationId, optional projectId            |
| `provider.first_connected.v1`   | First healthy provider per domain | organizationId, provider domain only          |

Do not emit customer identity, email, phone, order contents, message content, credentials, or free-form setup data. Deduplicate first-value events at the server/database boundary.

## Rendered verification matrix

For each changed screen capture and inspect:

| Dimension | Required cases                                                                   |
| --------- | -------------------------------------------------------------------------------- |
| Viewport  | 1440x1000, 1024x768 when structure changes, 390x844, 320x568 for dense screens   |
| Theme     | Light and dark                                                                   |
| Motion    | Normal and `prefers-reduced-motion`                                              |
| Data      | Empty, typical, high count, long names/content                                   |
| State     | Loading, setup, active, attention, error, forbidden, disabled, archived, success |
| Role      | OWNER, ADMIN, restricted MEMBER                                                  |
| Context   | Organization-only, selected Project, inaccessible Project attempt                |
| Input     | Keyboard-only, pointer/touch, 200% zoom                                          |

Use `agent-browser` consistently:

```bash
agent-browser open http://127.0.0.1:3003/<route>
agent-browser snapshot -i
agent-browser screenshot docs/design-system/_evidence/screenshots/<issue>/<route>-<viewport>-<state>.png
```

Record the commit, fixture, viewport, theme, role, Organization, Project, and state beside each screenshot. A screenshot is supporting evidence, not proof of keyboard behavior; record the actual focus sequence separately.

## Per-PR UX review checklist

- The changed route has one clear purpose and dominant action.
- Organization/Project/module context is visible and correct.
- Disabled versus unauthorized versus no-data is distinguishable.
- All API errors use safe copy and preserve a correlation ID.
- Forms have labels, descriptions where needed, inline errors, `aria-invalid`, submission locking, and focus on the first error.
- Tables have accessible headers; mobile retains every essential action.
- Dialog/Sheet focus is trapped, restored, and dismissible as appropriate.
- Status never relies on color alone.
- Touch targets meet 44px ergonomic guidance on mobile.
- Reduced motion is honored; no essential information depends on animation.
- Long names, Indian currency/date conventions, zero values, and high counts render correctly.
- The server enforces authorization, entitlement, module availability, and Project scope.
- Product analytics contains no customer PII.

## Definition of done for epic #111

- Issues #118–#125 are closed with linked commits and rendered verification.
- The refreshed audit does not list already shipped work as pending.
- Need-based onboarding supports no-module, service-only, commerce-only, and hybrid Organizations.
- Home presents a server-ranked next action without module or permission leakage.
- Customer identity links are explicit, auditable, reversible, and tenant-safe.
- Appointment and commerce activation journeys complete on desktop and mobile.
- Provider health is redacted and actionable.
- Filters are URL-backed; saved views and bulk operations are bounded and authorized.
- Insights reconcile to source records and show only enabled/authorized modules.
- Core flows pass keyboard, focus, contrast, dark mode, reduced motion, 320px/390px, 200% zoom, and all shared state checks.
- Time-to-first-value events are deduplicated and contain no customer PII.
- No AI feature, route, dependency, or active milestone is added.
