-- Listings and stock per storefront (#510, ADR-010). A product belongs to
-- the business; a storefront sells it through a ProductListing (and, for a
-- product with variants, the ProductListingVariant rows it sells); stock is
-- one StockLevel row per storefront × product × variant (variant null: the
-- product counts as a whole). Order lines record the row their stock sits
-- on (stockLevelId) and how much they hold on it (heldQuantity).
-- Forward-only: the rollback is the snapshot taken before the deploy.
--
-- Inventory and VariantInventory are copied here and no longer written; they
-- are dropped in a later deploy. The same copy is the TypeScript backfill
-- (packages/database/src/backfill/listings-stock-levels.ts), which the
-- integration suite runs against old-shape rows; run after this migration it
-- finds nothing left to do. Run it BEFORE this migration when the guard
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


-- Every product is listed at the storefront it was made at, with all its
-- variants.
INSERT INTO "ProductListing" ("id", "organizationId", "storeId", "productId", "createdAt")
SELECT 'pl' || replace(gen_random_uuid()::text, '-', ''), p."organizationId", p."storeId", p."id", p."createdAt"
FROM "Product" p
WHERE p."storeId" IS NOT NULL
ON CONFLICT ("storeId", "productId") DO NOTHING;

INSERT INTO "ProductListingVariant" ("id", "organizationId", "listingId", "productId", "variantId")
SELECT 'plv' || replace(gen_random_uuid()::text, '-', ''), l."organizationId", l."id", l."productId", v."id"
FROM "ProductListing" l
JOIN "ProductVariant" v ON v."productId" = l."productId"
ON CONFLICT ("listingId", "variantId") DO NOTHING;

-- One StockLevel per Inventory row (the product counted as a whole, or what
-- lines without a variant still hold once it counts per variant) and per
-- VariantInventory row, at the product's storefront, with its numbers.
INSERT INTO "StockLevel" ("id", "organizationId", "storeId", "productId", "variantId", "onHand", "promised", "lowStockAlert", "updatedAt")
SELECT 'sl' || replace(gen_random_uuid()::text, '-', ''), p."organizationId", p."storeId", p."id", NULL,
       i."quantity", i."reserved", i."lowStockAlert", i."updatedAt"
FROM "Inventory" i
JOIN "Product" p ON p."id" = i."productId"
WHERE p."storeId" IS NOT NULL
ON CONFLICT ("storeId", "productId") WHERE "variantId" IS NULL DO NOTHING;

INSERT INTO "StockLevel" ("id", "organizationId", "storeId", "productId", "variantId", "onHand", "promised", "lowStockAlert", "updatedAt")
SELECT 'sl' || replace(gen_random_uuid()::text, '-', ''), p."organizationId", p."storeId", p."id", vi."variantId",
       vi."quantity", vi."reserved", vi."lowStockAlert", vi."updatedAt"
FROM "VariantInventory" vi
JOIN "Product" p ON p."id" = vi."productId"
WHERE p."storeId" IS NOT NULL
ON CONFLICT ("storeId", "variantId") WHERE "variantId" IS NOT NULL DO NOTHING;

-- Every line of an open or fulfilled order that holds (or held) stock names
-- its row at the order's storefront: the one it recorded, or — for a line
-- from before rows were recorded, on a product that counts — the old guess
-- (its variant's row if it has one, else the product's). An open line holds
-- its quantity; a fulfilled one holds nothing but keeps the row, so a later
-- return can put units back on the same shelf.
WITH line AS (
  SELECT oi."id", oi."quantity", oi."stockRow", o."status",
         vrow."id" AS "variantRow", prow."id" AS "productRow"
  FROM "OrderItem" oi
  JOIN "Order" o ON o."id" = oi."orderId"
  LEFT JOIN "StockLevel" vrow
    ON vrow."storeId" = o."storeId" AND vrow."variantId" = oi."variantId"
  LEFT JOIN "StockLevel" prow
    ON prow."storeId" = o."storeId" AND prow."productId" = oi."productId" AND prow."variantId" IS NULL
  WHERE o."status" IN ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED')
    AND oi."stockLevelId" IS NULL
    AND (oi."stockRow" IS NULL OR oi."stockRow" <> 'NONE')
), chosen AS (
  SELECT "id", "quantity", "status",
         CASE
           WHEN "stockRow" = 'VARIANT' THEN "variantRow"
           WHEN "stockRow" = 'PRODUCT' THEN "productRow"
           ELSE COALESCE("variantRow", "productRow")
         END AS "row",
         CASE
           WHEN "stockRow" IS NOT NULL THEN "stockRow"
           WHEN "variantRow" IS NOT NULL THEN 'VARIANT'::"StockRow"
           WHEN "productRow" IS NOT NULL THEN 'PRODUCT'::"StockRow"
         END AS "kind"
  FROM line
)
UPDATE "OrderItem" oi
SET "stockLevelId" = c."row",
    "stockRow" = c."kind",
    "heldQuantity" = CASE WHEN c."status" IN ('PENDING', 'PROCESSING') THEN c."quantity" ELSE 0 END
FROM chosen c
WHERE oi."id" = c."id" AND c."row" IS NOT NULL;

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
