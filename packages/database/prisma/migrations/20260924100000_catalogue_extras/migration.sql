-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "skuPattern" TEXT,
ADD COLUMN     "skuSuggest" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProductField" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "onShop" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFieldCategory" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProductFieldCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFieldValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAllergen" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAllergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAllergen" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "ProductAllergen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductField_storeId_idx" ON "ProductField"("storeId");

-- CreateIndex
CREATE INDEX "ProductField_organizationId_idx" ON "ProductField"("organizationId");

-- CreateIndex
CREATE INDEX "ProductFieldCategory_categoryId_idx" ON "ProductFieldCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFieldCategory_fieldId_categoryId_key" ON "ProductFieldCategory"("fieldId", "categoryId");

-- CreateIndex
CREATE INDEX "ProductFieldValue_fieldId_idx" ON "ProductFieldValue"("fieldId");

-- CreateIndex
CREATE INDEX "ProductFieldValue_organizationId_idx" ON "ProductFieldValue"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFieldValue_productId_fieldId_key" ON "ProductFieldValue"("productId", "fieldId");

-- CreateIndex
CREATE INDEX "StoreAllergen_storeId_idx" ON "StoreAllergen"("storeId");

-- CreateIndex
CREATE INDEX "StoreAllergen_organizationId_idx" ON "StoreAllergen"("organizationId");

-- CreateIndex
CREATE INDEX "ProductAllergen_allergenId_idx" ON "ProductAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "ProductAllergen_organizationId_idx" ON "ProductAllergen"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAllergen_productId_allergenId_key" ON "ProductAllergen"("productId", "allergenId");

-- AddForeignKey
ALTER TABLE "ProductField" ADD CONSTRAINT "ProductField_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductField" ADD CONSTRAINT "ProductField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFieldCategory" ADD CONSTRAINT "ProductFieldCategory_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProductField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFieldCategory" ADD CONSTRAINT "ProductFieldCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFieldValue" ADD CONSTRAINT "ProductFieldValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFieldValue" ADD CONSTRAINT "ProductFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProductField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFieldValue" ADD CONSTRAINT "ProductFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAllergen" ADD CONSTRAINT "StoreAllergen_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAllergen" ADD CONSTRAINT "StoreAllergen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAllergen" ADD CONSTRAINT "ProductAllergen_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAllergen" ADD CONSTRAINT "ProductAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "StoreAllergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAllergen" ADD CONSTRAINT "ProductAllergen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security: the organization owns every row (ADR-001).
ALTER TABLE "ProductField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductField" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductField"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ProductFieldValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductFieldValue" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductFieldValue"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "StoreAllergen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreAllergen" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "StoreAllergen"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ProductAllergen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductAllergen" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductAllergen"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
