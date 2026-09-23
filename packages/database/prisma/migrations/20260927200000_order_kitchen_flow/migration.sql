-- CreateEnum
CREATE TYPE "OrderStage" AS ENUM ('NEW', 'PREPARING', 'READY', 'COLLECTED', 'HANDED_TO_COURIER', 'DELIVERED');

-- CreateEnum
CREATE TYPE "OrderFulfilment" AS ENUM ('COLLECT', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OrderEventKind" AS ENUM ('STAGE', 'UNDO', 'STATUS', 'EDIT', 'REFUND');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryCity" TEXT,
ADD COLUMN     "deliveryLine1" TEXT,
ADD COLUMN     "deliveryLine2" TEXT,
ADD COLUMN     "deliveryName" TEXT,
ADD COLUMN     "deliveryPhone" TEXT,
ADD COLUMN     "deliveryPostalCode" TEXT,
ADD COLUMN     "deliveryState" TEXT,
ADD COLUMN     "fulfilment" "OrderFulfilment" NOT NULL DEFAULT 'COLLECT',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "stage" "OrderStage" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "trackingUrl" TEXT;

-- AlterTable
ALTER TABLE "PaymentRefund" ADD COLUMN     "forEdit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderEventKind" NOT NULL,
    "actorUserId" TEXT,
    "fromStage" "OrderStage",
    "toStage" "OrderStage",
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "amountCents" INTEGER,
    "undoneAt" TIMESTAMP(3),
    "undoesEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefundLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentRefundId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRefundLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_organizationId_idx" ON "OrderEvent"("organizationId");

-- CreateIndex
CREATE INDEX "PaymentRefundLine_paymentRefundId_idx" ON "PaymentRefundLine"("paymentRefundId");

-- CreateIndex
CREATE INDEX "PaymentRefundLine_orderItemId_idx" ON "PaymentRefundLine"("orderItemId");

-- CreateIndex
CREATE INDEX "PaymentRefundLine_organizationId_idx" ON "PaymentRefundLine"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_paymentIntentId_idempotencyKey_key" ON "PaymentRefund"("paymentIntentId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefundLine" ADD CONSTRAINT "PaymentRefundLine_paymentRefundId_fkey" FOREIGN KEY ("paymentRefundId") REFERENCES "PaymentRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefundLine" ADD CONSTRAINT "PaymentRefundLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing order gets the stage its status already says.
-- An order that went out by the old flow (SHIPPED, then DELIVERED) went by
-- courier, so it is a delivery. PENDING and CANCELLED keep NEW; a cancelled
-- order moves no further, so its stage is never read as work.
UPDATE "Order" SET "stage" = 'PREPARING' WHERE "status" = 'PROCESSING';
UPDATE "Order" SET "stage" = 'HANDED_TO_COURIER', "fulfilment" = 'DELIVERY' WHERE "status" = 'SHIPPED';
UPDATE "Order" SET "stage" = 'DELIVERED', "fulfilment" = 'DELIVERY' WHERE "status" = 'DELIVERED';

-- Row-level security (defence in depth), the repo's org_isolation shape.
ALTER TABLE "OrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OrderEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentRefundLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentRefundLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PaymentRefundLine"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
