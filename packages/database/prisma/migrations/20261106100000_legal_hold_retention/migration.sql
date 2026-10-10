-- Legal hold, and 180 days' retention after deletion (DEC-122, owner 10 Oct).
-- Additive only: four nullable columns on Organization, one index and two
-- "one waiting run" indexes for the new daily chains. The image still
-- serving during the deploy reads and writes none of them.

-- A legal hold on a business (who, when, why), and when the retention
-- eraser finished with a deleted one.
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "legalHoldAt" TIMESTAMP(3),
ADD COLUMN     "legalHoldByUserId" TEXT,
ADD COLUMN     "legalHoldReason" TEXT,
ADD COLUMN     "retentionErasedAt" TIMESTAMP(3);

-- The security-log retention sweep reads ended sessions in this order.
-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- One waiting run of each chain at a time, like the renewal chain (ADR-007).
-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_organization_retention_erase" ON "Job"("type") WHERE (type = 'organization.retention.erase' AND status = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_security_logs_retention" ON "Job"("type") WHERE (type = 'security-logs.retention' AND status = 'PENDING');
