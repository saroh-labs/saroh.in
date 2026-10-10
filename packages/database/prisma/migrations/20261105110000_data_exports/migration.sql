-- "Download your data" (owner, 9 Oct, DEC-120): one zip of a business's
-- records and media, built in the background, kept 7 days. Additive only:
-- one new table. The image still serving during the deploy neither reads nor
-- writes it.

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "sizeBytes" BIGINT,
    "counts" JSONB,
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataExport_organizationId_createdAt_idx" ON "DataExport"("organizationId", "createdAt");

-- One being made at a time per business.
-- CreateIndex
CREATE UNIQUE INDEX "DataExport_one_running_per_org" ON "DataExport"("organizationId") WHERE (status = 'QUEUED' OR status = 'RUNNING');

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "DataExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataExport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "DataExport"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
