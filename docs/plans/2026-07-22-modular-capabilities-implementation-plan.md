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

---

## Detailed execution packets

The nine tasks above define product scope. Execute them through the following PR-sized packets so schema, API, UI, and rollout concerns stay reviewable. Do not combine packets unless the earlier packet is already merged and green.

| Packet | GitHub issue | Deliverable                        | Depends on  | Merge gate                               |
| ------ | ------------ | ---------------------------------- | ----------- | ---------------------------------------- |
| M-01A  | #112         | ADR and module vocabulary          | None        | Architecture review                      |
| M-01B  | #112         | Typed registry and validator       | M-01A       | Registry tests                           |
| M-02A  | #113         | Additive schema and constraints    | M-01B       | Migration test                           |
| M-02B  | #113         | Evidence-based backfill            | M-02A       | Idempotency and reconciliation           |
| M-03A  | #114         | Lifecycle and policy               | M-02B       | Role/cross-tenant matrix                 |
| M-03B  | #114         | Effective availability composition | M-03A       | Gate-precedence tests                    |
| M-03C  | #114         | Readiness/deactivation adapters    | M-03B       | Domain safety matrix                     |
| M-04A  | #115         | Read/query API                     | M-03B       | Controller contract tests                |
| M-04B  | #115         | Mutation API                       | M-03C       | Audit/idempotency tests                  |
| M-04C  | #115         | Settings → Modules                 | M-04A/B     | Browser state matrix                     |
| M-05A  | #116         | Project selection API/UI           | M-04B       | Project role matrix                      |
| M-05B  | #116         | Capability-aware shell             | M-04C/M-05A | Navigation projection tests              |
| M-06A  | #117         | Authenticated domain enforcement   | M-03C       | Domain test suites                       |
| M-06B  | #117         | Public/reconciliation enforcement  | M-06A       | Public/webhook regression tests          |
| M-06C  | #117         | Dark rollout and telemetry         | M-06B       | Shadow comparison and rollback rehearsal |

### Packet workflow

For every packet:

1. Create an isolated worktree and branch named after the issue, for example `feat/112-module-registry`.
2. Re-read ADR-003, `DEC-005`, `DEC-006`, `DEC-007`, `DEC-013`, `DEC-014`, and `DEC-015` before changing code.
3. Add the smallest failing unit or integration test for the packet.
4. Run only that test and record the expected failure.
5. Implement the minimum behavior.
6. Run the focused test, then the affected package suite.
7. Run types, lint, migration/status checks, and `git diff --check` as relevant.
8. Update issue acceptance checkboxes and attach verification output.
9. Commit one coherent value unit. Do not include unrelated formatting or refactoring.
10. Request review before starting a dependent packet.

## Exact module registry contract

Create one server-owned registry. Frontends receive a serialized projection; they must not maintain their own dependency or permission maps.

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
export type ModuleLifecycle = "DISABLED" | "ENABLED" | "ARCHIVED";
export type ModuleReadiness =
    | "DISABLED"
    | "SETUP_REQUIRED"
    | "ACTIVE"
    | "ATTENTION_REQUIRED";

