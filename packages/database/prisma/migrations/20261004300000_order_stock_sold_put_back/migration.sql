-- Orders hold, sell and release at the storefront (#511, U2 of the Products
-- and Stock plan).
--
-- OrderItem.soldQuantity: how many units a line took off its shelf when it
-- was fulfilled, so a kitchen undo holds exactly those again and a return
-- puts back no more than was sold. PaymentRefundLine.putBackQuantity: the
-- units a refund puts back on the shelf ("Put N back in stock"), written as
-- a Returned entry only once the provider confirms the refund.
-- Additive and forward-only.

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "soldQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentRefundLine" ADD COLUMN "putBackQuantity" INTEGER NOT NULL DEFAULT 0;

-- A line of a fulfilled order that sits on a shelf sold its whole quantity
-- (refunds did not touch stock before this change).
UPDATE "OrderItem" oi
SET "soldQuantity" = oi."quantity"
FROM "Order" o
WHERE o."id" = oi."orderId"
  AND o."status" IN ('SHIPPED', 'DELIVERED')
  AND oi."stockLevelId" IS NOT NULL
  AND oi."stockRow" IS DISTINCT FROM 'NONE';
