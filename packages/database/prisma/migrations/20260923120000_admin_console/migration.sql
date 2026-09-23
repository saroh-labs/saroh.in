-- The admin console (docs/plans/2026-09-23-001-feat-admin-console-plan.md):
-- operator notes on a business, durable bulk operations with one row per
-- target, and time-bounded raises of a plan limit.
--
-- AdminOrganizationNote, AdminOperation and AdminOperationItem are platform
-- records, like AdminAuditEvent: no tenant path reads them, so they carry no
-- RLS policy. EntitlementOverride is read on the tenant's own path (the
-- entitlement check), so it is isolated on its organizationId like every
-- other org-owned table.

-- CreateTable
CREATE TABLE "AdminOrganizationNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOrganizationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOperation" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AdminOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOperationItem" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "AdminOperationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminOrganizationNote_organizationId_createdAt_idx" ON "AdminOrganizationNote"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminOperation_idempotencyKey_key" ON "AdminOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AdminOperation_status_createdAt_idx" ON "AdminOperation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AdminOperation_createdAt_idx" ON "AdminOperation"("createdAt");

-- CreateIndex
CREATE INDEX "AdminOperationItem_operationId_status_idx" ON "AdminOperationItem"("operationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminOperationItem_operationId_targetId_key" ON "AdminOperationItem"("operationId", "targetId");

-- CreateIndex
CREATE INDEX "EntitlementOverride_organizationId_expiresAt_idx" ON "EntitlementOverride"("organizationId", "expiresAt");

-- AddForeignKey
ALTER TABLE "AdminOperationItem" ADD CONSTRAINT "AdminOperationItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AdminOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Isolated on its own organizationId.
ALTER TABLE "EntitlementOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EntitlementOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "EntitlementOverride"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
