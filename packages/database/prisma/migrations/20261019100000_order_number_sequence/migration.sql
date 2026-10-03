-- P3 (DEC-066): order numbers are one series per business.
--
-- Additive only, so the API before P3 keeps working while it serves: it
-- still counts per storefront and writes no `renumberedFrom`. The unique
-- index on ("organizationId", "orderId") is the contract step, after that
-- image is gone and the backfill (packages/database/src/backfill/
-- order-numbers.cli.ts) has run again.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "renumberedFrom" TEXT;

-- CreateTable
CREATE TABLE "OrderNumberSequence" (
    "organizationId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "OrderNumberSequence" ADD CONSTRAINT "OrderNumberSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (defence in depth, as every business-owned table).
ALTER TABLE "OrderNumberSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderNumberSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OrderNumberSequence"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
