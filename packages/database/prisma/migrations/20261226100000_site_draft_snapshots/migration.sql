-- What Undo puts back after "Use this look with its starter content" (DEC-182).
-- One new table, additive only, no backfill: the image still serving during
-- the deploy reads none of it.
-- CreateTable
CREATE TABLE "SiteDraftSnapshot" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "look" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "SiteDraftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteDraftSnapshot_organizationId_siteId_createdAt_idx" ON "SiteDraftSnapshot"("organizationId", "siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteDraftSnapshot" ADD CONSTRAINT "SiteDraftSnapshot_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDraftSnapshot" ADD CONSTRAINT "SiteDraftSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security (#53).
ALTER TABLE "SiteDraftSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteDraftSnapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteDraftSnapshot"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
