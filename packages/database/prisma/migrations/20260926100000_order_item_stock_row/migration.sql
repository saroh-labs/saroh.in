-- CreateEnum
CREATE TYPE "StockRow" AS ENUM ('PRODUCT', 'VARIANT', 'NONE');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "stockRow" "StockRow";

-- Backfill: open orders (PENDING, PROCESSING — the reserving statuses) hold
-- their lines where the transition code would settle them today: the
-- variant's own row if it has one, else the product's, else nothing held.
-- Shipped, delivered and cancelled orders never move stock again.
UPDATE "OrderItem" oi
SET "stockRow" = CASE
    WHEN oi."variantId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "VariantInventory" vi WHERE vi."variantId" = oi."variantId"
    ) THEN 'VARIANT'::"StockRow"
    WHEN EXISTS (
        SELECT 1 FROM "Inventory" i WHERE i."productId" = oi."productId"
    ) THEN 'PRODUCT'::"StockRow"
    ELSE 'NONE'::"StockRow"
END
FROM "Order" o
WHERE o.id = oi."orderId"
  AND o.status IN ('PENDING', 'PROCESSING');
