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