export interface ModuleDescriptor {
    key: ModuleKey;
    label: string;
    description: string;
    rootRoutes: readonly string[];
    requiredAction: OrgAction;
    dependencies: readonly ModuleKey[];
    projectSelectable: boolean;
    rolloutFlag: FlagKey;
    entitlementKey?: keyof EntitlementMap;
    readinessAdapter: ModuleKey;
    deactivationPolicy: ModuleKey;
}
```

Registry validation must reject:

- duplicate keys or labels;
- dependencies outside `MODULE_KEYS`;
- direct or transitive dependency cycles;
- routes not beginning with `/`;
- a Project-selectable module whose dependencies cannot also be selected;
- entitlement or rollout keys not present in their typed registries;
- `AI` or unapproved placeholder modules.

The first registry version should use these relationships:

| Module         | Hard enable dependency | Readiness dependency                               | Project-selectable |
| -------------- | ---------------------- | -------------------------------------------------- | ------------------ |
| Website        | None                   | Site/template/domain setup                         | Yes                |
| CRM            | None                   | Pipeline exists                                    | Yes                |
| Appointments   | CRM                    | Service and availability exist                     | Yes                |
| Commerce       | None                   | Store/channel and catalog exist                    | Yes                |
| Payments       | None                   | Appointments or Commerce enabled; provider healthy | Yes                |
| Communications | CRM                    | Organization provider healthy for real sends       | Yes                |
| Automations    | CRM                    | At least one supported trigger/action pair         | Yes                |
| Insights       | None                   | At least one event-producing module active         | Yes                |

Payments uses an OR readiness dependency rather than two hard dependencies. Enabling Payments must not force both Commerce and Appointments.

## Persistence and migration detail

### Allowed lifecycle values

Add database checks:

```sql
ALTER TABLE "OrganizationModule"
ADD CONSTRAINT "OrganizationModule_status_check"
CHECK ("status" IN ('DISABLED', 'ENABLED', 'ARCHIVED'));
```

Add a Project/Organization consistency constraint through an Organization-denormalized `organizationId` on `ProjectModule` plus compound foreign keys, rather than a trigger if Prisma supports the relation cleanly:

```prisma
model ProjectModule {
  id                   String @id @default(cuid())
  organizationId       String
  projectId            String
  organizationModuleId String

  project Project @relation(fields: [organizationId, projectId], references: [organizationId, id], onDelete: Cascade)
  organizationModule OrganizationModule @relation(
    fields: [organizationId, organizationModuleId],
    references: [organizationId, id],
    onDelete: Cascade
  )

  @@unique([projectId, organizationModuleId])
  @@index([organizationId, projectId])
}
```

If the current Prisma version cannot express both compound relations, use explicit SQL foreign keys in the migration and add an integration test that proves Prisma writes still honor them.

### Backfill algorithm

Backfill in one transaction per Organization, not one global transaction. For each Organization:

1. Query existence/counts only.
2. Derive evidence keys from the table below.
3. Add hard dependencies.
4. Upsert `ENABLED` rows without overwriting a pre-existing explicit status.
5. Write one system audit event listing derived evidence.
6. Requery and compare expected versus stored keys.

| Evidence                                                                 | Module enabled       |
| ------------------------------------------------------------------------ | -------------------- |
| Site, Page, Form, Domain, or Publication                                 | Website              |
| Contact, Lead, Pipeline, Stage, or CRM Activity                          | CRM                  |
| Service, AvailabilityRule, or Booking                                    | Appointments + CRM   |
| Store, Product, Inventory, Cart, Order, or commerce Customer             | Commerce             |
| MerchantPaymentProvider, PaymentIntent, Attempt, Refund, or WebhookEvent | Payments             |
| CommunicationProvider, Message, Delivery, or Consent                     | Communications + CRM |
| AutomationRule or AutomationRun                                          | Automations + CRM    |
| AnalyticsEvent or DailyAggregate                                         | Insights             |

Organizations with no evidence receive all modules as `DISABLED`. Do not infer modules from subscription plans, feature-flag overrides, or business size.

### Migration verification queries

The migration packet must record results for:

```sql
SELECT "organizationId", "moduleKey", COUNT(*)
FROM "OrganizationModule"
GROUP BY 1, 2 HAVING COUNT(*) > 1;

