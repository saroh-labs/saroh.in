-- ADR-003 / #113 — persist Organization and Project module selection.
--
-- Structural DDL only. The evidence-based data backfill is an idempotent
-- application routine (apps/api.saroh.in/src/modules/capabilities/module-backfill.ts)
-- run as a post-`migrate deploy` step, because the integration test harness
-- provisions its schema with `prisma db push` and could not exercise a backfill
-- embedded here.

-- CreateTable
CREATE TABLE "OrganizationModule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "enabledAt" TIMESTAMP(3),
    "enabledByUserId" TEXT,
    "disabledAt" TIMESTAMP(3),
    "disabledByUserId" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectModule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationModuleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationModule_organizationId_moduleKey_key" ON "OrganizationModule"("organizationId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationModule_organizationId_id_key" ON "OrganizationModule"("organizationId", "id");

-- CreateIndex
CREATE INDEX "OrganizationModule_organizationId_status_idx" ON "OrganizationModule"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectModule_projectId_organizationModuleId_key" ON "ProjectModule"("projectId", "organizationModuleId");

-- CreateIndex
CREATE INDEX "ProjectModule_organizationId_projectId_idx" ON "ProjectModule"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_id_key" ON "Project"("organizationId", "id");

-- Enforce the persisted lifecycle value set at the database layer (ADR-003).
-- Readiness (SETUP_REQUIRED/ACTIVE/ATTENTION_REQUIRED) is derived, never stored.
ALTER TABLE "OrganizationModule"
    ADD CONSTRAINT "OrganizationModule_status_check"
    CHECK ("status" IN ('DISABLED', 'ENABLED', 'ARCHIVED'));

-- AddForeignKey
ALTER TABLE "OrganizationModule" ADD CONSTRAINT "OrganizationModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — the shared "organizationId" makes it structurally impossible
-- for a Project to select another Organization's module (org-consistency).
ALTER TABLE "ProjectModule" ADD CONSTRAINT "ProjectModule_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectModule" ADD CONSTRAINT "ProjectModule_organizationId_organizationModuleId_fkey" FOREIGN KEY ("organizationId", "organizationModuleId") REFERENCES "OrganizationModule"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
