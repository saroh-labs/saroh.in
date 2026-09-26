-- The stock log (#513, U4 of the Products and Stock plan).
--
-- StockEntry records every change to what is on a shelf (never a promise):
-- sold, returned, baked, received, wasted, counted, moved, reversed. Each
-- entry reads before + quantity = after, and a row's entries add up to its
-- on hand. So the log adds up from day one, every StockLevel row gets one
-- opening COUNTED entry: from 0 to what is on the shelf now.
-- Additive and forward-only.

-- CreateEnum
CREATE TYPE "StockEntryKind" AS ENUM ('SOLD', 'RETURNED', 'BAKED', 'RECEIVED', 'WASTED', 'COUNTED', 'MOVED', 'REVERSED');

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stockLevelId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "kind" "StockEntryKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "expected" INTEGER,
    "counted" INTEGER,
    "orderId" TEXT,
    "pairId" TEXT,
    "reversesId" TEXT,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_reversesId_key" ON "StockEntry"("reversesId");

-- CreateIndex
CREATE INDEX "StockEntry_organizationId_createdAt_idx" ON "StockEntry"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockEntry_stockLevelId_createdAt_idx" ON "StockEntry"("stockLevelId", "createdAt");

-- CreateIndex
CREATE INDEX "StockEntry_storeId_createdAt_idx" ON "StockEntry"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StockEntry_productId_idx" ON "StockEntry"("productId");

-- CreateIndex
CREATE INDEX "StockEntry_variantId_idx" ON "StockEntry"("variantId");

-- CreateIndex
CREATE INDEX "StockEntry_orderId_idx" ON "StockEntry"("orderId");

-- CreateIndex
CREATE INDEX "StockEntry_pairId_idx" ON "StockEntry"("pairId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_id_organizationId_key" ON "StockLevel"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_stockLevelId_organizationId_fkey" FOREIGN KEY ("stockLevelId", "organizationId") REFERENCES "StockLevel"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_storeId_organizationId_fkey" FOREIGN KEY ("storeId", "organizationId") REFERENCES "Store"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "ProductVariant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The opening count: one entry per row, from 0 to its on hand now.
INSERT INTO "StockEntry" ("id", "organizationId", "stockLevelId", "storeId", "productId", "variantId",
                          "kind", "quantity", "before", "after", "note", "createdAt")
SELECT 'se' || replace(gen_random_uuid()::text, '-', ''), s."organizationId", s."id", s."storeId",
       s."productId", s."variantId", 'COUNTED', s."onHand", 0, s."onHand", 'Opening count', CURRENT_TIMESTAMP
FROM "StockLevel" s
WHERE NOT EXISTS (SELECT 1 FROM "StockEntry" e WHERE e."stockLevelId" = s."id");

-- Row-level security: isolated on its own organizationId.
ALTER TABLE "StockEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StockEntry";
CREATE POLICY "org_isolation" ON "StockEntry"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