SELECT pm.id
FROM "ProjectModule" pm
JOIN "Project" p ON p.id = pm."projectId"
JOIN "OrganizationModule" om ON om.id = pm."organizationModuleId"
WHERE p."organizationId" <> om."organizationId";
```

Both return zero rows.

## Availability evaluation algorithm

Evaluate in a deterministic order so UI messages and API errors are stable:

```ts
async function evaluateModule(
    input: AvailabilityInput,
): Promise<ModuleAvailability> {
    const descriptor = registry.get(input.moduleKey);
    const rolloutAllowed = await flags.isEnabled(
        descriptor.rolloutFlag,
        input.organizationId,
    );
    const installation = await installations.get(
        input.organizationId,
        input.moduleKey,
    );
    const configured = installation?.status === "ENABLED";
    const selectedForProject = input.projectId
        ? await projectModules.isSelected(
              input.organizationId,
              input.projectId,
              input.moduleKey,
          )
        : true;
    const entitled = descriptor.entitlementKey
        ? await entitlements.can(
              input.organizationId,
              descriptor.entitlementKey,
          )
        : true;
    const authorized = can(input.organizationRole, descriptor.requiredAction);

    const blockers = collectGateBlockers({
        rolloutAllowed,
        configured,
        selectedForProject,
        entitled,
        authorized,
    });

    if (blockers.length > 0) return disabledAvailability(blockers);
    return readiness.evaluate(input);
}
```

Precedence for user-facing actionability:

1. `UNAUTHORIZED` is returned as 404/403 according to the existing no-existence-leak policy; it is not shown as an upsell.
2. `ROLLOUT_DISABLED` is a generic unavailable state and reveals no flag details.
3. `ORG_MODULE_DISABLED` links OWNER/ADMIN to Settings → Modules; MEMBER sees unavailable.
4. `PROJECT_MODULE_UNSELECTED` links OWNER/ADMIN to Project settings; MEMBER sees unavailable.
5. `ENTITLEMENT_REQUIRED` may show plan/limit guidance only after authorization and module configuration pass.
6. Readiness blockers describe setup or health.

Cache effective availability only for the request or a short Organization/Project keyed interval. Invalidate it after module, Project selection, entitlement, flag, role, or provider-health changes.

## API contract detail

### Read response

`GET /organizations/:organizationId/modules?projectId=<optional>` returns:

```json
{
    "data": [
        {
            "key": "APPOINTMENTS",
            "label": "Appointments",
            "lifecycle": "ENABLED",
            "readiness": "SETUP_REQUIRED",
            "selectedForProject": true,
            "canManage": true,
            "blockers": [
                {
                    "code": "SERVICE_REQUIRED",
                    "message": "Create a service before accepting bookings.",
                    "actionHref": "/appointments/settings"
                }
            ]
        }
    ],
    "meta": {
        "organizationId": "org_123",
        "projectId": "project_123"
    }
}
```

Do not return rollout-flag keys, entitlement implementation details, provider secrets, or inaccessible Project identifiers.

### Mutation requests

```json
{
    "status": "ENABLED",
    "reason": "We now accept online appointments",
    "acknowledgedBlockerCodes": []
}
```

Disablement that is unsafe returns `409 MODULE_DEACTIVATION_BLOCKED` with stable blocker codes and remediation actions. A second request can acknowledge warnings, but blockers cannot be overridden.

### Idempotency

- Enabling an enabled module returns its current representation without a second audit event.
- Disabling a disabled module behaves the same.
- Concurrent enable/disable writes serialize using the unique row and a transaction.
- Project selection upserts; deselection deletes only the exact Organization/Project/module row.

## Readiness and deactivation matrix

| Module         | Setup required                 | Attention required                         | Disable behavior                                                                           | Retained paths                                    |
| -------------- | ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Website        | No site/template/publication   | Domain verification or publication failure | Stop new publishing; explicitly unpublish or preserve current publication per confirmation | Existing publication and domain management        |
| CRM            | No default pipeline            | Intake/job failure                         | Stop new manual CRM activity only after forms are reassigned/paused                        | Historical contacts/leads/activities              |
| Appointments   | No service/availability        | Delivery/provider problem                  | Stop new public slots; preserve manage/cancel/reschedule                                   | Existing bookings and notifications               |
| Commerce       | No store/catalog               | Inventory/checkout exception               | Stop new checkout; preserve fulfilment/refund                                              | Orders, payments, inventory reconciliation        |
| Payments       | No verified provider           | Credential/webhook/reconciliation failure  | Stop new intents; continue webhooks/refunds/reconciliation                                 | Attempts, refunds, webhook inbox                  |
| Communications | No Organization provider       | Delivery/provider failure                  | Stop new business sends; continue receipts/retries as policy requires                      | Messages, delivery history, consent               |
| Automations    | No enabled rule                | Repeated/dead-letter failures              | Stop new runs; finish/cancel claimed jobs deterministically                                | Rules and run ledger                              |
| Insights       | No event-producing module/data | Aggregation lag/failure                    | Stop UI access/new optional collection only; apply retention normally                      | Required audit/operational events remain separate |

Every adapter must return stable codes, a safe plain-language message, optional action URL, and severity. Never return raw provider errors.

## Domain-enforcement matrix

Apply enforcement at service entry points, not controllers alone:

| Domain         | New commands blocked when disabled                   | Reads retained when disabled           | Public/background exceptions                               |
| -------------- | ---------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Sites/forms    | create, update, publish, new form intake when paused | drafts/publication history             | currently published renderer follows chosen disable policy |
| CRM            | create/update lead, pipeline move, new task          | contacts/leads/activity history        | already accepted submissions finish atomically             |
| Bookings       | create service/rule/booking, reschedule              | existing bookings                      | cancellation and committed notifications continue          |
| Commerce       | product/order creation, checkout intent              | catalog/order history as policy allows | fulfilment/refund/webhook reconciliation continue          |
| Payments       | new provider/intents                                 | attempts/refunds/provider status       | signed webhooks and refunds continue                       |
| Communications | new messages/rules                                   | message/delivery/consent history       | delivery receipts and safe retries continue                |
| Automations    | new/enable rule and new trigger runs                 | rules/run history                      | claimed run completes or safely cancels                    |
| Analytics      | optional queries/collection per policy               | retention/admin operations             | required security/audit telemetry is unaffected            |

## Test fixture matrix

Use deterministic Organizations:

| Fixture         | Modules                            | Projects        | Actor cases                | Critical assertion                           |
| --------------- | ---------------------------------- | --------------- | -------------------------- | -------------------------------------------- |
| `org_none`      | None                               | None            | OWNER                      | Settings discoverability; no operational nav |
| `org_service`   | CRM, Appointments, Communications  | `front-desk`    | OWNER, restricted MEMBER   | booking flow works; Commerce absent          |
| `org_commerce`  | Commerce, Payments, Communications | `retail`        | ADMIN, direct-grant MEMBER | order flow works; Appointments absent        |
| `org_hybrid`    | All initial modules                | `salon`, `shop` | OWNER, team-grant MEMBER   | Project selections differ without cross-leak |
| `org_attention` | Payments/Communications enabled    | None            | OWNER                      | provider failure yields attention state      |
| `org_archived`  | Commerce archived                  | None            | ADMIN                      | history visible, new checkout denied         |

For every fixture test:

- direct service invocation;
- authenticated controller request;
- missing/forged Organization header;
- inaccessible Project ID;
- connection-pool/RLS context isolation;
- concurrent conflicting lifecycle writes;
- feature flag off;
- entitlement denied;
- module disabled/unselected;
- provider readiness failure.

## Telemetry contract

Emit internal operational events without configuration payloads:

```ts
type ModuleOperationalEvent =
    | "module.enable.requested"
    | "module.enabled"
    | "module.disable.blocked"
    | "module.disabled"
    | "module.archived"
    | "module.project.selected"
    | "module.project.deselected"
    | "module.readiness.changed"
    | "module.operation.denied";
