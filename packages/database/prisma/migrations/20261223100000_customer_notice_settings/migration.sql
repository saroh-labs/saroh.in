-- A switch for each automatic customer notice (DEC-174, U1 #1132): renewal
-- invoices, failed autopay charges, membership emails and so on. Additive
-- only: one new table. The kinds and their defaults are code
-- (`communications/notice-settings.ts`), and a row is written only when a
-- business's choice differs from the default, so nothing is backfilled and
-- the previous API, which neither reads nor writes it, is unaffected.

-- CreateTable
CREATE TABLE "CustomerNoticeSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerNoticeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerNoticeSetting_organizationId_kind_key" ON "CustomerNoticeSetting"("organizationId", "kind");

-- AddForeignKey
ALTER TABLE "CustomerNoticeSetting" ADD CONSTRAINT "CustomerNoticeSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation (the products_v2 pattern).
ALTER TABLE "CustomerNoticeSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerNoticeSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerNoticeSetting"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
