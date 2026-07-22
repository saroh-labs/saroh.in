# Modular Capabilities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an Organization enable business capabilities by need, let its Projects select from those capabilities, and enforce module availability consistently across the API and product shell.

**Architecture:** Add a typed module registry and Organization/Project installation records without reusing feature flags or entitlements. A central `ModuleAvailabilityService` composes rollout, Organization enablement, Project selection, entitlement, authorization, dependencies, and module-specific readiness; APIs enforce it and the frontend consumes a read model for navigation and setup guidance.

**Tech Stack:** NestJS, Prisma/PostgreSQL, TypeScript, Next.js App Router, React Server Components, React Hook Form, Zod, `@saroh/ui`, Jest, existing Organization/Project authorization and audit infrastructure.

---

## Product invariants

- Organization is the only tenant and owns module installations.
- Projects can select only modules enabled by their Organization.
- OWNER and ADMIN can inspect every Project; MEMBER access remains grant-based.
- Feature flags, module configuration, entitlements, and authorization are separate decisions.
- Disabling stops new activity but never deletes historical records.
- `SETUP_REQUIRED` and `ATTENTION_REQUIRED` are derived readiness states, not persisted lifecycle values.
- Existing Organizations are backfilled from evidence of current use so deployed functionality does not disappear.
- AI is not a module in this plan.

## Task 1: Record the module architecture decision and typed registry

**Files:**

