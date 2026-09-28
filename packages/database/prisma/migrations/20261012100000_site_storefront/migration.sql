-- The storefront a site sells from (round-2 G11). Additive: a nullable
-- column, its index and a composite foreign key to the business's own
-- storefront. The previous API image never reads the column.

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "storefrontId" TEXT;

-- CreateIndex
CREATE INDEX "Site_storefrontId_idx" ON "Site"("storefrontId");

-- AddForeignKey: a site can only sell from a storefront of its own business.
ALTER TABLE "Site" ADD CONSTRAINT "Site_storefrontId_organizationId_fkey" FOREIGN KEY ("storefrontId", "organizationId") REFERENCES "Store"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Backfill: set only where the business has exactly one open storefront
-- that lists a published product. Several (or none) stay unset, and the
-- site's settings ask. Never "the first storefront" by creation order.
UPDATE "Site" s
SET "storefrontId" = c."storeId"
FROM (
    SELECT st."organizationId", MIN(st."id") AS "storeId"
    FROM "Store" st
    WHERE st."deletedAt" IS NULL
      AND EXISTS (
          SELECT 1
          FROM "ProductListing" l
          JOIN "Product" p ON p."id" = l."productId"
          WHERE l."storeId" = st."id"
            AND p."status" = 'PUBLISHED'
      )
    GROUP BY st."organizationId"
    HAVING COUNT(*) = 1
) c
WHERE s."organizationId" = c."organizationId"
  AND s."storefrontId" IS NULL
  AND s."deletedAt" IS NULL;
