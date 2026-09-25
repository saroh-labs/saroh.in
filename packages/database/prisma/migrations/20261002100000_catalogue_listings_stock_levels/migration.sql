-- Listings and stock per storefront (#510, ADR-010). A product belongs to
-- the business; a storefront sells it through a ProductListing (and, for a
-- product with variants, the ProductListingVariant rows it sells); stock is
-- one StockLevel row per storefront × product × variant (variant null: the
-- product counts as a whole). Order lines record the row their stock sits
-- on (stockLevelId) and how much they hold on it (heldQuantity).
-- Forward-only: the rollback is the snapshot taken before the deploy.
--
-- This file is the schema only: the guards, the new tables and columns, and
-- row-level security. It takes ACCESS EXCLUSIVE locks on "Product" and
-- "OrderItem" (SET NOT NULL, ADD COLUMN, foreign keys), held until it
-- commits, so it copies nothing: the copy of the old rows is the next
-- migration, 20261002100001_listings_stock_levels_copy, in a transaction of
-- its own that takes only row locks (timed on 20,000 products, 40,000
-- variants and 200,000 order lines: this file about 0.2 s, the copy about
-- 7.5 s — docs/architecture/PRODUCTS_STOCK_ROLLOUT.md).
--
-- The same copy is the TypeScript backfill
-- (packages/database/src/backfill/listings-stock-levels.ts), which the
-- integration suite runs against old-shape rows; run after these migrations
-- it finds nothing left to do. Run it BEFORE this migration when the guard
-- below stops it: it gives every product its business and suffixes product
-- addresses that clash within a business, and reports each one.

-- Every product carries its business (the 20260830 backfill filled most).
UPDATE "Product" p SET "organizationId" = s."organizationId"
FROM "Store" s
WHERE p."storeId" = s."id" AND p."organizationId" IS NULL;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "Product" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'A product has no business (no organizationId and no storefront to take it from). Fix it by hand, mark this migration rolled back, and deploy again.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Product" p JOIN "Store" s ON s."id" = p."storeId"
             WHERE s."organizationId" <> p."organizationId") THEN
    RAISE EXCEPTION 'A product names a business other than its storefront''s. Fix it by hand, mark this migration rolled back, and deploy again.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Product" GROUP BY "organizationId", "slug" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Two products of one business share an address. Run packages/database/src/backfill/listings-stock-levels.cli.ts first, mark this migration rolled back, and deploy again.';
  END IF;
END
$guard$;

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_organizationId_fkey";

-- DropIndex
DROP INDEX "Product_storeId_slug_key";

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "storeId" DROP NOT NULL,
ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "heldQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockLevelId" TEXT;

-- CreateTable
CREATE TABLE "ProductListing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductListingVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "ProductListingVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "promised" INTEGER NOT NULL DEFAULT 0,
    "lowStockAlert" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductListing_productId_idx" ON "ProductListing"("productId");

-- CreateIndex
CREATE INDEX "ProductListing_organizationId_idx" ON "ProductListing"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListing_storeId_productId_key" ON "ProductListing"("storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListing_id_productId_key" ON "ProductListing"("id", "productId");

-- CreateIndex
CREATE INDEX "ProductListingVariant_productId_idx" ON "ProductListingVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductListingVariant_variantId_idx" ON "ProductListingVariant"("variantId");

-- CreateIndex
CREATE INDEX "ProductListingVariant_organizationId_idx" ON "ProductListingVariant"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductListingVariant_listingId_variantId_key" ON "ProductListingVariant"("listingId", "variantId");

-- CreateIndex
CREATE INDEX "StockLevel_productId_idx" ON "StockLevel"("productId");

-- CreateIndex
CREATE INDEX "StockLevel_variantId_idx" ON "StockLevel"("variantId");

-- CreateIndex
CREATE INDEX "StockLevel_organizationId_idx" ON "StockLevel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_storeId_productId_whole_key" ON "StockLevel"("storeId", "productId") WHERE ("variantId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_storeId_variantId_key" ON "StockLevel"("storeId", "variantId") WHERE ("variantId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Store_id_organizationId_key" ON "Store"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "Product"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_organizationId_key" ON "Product"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_id_productId_key" ON "ProductVariant"("id", "productId");

-- CreateIndex
CREATE INDEX "OrderItem_stockLevelId_idx" ON "OrderItem"("stockLevelId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_storeId_organizationId_fkey" FOREIGN KEY ("storeId", "organizationId") REFERENCES "Store"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListing" ADD CONSTRAINT "ProductListing_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListingVariant" ADD CONSTRAINT "ProductListingVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListingVariant" ADD CONSTRAINT "ProductListingVariant_listingId_productId_fkey" FOREIGN KEY ("listingId", "productId") REFERENCES "ProductListing"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListingVariant" ADD CONSTRAINT "ProductListingVariant_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductListingVariant" ADD CONSTRAINT "ProductListingVariant_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "ProductVariant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_storeId_organizationId_fkey" FOREIGN KEY ("storeId", "organizationId") REFERENCES "Store"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "ProductVariant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_stockLevelId_fkey" FOREIGN KEY ("stockLevelId") REFERENCES "StockLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security: each new table isolates on its own organizationId.
ALTER TABLE "ProductListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductListing" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ProductListing";
CREATE POLICY "org_isolation" ON "ProductListing"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ProductListingVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductListingVariant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ProductListingVariant";
CREATE POLICY "org_isolation" ON "ProductListingVariant"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "StockLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLevel" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StockLevel";
CREATE POLICY "org_isolation" ON "StockLevel"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
