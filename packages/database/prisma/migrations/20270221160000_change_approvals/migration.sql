-- A verdict on one change waiting to go live (DEC-226, website area U9):
-- bound to the change unit's key and fingerprint, so a later edit voids it.
-- Additive only: a new table, nothing read by the image still serving.
-- CreateTable
CREATE TABLE "SiteChangeApproval" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "unitFingerprint" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteChangeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteChangeApproval_organizationId_siteId_createdAt_idx" ON "SiteChangeApproval"("organizationId", "siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteChangeApproval" ADD CONSTRAINT "SiteChangeApproval_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteChangeApproval" ADD CONSTRAINT "SiteChangeApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security (#53).
ALTER TABLE "SiteChangeApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteChangeApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteChangeApproval"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
