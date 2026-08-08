# Admin Control Plane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Saroh's role-based internal control plane for Organization support, platform operations, staff governance, billing operations, and staged releases.

**Architecture:** Keep `admin.saroh.in` as a server-rendered client of typed `/admin/*` API endpoints. Extend the existing `PlatformAdmin` boundary with fixed multi-role RBAC, append-only platform audit records, reason-bound Organization access sessions, and durable operations; deliver each area as a complete schema/API/UI/test vertical slice.

**Tech Stack:** TypeScript, NestJS 11, Next.js 16 App Router, React 19, Prisma 7/PostgreSQL, Better Auth 1.6, Jest 30, Tailwind CSS, pnpm/Turborepo.

---

## Delivery rules

- Use @test-driven-development for every behavior change.
- Use @better-auth-best-practices for session freshness, revocation, or account
  administration.
- Use @vercel-react-best-practices and @web-design-guidelines for admin UI work.
- Use @verification-before-completion before claiming a slice is complete.
- Keep staff authorization separate from Organization membership.
- Never return credentials, tokens, signatures, raw webhook bodies, or
  unrestricted customer payloads from `/admin/*`.
- Every mutation requires a reason and idempotency key.
- Sensitive mutations append `AdminAuditEvent` in the same transaction.
- Commit after each task; do not combine unrelated vertical slices.

## Baseline commands

Run from `.worktrees/admin-control-plane-foundation`:

```bash
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api... build
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api exec jest --runInBand --no-watchman
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api typecheck
pnpm --filter admin typecheck
pnpm --filter admin lint
```

Expected baseline: API build succeeds; 66 suites and 603 tests pass; both apps
typecheck; admin lint passes.

---

## Phase A — Staff RBAC and platform audit foundation

### Task 1: Define the fixed staff permission policy

**Files:**

- Create: `apps/api.saroh.in/src/modules/admin/admin-permissions.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-permissions.spec.ts`

**Step 1: Write the failing policy tests**

Cover:

```ts
expect(permissionsFor(["SUPPORT"])).toContain("organization:read");
expect(permissionsFor(["SUPPORT"])).not.toContain("staff:grant");
expect(permissionsFor(["OPERATIONS", "BILLING"])).toEqual(
    expect.arrayContaining(["jobs:retry", "subscription:override"]),
);
expect(permissionsFor(["AUDITOR"])).not.toEqual(
    expect.arrayContaining(["flags:publish"]),
);
expect(permissionsFor(["PLATFORM_OWNER"])).toEqual(ALL_ADMIN_PERMISSIONS);
expect(isAdminRole("tenant_owner")).toBe(false);
```

Also test deterministic ordering and deduplication for multiple roles.

**Step 2: Run the focused test and verify RED**

```bash
pnpm --filter @saroh/api exec jest src/modules/admin/admin-permissions.spec.ts --runInBand --no-watchman
```

Expected: FAIL because `admin-permissions.ts` does not exist.

**Step 3: Implement the typed policy**

Define the closed role set:

```ts
export const AdminRole = {
    PlatformOwner: "PLATFORM_OWNER",
    Support: "SUPPORT",
    Operations: "OPERATIONS",
    Billing: "BILLING",
    ReleaseManager: "RELEASE_MANAGER",
    Auditor: "AUDITOR",
} as const;
```

Define a closed `AdminPermission` object grouped by platform, Organization,
people, operations, billing, release, staff, and audit resources. Build a
`ROLE_PERMISSIONS` record. `PLATFORM_OWNER` receives `ALL_ADMIN_PERMISSIONS`;
other roles receive only their approved capabilities.

**Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api.saroh.in/src/modules/admin/admin-permissions.ts apps/api.saroh.in/src/modules/admin/admin-permissions.spec.ts
git commit -m "feat(admin): define fixed staff permission policy"
```

### Task 2: Add staff roles and global audit persistence

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260727170000_admin_control_plane_foundation/migration.sql`
- Modify: `packages/database/src/index.ts` only if new Prisma types need an
  explicit export

**Step 1: Add the Prisma models**

Add `roleAssignments` to `PlatformAdmin`, then add:

