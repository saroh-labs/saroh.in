-- The daily business deletion sweep (#907): `organization.deletion` takes a
-- business whose PENDING_DELETION window has ended to DELETED_RETAINED.
-- Additive: one waiting run of the chain at a time, like the renewal chain
-- (ADR-007). The image still serving during the deploy reads nothing new.

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_organization_deletion" ON "Job"("type") WHERE (type = 'organization.deletion' AND status = 'PENDING');
