-- Reports customers send at saroh.in/customers about a business that uses
-- Saroh (Terms rev 46, 9 Oct). Read and closed by staff in the admin console.

-- CreateEnum
CREATE TYPE "BusinessReportStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "BusinessReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "siteHost" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reporterEmail" TEXT,
    "ipHash" TEXT,
    "status" "BusinessReportStatus" NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessReport_status_createdAt_idx" ON "BusinessReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessReport_organizationId_createdAt_idx" ON "BusinessReport"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessReport" ADD CONSTRAINT "BusinessReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security (#53). A report is written from a public route and
-- read by staff, both outside any organization context; inside one, a
-- business sees only reports about itself (and none without a business).
ALTER TABLE "BusinessReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BusinessReport"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
