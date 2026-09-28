-- The site's bag and checkout (round-2 G13). Additive: the API image before
-- this one never reads the new columns, and all are null on existing rows.

-- The checkout sheet's idempotency key on the order it started. Unique per
-- storefront; many nulls are allowed.
ALTER TABLE "Order" ADD COLUMN     "checkoutKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_checkoutKey_key" ON "Order"("storeId", "checkoutKey");

-- The shop's flat delivery fees per storefront. Null is free.
ALTER TABLE "StoreSettings" ADD COLUMN     "localDeliveryFee" DECIMAL(10,2),
ADD COLUMN     "shippingFee" DECIMAL(10,2);
