-- Catalogue settings move to the business (#529, ADR-010). Categories,
-- options, custom fields, defaults, allergens and the SKU pattern were kept
-- per storefront; they now belong to the organization. Forward-only: the
-- rollback is the snapshot taken before the deploy.
--
-- A business whose storefronts both have a "Breads" category (or a "Size"
-- option, or defaults for the same key) is merged first by the TypeScript
-- backfill (packages/database/src/backfill/catalogue-settings.ts), which
-- re-points everything that names the duplicates. Today a business has one
-- open storefront, so only one with a closed storefront can have them; the
-- guard below stops this migration, before anything changes, if any do.

-- Every category carries its business (the 20260830 backfill filled most).
UPDATE "Category" c SET "organizationId" = s."organizationId"
FROM "Store" s
WHERE c."storeId" = s."id" AND c."organizationId" IS NULL;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "Category" GROUP BY "organizationId", "slug" HAVING COUNT(*) > 1)
     OR EXISTS (SELECT 1 FROM "ProductOption" GROUP BY "organizationId", "name" HAVING COUNT(*) > 1)
     OR EXISTS (SELECT 1 FROM "CatalogueDefaults" GROUP BY "organizationId", "key" HAVING COUNT(*) > 1)
  THEN
    RAISE EXCEPTION 'A business has the same category, option or defaults at two storefronts. Run packages/database/src/backfill/catalogue-settings.cli.ts first, mark this migration rolled back, and deploy again.';
  END IF;
END
$guard$;

-- DropForeignKey
ALTER TABLE "ProductOption" DROP CONSTRAINT "ProductOption_storeId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogueDefaults" DROP CONSTRAINT "CatalogueDefaults_storeId_fkey";

-- DropForeignKey
ALTER TABLE "ProductField" DROP CONSTRAINT "ProductField_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreAllergen" DROP CONSTRAINT "StoreAllergen_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_organizationId_fkey";

-- DropIndex
DROP INDEX "ProductOption_organizationId_idx";

-- DropIndex
DROP INDEX "ProductOption_storeId_name_key";

-- DropIndex
DROP INDEX "CatalogueDefaults_organizationId_idx";

-- DropIndex
DROP INDEX "CatalogueDefaults_storeId_key_key";

-- DropIndex
DROP INDEX "Category_organizationId_idx";

-- DropIndex
DROP INDEX "Category_storeId_slug_key";

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "skuPattern" TEXT,
ADD COLUMN     "skuSuggest" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProductOption" ALTER COLUMN "storeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CatalogueDefaults" ALTER COLUMN "storeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProductField" ALTER COLUMN "storeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StoreAllergen" ALTER COLUMN "storeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "storeId" DROP NOT NULL,
ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ProductOption_storeId_idx" ON "ProductOption"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_organizationId_name_key" ON "ProductOption"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CatalogueDefaults_storeId_idx" ON "CatalogueDefaults"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueDefaults_organizationId_key_key" ON "CatalogueDefaults"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_slug_key" ON "Category"("organizationId", "slug");

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueDefaults" ADD CONSTRAINT "CatalogueDefaults_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductField" ADD CONSTRAINT "ProductField_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAllergen" ADD CONSTRAINT "StoreAllergen_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The SKU pattern moves to the business: the oldest storefront that set one
-- (or switched suggestions off) gives it; the backfill reports any other
-- storefront whose pattern differed. The id is made here because the column
-- has no database default; nothing refers to a profile by its id.
INSERT INTO "BusinessProfile" ("id", "organizationId", "skuPattern", "skuSuggest", "createdAt", "updatedAt")
SELECT DISTINCT ON (s."organizationId")
       'bp' || replace(gen_random_uuid()::text, '-', ''),
       s."organizationId", ss."skuPattern", ss."skuSuggest", now(), now()
FROM "StoreSettings" ss
JOIN "Store" s ON s."id" = ss."storeId"
WHERE ss."skuPattern" IS NOT NULL OR ss."skuSuggest" = false
ORDER BY s."organizationId", s."createdAt", s."id"
ON CONFLICT ("organizationId") DO UPDATE
  SET "skuPattern" = EXCLUDED."skuPattern", "skuSuggest" = EXCLUDED."skuSuggest";

-- Row-level security. ProductOption, CatalogueDefaults, ProductField and
-- StoreAllergen already isolate on their own organizationId; restated for
-- Category, whose column is now required.
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Category";
CREATE POLICY "org_isolation" ON "Category"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

-- A field's categories reach their business through the field, as
-- DiscountCategory reaches it through the discount.
ALTER TABLE "ProductFieldCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductFieldCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ProductFieldCategory";
CREATE POLICY "org_isolation" ON "ProductFieldCategory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "ProductField" f WHERE f."id" = "ProductFieldCategory"."fieldId"
                    AND f."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "ProductField" f WHERE f."id" = "ProductFieldCategory"."fieldId"
                    AND f."organizationId" = current_setting('app.current_organization_id', true)));
