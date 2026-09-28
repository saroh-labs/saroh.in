-- Bulk kitchen moves with a hold and Undo all (round-2 B6, R11): a batch
-- the Orders list posts, held on the server ten seconds and then committed
-- line by line by its job or "Send now". Additive only: one enum and two new
-- tables. The previous API neither reads nor writes them.

-- CreateEnum
CREATE TYPE "OrderStageBatchStatus" AS ENUM ('HELD', 'COMMITTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OrderStageBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "OrderStageBatchStatus" NOT NULL DEFAULT 'HELD',
    "commitAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStageBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStageBatchLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fromStage" "OrderStage" NOT NULL,
    "toStage" "OrderStage" NOT NULL,
    "result" TEXT,
    "reason" TEXT,
    "stageEventId" TEXT,
    "undoResult" TEXT,
    "undoReason" TEXT,
    "undoEventId" TEXT,
    "told" BOOLEAN,

    CONSTRAINT "OrderStageBatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderStageBatch_organizationId_idx" ON "OrderStageBatch"("organizationId");

-- CreateIndex
CREATE INDEX "OrderStageBatchLine_organizationId_idx" ON "OrderStageBatchLine"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStageBatchLine_batchId_orderId_key" ON "OrderStageBatchLine"("batchId", "orderId");

-- AddForeignKey
ALTER TABLE "OrderStageBatch" ADD CONSTRAINT "OrderStageBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStageBatchLine" ADD CONSTRAINT "OrderStageBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OrderStageBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "OrderStageBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderStageBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OrderStageBatch"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "OrderStageBatchLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderStageBatchLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OrderStageBatchLine"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