```prisma
model PlatformAdminRoleAssignment {
  id              String        @id @default(cuid())
  platformAdminId String
  platformAdmin   PlatformAdmin @relation(fields: [platformAdminId], references: [id], onDelete: Cascade)
  role            String
  assignedByUserId String?
  reason          String
  assignedAt      DateTime      @default(now())
  expiresAt       DateTime?
  revokedAt       DateTime?

  @@index([platformAdminId, revokedAt, expiresAt])
  @@index([role, revokedAt])
}

model AdminAuditEvent {
  id             String   @id @default(cuid())
  actorUserId    String
  permission     String
  action         String
  targetType     String
  targetId       String?
  organizationId String?
  reason         String?
  outcome        String
  correlationId  String?
  metadata       Json?
  createdAt      DateTime @default(now())

  @@index([createdAt])
  @@index([actorUserId, createdAt])
  @@index([organizationId, createdAt])
  @@index([targetType, targetId, createdAt])
}
```

Keep both models relation-light. `AdminAuditEvent` deliberately has no
relations so deleting a business record cannot delete its control-plane history.

**Step 2: Write the forward migration**

Create both tables and indexes. Backfill one role assignment for every existing
`PlatformAdmin`:

- role: `PLATFORM_OWNER`
- reason: `Backfilled from pre-RBAC PlatformAdmin grant`
- assigned timestamp: the existing `grantedAt`
- revoked timestamp: the existing `revokedAt`

Add a database check constraint for the six role values and another for
`SUCCESS | FAILURE | DENIED`.

**Step 3: Validate formatting and generated client**

```bash
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/database exec prisma validate
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/database exec prisma generate
```

Expected: schema validates and client generation succeeds.

**Step 4: Verify the migration SQL**

```bash
rg -n "PlatformAdminRoleAssignment|AdminAuditEvent|PLATFORM_OWNER|CHECK" packages/database/prisma/migrations/20260727170000_admin_control_plane_foundation/migration.sql
```

Expected: table creation, backfill, constraints, and indexes are all present.

**Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260727170000_admin_control_plane_foundation/migration.sql packages/database/src/index.ts
git commit -m "feat(database): add staff roles and platform audit"
```

### Task 3: Resolve roles in the staff guard

**Files:**

- Modify: `apps/api.saroh.in/src/common/decorators/platform-admin-context.decorator.ts`
- Modify: `apps/api.saroh.in/src/common/guards/platform-admin.guard.ts`
- Modify: `apps/api.saroh.in/src/common/guards/platform-admin.guard.spec.ts`

**Step 1: Extend the guard tests**

Add failing cases proving:

- active, unexpired assignments become `roles` and `permissions`;
- expired and revoked assignments are ignored;
- an active grant with no active roles is denied;
- multiple roles union permissions;
- break-glass access receives Platform Owner permissions;
- role changes take effect on the next request because no result is cached.

Expected request context:

```ts
{
    userId: "user_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: ["organization:read", ...],
    viaBootstrap: false,
}
```

**Step 2: Run the guard spec and verify RED**

```bash
pnpm --filter @saroh/api exec jest src/common/guards/platform-admin.guard.spec.ts --runInBand --no-watchman
```

**Step 3: Implement role resolution**

Select the active grant and its assignments where `revokedAt` is null and
`expiresAt` is null or in the future. Validate database strings through
`isAdminRole`; log and ignore unknown values. Attach the fully typed
`PlatformAdminInfo`. Keep the revoked-versus-never error indistinguishable.

**Step 4: Run the guard and policy specs**

```bash
pnpm --filter @saroh/api exec jest src/common/guards/platform-admin.guard.spec.ts src/modules/admin/admin-permissions.spec.ts --runInBand --no-watchman
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api.saroh.in/src/common/decorators/platform-admin-context.decorator.ts apps/api.saroh.in/src/common/guards/platform-admin.guard.ts apps/api.saroh.in/src/common/guards/platform-admin.guard.spec.ts
git commit -m "feat(admin): resolve staff roles on every request"
```

### Task 4: Enforce endpoint permissions

**Files:**

- Create: `apps/api.saroh.in/src/common/decorators/require-admin-permission.decorator.ts`
- Create: `apps/api.saroh.in/src/common/guards/platform-permission.guard.ts`
- Create: `apps/api.saroh.in/src/common/guards/platform-permission.guard.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.module.ts`

**Step 1: Write failing permission-guard tests**

Test no metadata, one required permission, multiple required permissions,
missing context, denied access, and Platform Owner access. Require all
permissions declared by one endpoint.

**Step 2: Run and verify RED**

```bash
pnpm --filter @saroh/api exec jest src/common/guards/platform-permission.guard.spec.ts --runInBand --no-watchman
```

**Step 3: Implement decorator and guard**

Use Nest `SetMetadata` and `Reflector`. Add
`PlatformPermissionGuard` after `PlatformAdminGuard`. Annotate:

- `/admin/me`: authenticated staff only
- `/admin/metrics`: `platform:read`
- `/admin/organizations`: `organization:read`
- flag list/history: `flags:read`
- flag mutations: `flags:publish`

**Step 4: Run focused and full authorization tests**

```bash
pnpm --filter @saroh/api exec jest src/common/guards/platform-permission.guard.spec.ts src/common/guards/platform-admin.guard.spec.ts --runInBand --no-watchman
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api.saroh.in/src/common/decorators/require-admin-permission.decorator.ts apps/api.saroh.in/src/common/guards/platform-permission.guard.ts apps/api.saroh.in/src/common/guards/platform-permission.guard.spec.ts apps/api.saroh.in/src/modules/admin/admin.controller.ts apps/api.saroh.in/src/modules/admin/admin.module.ts
git commit -m "feat(admin): enforce control-plane permissions"
```

### Task 5: Add fail-closed admin auditing

**Files:**

- Create: `apps/api.saroh.in/src/modules/admin/admin-audit.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-audit.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.module.ts`
- Modify: `apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.ts`
- Modify: `apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/dto.ts`

**Step 1: Write audit-service tests**

Prove:

- safe metadata is accepted;
- keys matching token, secret, credential, signature, payload, password, and
  authorization are rejected recursively;
- cursor reads are bounded to 100;
- a transaction writer propagates failures;
- the read-audit helper logs failures without hiding the original read result.

**Step 2: Run and verify RED**

```bash
pnpm --filter @saroh/api exec jest src/modules/admin/admin-audit.service.spec.ts --runInBand --no-watchman
```

**Step 3: Implement the service**

Expose:

```ts
recordRead(input): Promise<void>;
write(tx: Prisma.TransactionClient, input): Promise<void>;
list({ cursor, limit, actorUserId, organizationId, action }): Promise<Page>;
```

`write` must not swallow errors. Use `getCorrelationId()` for the request ID.

**Step 4: Integrate flag mutations atomically**

Extend the existing feature-flag transactions so the domain
`FeatureFlagAudit` and global `AdminAuditEvent` are written together. Require
`reason` and an idempotency key in the admin DTO. Add tests showing audit failure
rolls the whole mutation back and repeated idempotency keys do not duplicate the
change.

**Step 5: Add the audit read endpoint**

Add `GET /admin/audit` guarded by `audit:read`, with cursor and filters.

**Step 6: Run focused tests**

```bash
pnpm --filter @saroh/api exec jest src/modules/admin/admin-audit.service.spec.ts src/modules/feature-flags/feature-flags.service.spec.ts --runInBand --no-watchman
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api.saroh.in/src/modules/admin apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.ts apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.spec.ts
git commit -m "feat(admin): add fail-closed platform audit trail"
```

### Task 6: Surface staff capabilities in the admin shell

**Files:**

- Modify: `apps/admin.saroh.in/lib/control-plane.ts`
- Modify: `apps/admin.saroh.in/components/admin-shell.tsx`
- Modify: `apps/admin.saroh.in/app/page.tsx`
- Modify: `apps/admin.saroh.in/app/flags/page.tsx`
- Create: `apps/admin.saroh.in/app/audit/page.tsx`
- Create: `apps/admin.saroh.in/components/admin-audit-table.tsx`

**Step 1: Add a failing type fixture or component test**

If no React test harness exists, use TypeScript as the first gate: change the
`StaffIdentity` expectation to require `roles` and `permissions`, then run:

```bash
pnpm --filter admin typecheck
```

Expected: FAIL at current `AdminShell` call sites.

**Step 2: Extend the control-plane adapter**

Add typed roles/permissions to `/admin/me` and add cursor-based `listAudit`.
Preserve distinct forbidden and outage behavior.

**Step 3: Make navigation capability-aware**

Pass `staff` to `AdminShell`. Hide Releases without `flags:read` and Audit
without `audit:read`. Display role names in the account area and retain the
break-glass banner.

**Step 4: Add the read-only Audit page**

Render time, actor ID, action, target, outcome, reason, and correlation ID.
Use server pagination. Never render raw metadata as unbounded JSON.

**Step 5: Verify**

```bash
pnpm --filter admin typecheck
pnpm --filter admin lint
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/admin.saroh.in
git commit -m "feat(admin): surface roles and platform audit"
```

### Task 7: Verify the foundation slice

**Files:**

- Modify: `apps/admin.saroh.in/README.md`
- Modify: `apps/api.saroh.in/README.md`

**Step 1: Document roles, permissions, break-glass behavior, and migration**

Include local bootstrap instructions without real emails or credentials.

**Step 2: Run the foundation test matrix**

```bash
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api... build
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api exec jest --runInBand --no-watchman
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api typecheck
DATABASE_URL=postgresql://baseline:baseline@127.0.0.1:5432/baseline pnpm --filter @saroh/api lint
pnpm --filter admin typecheck
pnpm --filter admin lint
git diff --check
```

Expected: all pass with at least the 603 baseline tests plus the new RBAC and
audit tests.

**Step 3: Commit**

```bash
git add apps/admin.saroh.in/README.md apps/api.saroh.in/README.md
git commit -m "docs(admin): document staff RBAC foundation"
```

---

## Phase B — Organization support workspace

### Task 8: Add Organization lifecycle and access sessions

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260727180000_admin_organization_access/migration.sql`
- Create: `apps/api.saroh.in/src/modules/admin/admin-access.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-access.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/dto.ts`

