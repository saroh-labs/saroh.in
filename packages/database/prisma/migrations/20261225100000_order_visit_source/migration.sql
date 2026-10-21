-- U15 (#1099): where the website visit that placed an order came from.
-- One of five groups and the merchant's own link label; no visit id and
-- nothing about the visitor. Cleared by the analytics retention sweep.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "visitRef" TEXT,
ADD COLUMN     "visitSource" TEXT;

-- CreateIndex
CREATE INDEX "Order_visitSource_retention_idx" ON "Order"("createdAt") WHERE ("visitSource" IS NOT NULL);