- Create: `docs/architecture/adr/ADR-003-organization-modules.md`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-registry.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-registry.spec.ts`
- Modify: `docs/architecture/DECISIONS.md`

**Step 1: Write the failing registry tests**

Test uniqueness, dependency validity, cycle detection, known root routes, and the absence of `AI`.

```ts
expect(validateModuleRegistry(MODULES)).toEqual({ valid: true });
expect(() => validateModuleRegistry(cyclicRegistry)).toThrow("cycle");
expect(MODULES.some((module) => module.key === "AI")).toBe(false);
```

Run: `pnpm --filter @saroh/api test -- module-registry.spec.ts`

Expected: FAIL because the registry does not exist.

**Step 2: Define the initial keys**

```ts
export const MODULE_KEYS = [
    "WEBSITE",
    "CRM",
    "APPOINTMENTS",
    "COMMERCE",
    "PAYMENTS",
    "COMMUNICATIONS",
    "AUTOMATIONS",
    "INSIGHTS",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
```

Each descriptor contains label, description, dependencies, root routes, required `OrgAction`, Project support, and deactivation policy identifier. Start with conservative dependencies: Payments depends on Appointments or Commerce at readiness time; Automations depends on CRM or Commerce; Insights requires at least one event-producing module.

**Step 3: Document the four independent gates**

ADR-003 must define rollout flag, module installation, entitlement, and authorization semantics; safe disabling; Project selection; backfill; and why readiness is derived.

**Step 4: Run tests and commit**

```bash
pnpm --filter @saroh/api test -- module-registry.spec.ts
pnpm --filter @saroh/api typecheck
git diff --check
```

Commit: `docs(architecture): define organization module capabilities`

## Task 2: Persist Organization and Project module selection

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_organization_modules/migration.sql`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-backfill.spec.ts`

**Step 1: Write migration-contract tests**

Assert unique Organization/module and Project/module rows, Organization-consistent Project references, lifecycle values, actor/timestamp metadata, and indexes used by availability queries.

**Step 2: Add persistence models**

Use string keys validated through the registry to permit forward-compatible migrations:

```prisma
model OrganizationModule {
  id              String       @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  moduleKey       String
  status          String       @default("DISABLED")
  enabledAt       DateTime?
  enabledByUserId String?
  disabledAt      DateTime?
  disabledByUserId String?
  config          Json?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  projects        ProjectModule[]
  @@unique([organizationId, moduleKey])
  @@index([organizationId, status])
}

model ProjectModule {
  id                   String             @id @default(cuid())
  projectId            String
  project              Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  organizationModuleId String
  organizationModule   OrganizationModule @relation(fields: [organizationModuleId], references: [id], onDelete: Cascade)
  createdAt            DateTime           @default(now())
  @@unique([projectId, organizationModuleId])
  @@index([projectId])
}
```

Add a SQL constraint or trigger that prevents a Project from referencing another Organization's installation. Do not rely only on application code.

**Step 3: Backfill without hiding existing data**

Enable modules for Organizations with corresponding records: Site/Form → Website; Lead/Pipeline → CRM; Service/Booking → Appointments; Store/Product/Order → Commerce; merchant providers/payment intents → Payments; providers/messages → Communications; automation rules/runs → Automations; analytics events/aggregates → Insights. Enable declared dependencies in the same migration.

**Step 4: Verify migration and commit**

Run the isolated integration database migration and backfill test twice.

Commit: `feat(database): persist organization and project modules`

## Task 3: Implement module lifecycle and availability services

**Files:**

- Create: `apps/api.saroh.in/src/modules/capabilities/capabilities.module.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-lifecycle.service.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-availability.service.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-lifecycle.service.spec.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-availability.service.spec.ts`
- Modify: `apps/api.saroh.in/src/app.module.ts`
- Modify: `apps/api.saroh.in/src/modules/organizations/organization-policy.ts`

**Step 1: Add failing policy and matrix tests**

Cover OWNER/ADMIN management, MEMBER denial, dependency failures, disabled modules, unselected Project modules, entitlement denial, rollout kill-switch, and OWNER/ADMIN Project visibility.

**Step 2: Add explicit actions**

Add `module:read` and `module:manage` to `OrgAction`; MEMBER may read only effective availability for authorized Projects, while OWNER/ADMIN manage Organization and Project selection.

**Step 3: Implement lifecycle commands**

`enable`, `disable`, `archive`, and `selectForProject` must validate the registry, dependencies, same-Organization ownership, and audit every mutation. Use a transaction for installation and audit events.

**Step 4: Implement the effective availability result**

Return a typed result rather than a boolean:

```ts
type ModuleAvailability = {
    key: ModuleKey;
    configured: boolean;
    selectedForProject: boolean;
    rolloutAllowed: boolean;
    entitled: boolean;
    authorized: boolean;
    readiness: "DISABLED" | "SETUP_REQUIRED" | "ACTIVE" | "ATTENTION_REQUIRED";
    blockers: Array<{ code: string; actionHref?: string }>;
};
```

**Step 5: Verify and commit**

Run unit tests, Organization policy tests, typecheck, and lint.

Commit: `feat(api): enforce modular capability availability`

## Task 4: Add readiness and safe-deactivation adapters

**Files:**

- Create: `apps/api.saroh.in/src/modules/capabilities/readiness/module-readiness.port.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/readiness/module-readiness.registry.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/readiness/module-readiness.registry.spec.ts`
- Modify: existing services under `sites`, `bookings`, `orders`, `payments`, `communications`, `automations`, and `analytics`

**Step 1: Write failing readiness/deactivation tests**

Examples:

- Website is setup-required without a site and active when a publication exists.
- Payments is setup-required without a verified provider and attention-required when credentials fail.
- Commerce cannot fully disable while public checkout/payment reconciliation is active.
- Appointments pause new booking slots but retain existing booking management.

**Step 2: Implement adapters with count/existence queries**

Avoid loading whole domain datasets. Each adapter returns readiness blockers and deactivation blockers/actions.

**Step 3: Enforce at command boundaries**

Apply availability checks to new commands first, then existing create/update endpoints module by module. Public routes return a deliberate unavailable response, never an internal authorization message.

**Step 4: Verify and commit**

Run all affected domain tests and the API integration suite.

Commit: `feat(api): add module readiness and safe deactivation`

## Task 5: Expose Organization and Project module APIs

**Files:**

- Create: `apps/api.saroh.in/src/modules/capabilities/capabilities.controller.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/dto.ts`
- Create: `apps/api.saroh.in/src/modules/capabilities/capabilities.controller.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/capabilities/capabilities.module.ts`

**Step 1: Write failing controller tests**

Cover list catalog, list effective modules, enable/disable/archive, select/deselect for Project, dependency conflict, forbidden role, inaccessible Project, and idempotency.

**Step 2: Implement routes**

```text
GET    /organizations/:organizationId/modules
PUT    /organizations/:organizationId/modules/:moduleKey
DELETE /organizations/:organizationId/modules/:moduleKey
PUT    /organizations/:organizationId/projects/:projectId/modules/:moduleKey
DELETE /organizations/:organizationId/projects/:projectId/modules/:moduleKey
```

Require a reason for destructive or blocking changes. Return blockers and required confirmation rather than partially disabling.

**Step 3: Verify and commit**

Run controller, policy, lifecycle, and cross-tenant tests.

Commit: `feat(api): expose organization and project module controls`

## Task 6: Build Settings → Modules

**Files:**

- Create: `apps/app.saroh.in/app/settings/modules/page.tsx`
- Create: `apps/app.saroh.in/app/settings/modules/loading.tsx`
- Create: `apps/app.saroh.in/components/modules/module-catalog.tsx`
- Create: `apps/app.saroh.in/components/modules/module-card.tsx`
- Create: `apps/app.saroh.in/components/modules/module-setup-checklist.tsx`
- Create: `apps/app.saroh.in/lib/modules/service.ts`
- Create: `apps/app.saroh.in/lib/modules/actions.ts`
- Create: `apps/app.saroh.in/lib/modules/schema.ts`

**Step 1: Write schema and action tests**

Test typed decoding, API-error preservation, dependency prompts, confirmation-required responses, and cache revalidation.

**Step 2: Build the server page and catalog**

Show Disabled, Setup required, Active, Attention required, and Archived states. Each card has one next action. Explain dependencies and distinguish plan limits from disabled configuration.

**Step 3: Build safe disable/archival dialogs**

List impact, active blockers, retained data, and whether public activity is paused. Require explicit confirmation only after the API says the change is safe.

**Step 4: Verify and commit**

Run app typecheck/lint/build and browser checks at 390px and 1440px, including keyboard and reduced motion.

Commit: `feat(app): add organization module settings`

## Task 7: Add Project module selection and capability-aware shell

**Files:**

- Create: `apps/app.saroh.in/app/settings/projects/[projectId]/modules/page.tsx`
- Create: `apps/app.saroh.in/components/projects/project-module-selector.tsx`
- Create: `apps/app.saroh.in/components/projects/project-switcher.tsx`
- Modify: `apps/app.saroh.in/components/shared/app-shell.tsx`
- Modify: `apps/app.saroh.in/components/shared/nav-items.tsx`
- Modify: `apps/app.saroh.in/components/shared/app-sidebar.tsx`
- Modify: `apps/app.saroh.in/components/shared/mobile-nav.tsx`
- Modify: `apps/app.saroh.in/components/shared/command-menu.tsx`

**Step 1: Add failing navigation projection tests**

Given an availability response and actor context, assert the exact visible navigation and quick actions. Disabled modules must be absent from operational navigation but discoverable in Settings.

**Step 2: Add Project context**

The shell fetches accessible Projects and effective module availability once. Context changes must invalidate module-aware server data and never trust a client-supplied inaccessible Project ID.

**Step 3: Project selection UX**

OWNER/ADMIN can select Organization-enabled modules. MEMBER sees availability read-only for accessible Projects. Explain when a module's underlying domain has not yet completed Project data scoping.

**Step 4: Verify and commit**

Browser-test OWNER, ADMIN, direct-grant MEMBER, team-grant MEMBER, and ungranted MEMBER across desktop/mobile navigation.

Commit: `feat(app): make project shell capability aware`

## Task 8: Roll module enforcement through domain endpoints

**Files:**

- Modify: controllers/services in `sites`, `forms`, `contacts`, `leads`, `pipelines`, `bookings`, `products`, `orders`, `payments`, `communications`, `automations`, and `analytics`
- Create: `apps/api.saroh.in/src/modules/capabilities/module-enforcement.e2e.spec.ts`

**Step 1: Write one end-to-end matrix before modifying handlers**

For every module, prove enabled/disabled Organization behavior, selected/unselected Project behavior where supported, role denial, and retained historical reads.

**Step 2: Add checks at application-service boundaries**

Do not rely on hidden navigation. Commands and sensitive reads enforce effective availability server-side. Preserve webhook, refund, delivery-status, and historical-record paths necessary for reconciliation after disablement.

**Step 3: Add optional `projectId` one domain at a time**

Start with new Sites, Forms, Services, and Stores. Add compound Organization/Project constraints and adversarial tests. Do not filter a domain by Project until its migration and authorization tests pass.

**Step 4: Verify and commit**

Run API unit/integration/E2E suites and the first-journey E2E with modules enabled.

Commit: `feat(api): enforce modules across business domains`

## Task 9: Release and rollback gate

**Files:**

- Modify: `docs/architecture/IMPLEMENTATION_BACKLOG.md`
- Create: `docs/architecture/runbooks/MODULE_ROLLOUT.md`
- Modify: `.github/workflows/ci.yml` if the new E2E is not automatically included

**Step 1: Add rollout telemetry**

Measure enable/disable attempts, blockers, setup completion, API denials by gate, and readiness-health changes without logging credentials or customer PII.

**Step 2: Dark-launch API enforcement**

Compare computed availability with current behavior before enforcing. Use the existing feature-flag service only as a rollout/kill switch.

**Step 3: Verify rollback**

Disabling enforcement must not remove configuration or data. Re-enabling restores the same selected modules and readiness.

**Step 4: Run final gates and commit**

```bash
pnpm --filter @saroh/api test
pnpm --filter @saroh/api test:int
pnpm --filter @saroh/api typecheck
pnpm --filter application typecheck
pnpm --filter application lint
pnpm --filter application build
git diff --check
```

Commit: `docs(modules): add capability rollout runbook`
