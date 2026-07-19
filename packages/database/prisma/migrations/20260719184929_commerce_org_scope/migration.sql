-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "organizationId" TEXT;

-- CreateIndex
CREATE INDEX "Cart_organizationId_idx" ON "Cart"("organizationId");

-- CreateIndex
CREATE INDEX "Category_organizationId_idx" ON "Category"("organizationId");

-- CreateIndex
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

-- CreateIndex
CREATE INDEX "Inventory_organizationId_idx" ON "Inventory"("organizationId");

-- CreateIndex
CREATE INDEX "Order_organizationId_idx" ON "Order"("organizationId");

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- S5-001 backfill: attach existing commerce rows to their Store's Organization.
UPDATE "Product"   c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL AND s."organizationId" IS NOT NULL;
UPDATE "Category"  c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL AND s."organizationId" IS NOT NULL;
UPDATE "Inventory" c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL AND s."organizationId" IS NOT NULL;
UPDATE "Customer"  c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL AND s."organizationId" IS NOT NULL;
UPDATE "Cart"      c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL AND s."organizationId" IS NOT NULL;
UPDATE "Order"     c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL AND s."organizationId" IS NOT NULL;
