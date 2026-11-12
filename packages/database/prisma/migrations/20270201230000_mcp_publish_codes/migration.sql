-- An AI app's publish codes (plan 2026-11-10-001, U11): preview_publish
-- hands one out, publish_site takes it once. Tenant-owned, so org RLS.
-- CreateTable
CREATE TABLE "McpPublishCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "codeDigest" TEXT NOT NULL,
    "draftFingerprint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpPublishCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpPublishCode_codeDigest_key" ON "McpPublishCode"("codeDigest");

-- CreateIndex
CREATE INDEX "McpPublishCode_organizationId_expiresAt_idx" ON "McpPublishCode"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "McpPublishCode_siteId_idx" ON "McpPublishCode"("siteId");

-- AddForeignKey
ALTER TABLE "McpPublishCode" ADD CONSTRAINT "McpPublishCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPublishCode" ADD CONSTRAINT "McpPublishCode_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "McpPublishCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpPublishCode" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "McpPublishCode";
CREATE POLICY "org_isolation" ON "McpPublishCode"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