```

Allowed properties: event, module key, Organization ID, optional Project ID, actor ID for audited mutations, blocker code, request correlation ID, and timestamp. Do not emit provider configuration, secrets, customer IDs, free-form reasons, or raw errors to product analytics.

## Rollout and rollback procedure

1. **Schema only:** deploy additive tables/constraints; no behavior reads them.
2. **Backfill:** run and reconcile counts; keep enforcement off.
3. **Shadow evaluation:** compute availability and log differences from current behavior.
4. **Internal Organization:** enable Settings UI and API enforcement for a controlled test Organization.
5. **Selected beta Organizations:** confirm service-only, commerce-only, and hybrid behavior.
6. **Default on:** enable enforcement after seven days without unexplained shadow mismatches or reconciliation failures.
7. **Cleanup:** remove temporary shadow branches only after the rollout issue records evidence.

Rollback order:

1. Disable the enforcement rollout flag.
2. Leave tables, selections, and audit records intact.
3. Confirm public checkout/booking/publication and webhook handling match pre-enforcement behavior.
4. Investigate using correlation IDs and blocker codes.
5. Forward-fix; never down-migrate or delete module configuration during an incident.

## Definition of done for epic #110

- Issues #112–#117 are closed with linked commits and verification.
- Migration/backfill reconciliation reports zero duplicate or cross-Organization rows.
- All initial modules have readiness and deactivation adapters.
- API operations enforce rollout, module, Project, entitlement, and authorization gates.
- Navigation and quick actions consume the same effective-availability projection.
- Service-only, commerce-only, hybrid, no-module, attention, and archived fixtures pass.
- OWNER/ADMIN-all and MEMBER-grant rules pass adversarial tests.
- Disabling/re-enabling preserves configuration and history.
- Webhook, refund, cancellation, delivery receipt, and public-state regressions pass.
- Rollout and rollback are rehearsed and documented.
- No AI dependency, schema, route, module key, or product promise is introduced.
