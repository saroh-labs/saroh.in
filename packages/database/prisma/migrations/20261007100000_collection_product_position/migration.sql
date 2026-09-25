-- A hand-picked collection's products in order (#516), and which stock
-- entries Saroh wrote rather than a person (#513, #515). Additive and
-- forward-only.

-- StockEntry.system: why Saroh wrote the entry (TRACKING_OFF, PER_VARIANT,
-- VARIANT_REMOVED), null for a person's or an order's. The stock log never
-- undoes one.
-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "system" TEXT;

-- The counts Saroh wrote before the column existed, found by their notes.
UPDATE "StockEntry" SET "system" = 'TRACKING_OFF'
WHERE "kind" = 'COUNTED' AND "note" = 'Track stock turned off' AND "system" IS NULL;
UPDATE "StockEntry" SET "system" = 'PER_VARIANT'
WHERE "kind" = 'COUNTED' AND "note" = 'Now counted per variant' AND "system" IS NULL;
UPDATE "StockEntry" SET "system" = 'VARIANT_REMOVED'
WHERE "kind" = 'COUNTED' AND "note" LIKE 'Took back %''s stock' AND "system" IS NULL;

-- CollectionsService.get reads a collection's products ORDER BY position.
-- CreateIndex
CREATE INDEX "CollectionProduct_collectionId_position_idx" ON "CollectionProduct"("collectionId", "position");