**Steps:**

1. Write failing state-machine tests for `ACTIVE`, `SUSPENDED`,
   `PENDING_DELETION`, and `DELETED_RETAINED`.
2. Write failing access-session tests for required reason, 30-minute expiry,
   staff revocation, Organization mismatch, and read-only scope.
3. Add Organization lifecycle fields and `AdminAccessSession`.
4. Add `POST /admin/organizations/:id/access-sessions` and revoke endpoints.
5. Write `AdminAuditEvent` for session open, close, denied, and expiry cleanup.
6. Run focused tests, Prisma validation, API typecheck, and commit:
   `feat(admin): add audited organization access sessions`.

### Task 9: Build the Organization directory and 360-degree read model

**Files:**

- Create: `apps/api.saroh.in/src/modules/admin/admin-organizations.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-organizations.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/dto.ts`
- Create: `apps/admin.saroh.in/app/organizations/page.tsx`
- Create: `apps/admin.saroh.in/app/organizations/[organizationId]/page.tsx`
- Create: `apps/admin.saroh.in/app/organizations/[organizationId]/layout.tsx`
- Create: `apps/admin.saroh.in/components/organizations/organization-table.tsx`
- Create: `apps/admin.saroh.in/components/organizations/organization-header.tsx`
- Modify: `apps/admin.saroh.in/lib/control-plane.ts`

**Steps:**

1. Test bounded cursor search, stable sort, status/plan/module/health filters,
   and `organization:pii:read` for member-email search.
2. Implement support-safe list projections.
3. Test the detail projection for overview, members, modules, subscription,
   provider health, operational counts, and capabilities.
4. Implement `GET /admin/organizations` and
   `GET /admin/organizations/:id`; audit detail reads through an access session.
5. Build URL-driven directory filters and stable detail tabs.
6. Verify API tests plus admin typecheck/lint and commit:
   `feat(admin): add organization support workspace`.

