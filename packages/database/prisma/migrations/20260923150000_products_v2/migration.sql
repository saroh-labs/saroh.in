-- Products v2 (#460): per-variant stock, an ordered photo set, MRP, general
-- details, SEO fields, store-wide options and catalogue defaults.
-- Additive only. Existing products keep their product-level Inventory row;
-- a product counts per variant once it has VariantInventory rows.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "howToUse" TEXT,
ADD COLUMN     "keyPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "madeHere" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "madeIn" TEXT,
ADD COLUMN     "maker" TEXT,
ADD COLUMN     "materials" TEXT,
ADD COLUMN     "mrp" DECIMAL(10,2),
ADD COLUMN     "optionId" TEXT,
ADD COLUMN     "returnsMode" TEXT NOT NULL DEFAULT 'STOREFRONT',
ADD COLUMN     "returnsText" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoImageId" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shopFields" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "supplierCode" TEXT,
ADD COLUMN     "warranty" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "imageId" TEXT,
ADD COLUMN     "mrp" DECIMAL(10,2),
ADD COLUMN     "optionValueId" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mediaId" TEXT,
    "alt" TEXT NOT NULL DEFAULT '',
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL,
    "creditName" TEXT,
    "creditUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueDefaults" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" TEXT,
    "howToUse" TEXT,
    "lowStockAlert" INTEGER,
    "returnsMode" TEXT,
    "returnsText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogueDefaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantInventory" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockAlert" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductImage_organizationId_idx" ON "ProductImage"("organizationId");

-- CreateIndex
CREATE INDEX "ProductOption_organizationId_idx" ON "ProductOption"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOption_storeId_name_key" ON "ProductOption"("storeId", "name");

-- CreateIndex
CREATE INDEX "ProductOptionValue_organizationId_idx" ON "ProductOptionValue"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");

-- CreateIndex
CREATE INDEX "CatalogueDefaults_organizationId_idx" ON "CatalogueDefaults"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueDefaults_storeId_key_key" ON "CatalogueDefaults"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "VariantInventory_variantId_key" ON "VariantInventory"("variantId");

-- CreateIndex
CREATE INDEX "VariantInventory_productId_idx" ON "VariantInventory"("productId");

-- CreateIndex
CREATE INDEX "VariantInventory_organizationId_idx" ON "VariantInventory"("organizationId");

-- CreateIndex
CREATE INDEX "Product_optionId_idx" ON "Product"("optionId");

-- CreateIndex
CREATE INDEX "ProductVariant_optionValueId_idx" ON "ProductVariant"("optionValueId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_seoImageId_fkey" FOREIGN KEY ("seoImageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "ProductOptionValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueDefaults" ADD CONSTRAINT "CatalogueDefaults_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueDefaults" ADD CONSTRAINT "CatalogueDefaults_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueDefaults" ADD CONSTRAINT "CatalogueDefaults_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantInventory" ADD CONSTRAINT "VariantInventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantInventory" ADD CONSTRAINT "VariantInventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every product's existing picture becomes its cover photo.
INSERT INTO "ProductImage" ("id", "productId", "organizationId", "url", "alt", "position")
SELECT 'pimg_' || md5(p."id"), p."id", p."organizationId", p."image", p."name", 0
FROM "Product" p
WHERE p."image" IS NOT NULL AND p."image" <> '' AND p."organizationId" IS NOT NULL;

-- Backfill: variants keep the order they were created in.
UPDATE "ProductVariant" v SET "position" = o.rn
FROM (SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "createdAt", "id") - 1)::int AS rn
      FROM "ProductVariant") o
WHERE v."id" = o."id";

-- Isolation: each new table carries its own organizationId.
ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductImage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductImage"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ProductOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductOption" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductOption"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ProductOptionValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductOptionValue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductOptionValue"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CatalogueDefaults" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogueDefaults" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CatalogueDefaults"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "VariantInventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariantInventory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "VariantInventory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

