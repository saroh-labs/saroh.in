-- Stock checks someone has resolved (#514, U5 of the Products and Stock plan).
--
-- The checks are computed when read; this table only remembers which one was
-- looked at and what it read then (its fingerprint), so a check whose numbers
-- move on opens again. Additive.

-- CreateEnum
CREATE TYPE "StockCheckKind" AS ENUM ('SHORT', 'COUNT_MISMATCH', 'SALE_NOT_TAKEN', 'PROMISED_MISMATCH');

-- CreateTable
CREATE TABLE "StockCheckResolution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "StockCheckKind" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "stockLevelId" TEXT,
    "resolvedByUserId" TEXT,
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCheckResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCheckResolution_stockLevelId_idx" ON "StockCheckResolution"("stockLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCheckResolution_organizationId_key_key" ON "StockCheckResolution"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "StockCheckResolution" ADD CONSTRAINT "StockCheckResolution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCheckResolution" ADD CONSTRAINT "StockCheckResolution_stockLevelId_organizationId_fkey" FOREIGN KEY ("stockLevelId", "organizationId") REFERENCES "StockLevel"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: isolated on its own organizationId.
ALTER TABLE "StockCheckResolution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCheckResolution" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StockCheckResolution";
CREATE POLICY "org_isolation" ON "StockCheckResolution"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
