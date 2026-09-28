-- An order's pay link (plan B, B11). Additive: the API image before this one
-- never reads the new columns, and both are null on every existing order.

-- The pay link's token, stored only as its SHA-256, and when it was made.
ALTER TABLE "Order" ADD COLUMN     "payTokenHash" TEXT,
ADD COLUMN     "payLinkCreatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_payTokenHash_key" ON "Order"("payTokenHash");
