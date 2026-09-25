-- Track stock on and off (#515, U6 of the Products and Stock plan).
--
-- Product.stockTracked: the product counts stock. Until now a product
-- counted stock exactly when it had a StockLevel row, so the backfill reads
-- that; stockTrackedAt is its first stock entry, when it started counting.
-- BusinessProfile.stockTracking: the whole business counts stock (on unless
-- turned off; a business with no profile reads as on).
-- Additive and forward-only.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "stockTracking" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stockTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockTrackedAt" TIMESTAMP(3);

-- A product with a shelf anywhere counts stock.
UPDATE "Product" p
SET "stockTracked" = true,
    "stockTrackedAt" = (
        SELECT min(e."createdAt") FROM "StockEntry" e WHERE e."productId" = p."id"
    )
WHERE EXISTS (SELECT 1 FROM "StockLevel" s WHERE s."productId" = p."id");