### Task 10: Add explicit Organization support actions

**Files:**

- Create: `apps/api.saroh.in/src/modules/admin/admin-organization-actions.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-organization-actions.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/dto.ts`
- Create: `apps/admin.saroh.in/lib/organization-actions.ts`
- Create: `apps/admin.saroh.in/components/organizations/action-panel.tsx`
- Create: `apps/admin.saroh.in/components/organizations/view-as-banner.tsx`

**Steps:**

1. Test member role changes, ownership transfer, invitation resend/revoke,
   customer session revocation, module lifecycle actions, suspension,
   reactivation, deletion scheduling, and deletion cancellation.
2. Test fresh-session requirements and exact permissions for each action.
3. Implement transactional action methods with impact preview, expected resource
   version, idempotency key, and audit event.
4. Add read-only view-as-Organization routes that carry the staff identity and
   access-session ID; reject every mutation through that surface.
5. Build explicit action confirmations and persistent view-as banner.
6. Verify and commit:
   `feat(admin): add audited organization support actions`.

---

## Phase C — Platform operations center

### Task 11: Add durable admin operations and incidents

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260727190000_admin_operations/migration.sql`
- Create: `apps/api.saroh.in/src/modules/admin/admin-operations.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-operations.service.spec.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-incidents.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-incidents.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`

**Steps:**

1. Test operation lifecycle, per-item results, cancellation, progress, and
   idempotent creation.
2. Add `AdminOperation`, `AdminOperationItem`, `PlatformIncident`, and
   `PlatformIncidentEvent`.
3. Implement job dry-run, single retry, bounded bulk retry, dead-letter replay,
   future-job cancellation, verified webhook reprocessing, provider recheck,
   and poison-event quarantine.
4. Preserve original idempotency keys or create linked replay keys.
5. Add concurrency and provider-rate caps.
6. Implement incident create/assign/update/resolve and link operations/flags.
7. Verify and commit: `feat(admin): add durable platform operations`.

### Task 12: Build the Operations UI

**Files:**

- Create: `apps/admin.saroh.in/app/operations/page.tsx`
- Create: `apps/admin.saroh.in/app/operations/jobs/page.tsx`
- Create: `apps/admin.saroh.in/app/operations/webhooks/page.tsx`
- Create: `apps/admin.saroh.in/app/operations/providers/page.tsx`
- Create: `apps/admin.saroh.in/app/operations/incidents/page.tsx`
- Create: `apps/admin.saroh.in/app/operations/[operationId]/page.tsx`
- Create: `apps/admin.saroh.in/components/operations/*`
- Modify: `apps/admin.saroh.in/lib/control-plane.ts`

**Steps:**

1. Add typed, redacted adapters for summaries, queues, providers, incidents,
   previews, and operation progress.
2. Build URL-driven filters and links from metrics to records.
3. Build dry-run and confirmation flows for single and bulk actions.
4. Poll operation progress with cancellation and redacted report download.
5. Verify keyboard access, error states, typecheck, lint, and commit:
   `feat(admin): build platform operations center`.

---

## Phase D — Team governance

### Task 13: Add staff grant lifecycle APIs

**Files:**

- Create: `apps/api.saroh.in/src/modules/admin/admin-staff.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-staff.service.spec.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin.controller.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/dto.ts`
- Create: `apps/admin.saroh.in/app/team/page.tsx`
- Create: `apps/admin.saroh.in/app/team/[platformAdminId]/page.tsx`
- Create: `apps/admin.saroh.in/components/team/*`
- Modify: `apps/admin.saroh.in/lib/control-plane.ts`

**Steps:**

1. Test invite/grant, multi-role assignment, role expiry, role revocation, grant
   revocation, reactivation, and permission previews.
2. Test that only Platform Owners mutate staff and the last active Platform
   Owner cannot be removed, expired, or revoked.
3. Revoke active `AdminAccessSession` records on staff revocation.
4. Require a fresh Better Auth session for every staff mutation.
5. Build active/invited/expired/revoked views, role editor, activity summary,
   grant history, and permission matrix.
6. Verify and commit: `feat(admin): add staff governance`.

---

## Phase E — Advanced release management

### Task 14: Add flag metadata, cohorts, and effective-value inspection

**Files:**

- Modify: `apps/api.saroh.in/src/modules/feature-flags/flags.ts`
- Modify: `apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.ts`
- Modify: `apps/api.saroh.in/src/modules/feature-flags/feature-flags.service.spec.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260727200000_admin_rollouts/migration.sql`
- Create: `apps/api.saroh.in/src/modules/admin/admin-rollouts.service.ts`
- Create: `apps/api.saroh.in/src/modules/admin/admin-rollouts.service.spec.ts`

**Steps:**

1. Add typed display metadata to the in-code flag registry.
2. Test deterministic Organization bucketing using `flagKey + organizationId`.
3. Add `FlagCohort`, membership, rollout, and scheduled-change persistence.
4. Test named cohorts, filter snapshots, percentage cohorts, precedence, and an
   explanation for each effective value.
5. Keep environment overrides read-only and highest precedence.
6. Verify and commit: `feat(admin): add staged rollout model`.

### Task 15: Build scheduled rollout, expiry, and rollback workflows

**Files:**

- Modify: `apps/api.saroh.in/src/modules/admin/admin-rollouts.service.ts`
- Modify: `apps/api.saroh.in/src/modules/admin/admin-rollouts.service.spec.ts`
- Create: `apps/api.saroh.in/src/modules/admin/rollout-change.handler.ts`
- Modify: `apps/api.saroh.in/src/modules/jobs/job-handler.registry.ts`
- Modify: `apps/admin.saroh.in/app/flags/page.tsx`
- Create: `apps/admin.saroh.in/app/releases/[flagKey]/page.tsx`
- Create: `apps/admin.saroh.in/components/releases/*`

**Steps:**

1. Test rollout preview, schedule, pause, resume, cancellation, expiry, and
   append-only rollback.
2. Run scheduled changes through the durable job system and `AdminOperation`.
3. Require fresh sessions for global and broad percentage changes.
4. Build the stage timeline, affected-Organization preview, conflict warnings,
   effective-value inspector, history, rollback, and stale-flag warnings.
5. Verify and commit: `feat(admin): add rollout scheduling and rollback`.

---

## Phase F — Whole-program release gate

### Task 16: Complete security, browser, and migration verification

**Files:**

- Create: `apps/api.saroh.in/test/admin-control-plane.integration.spec.ts`
- Create: `docs/architecture/runbooks/ADMIN_CONTROL_PLANE.md`
- Modify: `docs/architecture/IMPLEMENTATION_BACKLOG.md`
- Modify: `docs/architecture/RISKS_AND_TECH_DEBT.md`
- Modify: `apps/admin.saroh.in/README.md`

**Steps:**

1. Add integration coverage for all six roles, immediate revocation,
   Organization isolation, PII permission boundaries, redaction, idempotency,
   audit atomicity, and destructive state transitions.
2. Run migration tests against an isolated PostgreSQL database and verify
   Platform Owner backfill.
3. Run browser tests for every role, keyboard navigation, access-session expiry,
   view-as read-only enforcement, bulk operation progress, destructive
   confirmations, and rollout rollback.
4. Run the full monorepo build, test, typecheck, lint, cycle, and diff gates.
5. Document deployment order, break-glass recovery, rollback, audit queries,
   and incident response.
6. Commit: `docs(admin): add control-plane operations runbook`.

## Program completion criteria

- Every `/admin/*` endpoint has an explicit typed permission or is limited to
  authenticated staff identity.
- Role changes and revocation apply on the next request.
- Every sensitive mutation is transactional with its platform audit event.
- Organization detail reads require a valid, reason-bound access session.
- View-as sessions cannot mutate tenant data.
- Bulk replays are bounded, cancellable, and duplicate-safe.
- The final Platform Owner cannot be removed.
- Environment flag overrides cannot be changed from the UI.
- Admin UI never converts an outage to an empty state and never exposes secrets.
- Full test, typecheck, lint, build, migration, and browser gates pass.
