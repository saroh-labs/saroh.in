-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "percentBps" INTEGER,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "appliesTo" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountStore" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "DiscountStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCategory" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "DiscountCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountProduct" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "percentBps" INTEGER,
    "ruleAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Discount_organizationId_idx" ON "Discount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Discount_organizationId_code_key" ON "Discount"("organizationId", "code");

-- CreateIndex
CREATE INDEX "DiscountStore_storeId_idx" ON "DiscountStore"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountStore_discountId_storeId_key" ON "DiscountStore"("discountId", "storeId");

-- CreateIndex
CREATE INDEX "DiscountCategory_categoryId_idx" ON "DiscountCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCategory_discountId_categoryId_key" ON "DiscountCategory"("discountId", "categoryId");

-- CreateIndex
CREATE INDEX "DiscountProduct_productId_idx" ON "DiscountProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountProduct_discountId_productId_key" ON "DiscountProduct"("discountId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_orderId_key" ON "DiscountRedemption"("orderId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_discountId_idx" ON "DiscountRedemption"("discountId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_organizationId_idx" ON "DiscountRedemption"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_discountId_orderId_key" ON "DiscountRedemption"("discountId", "orderId");

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountStore" ADD CONSTRAINT "DiscountStore_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountStore" ADD CONSTRAINT "DiscountStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Row-level security. Discount and DiscountRedemption carry their own
-- organizationId (the BookingEvent shape); the three reach tables reach their
-- organization through the discount (the PostCategory / OrderItem shape).

ALTER TABLE "Discount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Discount" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Discount"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "DiscountRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountRedemption" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "DiscountRedemption"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "DiscountStore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountStore" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "DiscountStore"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Discount" p WHERE p."id" = "DiscountStore"."discountId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Discount" p WHERE p."id" = "DiscountStore"."discountId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "DiscountCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "DiscountCategory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Discount" p WHERE p."id" = "DiscountCategory"."discountId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Discount" p WHERE p."id" = "DiscountCategory"."discountId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "DiscountProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountProduct" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "DiscountProduct"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Discount" p WHERE p."id" = "DiscountProduct"."discountId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Discount" p WHERE p."id" = "DiscountProduct"."discountId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));
