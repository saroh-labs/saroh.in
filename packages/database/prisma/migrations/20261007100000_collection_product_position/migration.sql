-- A hand-picked collection's products in order (#516), which stock entries
-- Saroh wrote rather than a person (#513, #515), and the partial indexes the
-- held-stock check at the API's start reads (#511). Additive and
-- forward-only.

-- StockEntry.system: why Saroh wrote the entry (TRACKING_OFF, PER_VARIANT,
-- VARIANT_REMOVED), null for a person's or an order's. The stock log never
-- undoes one.
-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "system" TEXT;

-- The counts Saroh wrote before the column existed. A note alone could be a
-- person's (a count's note is free text), so each is matched on its note
-- AND the shape only Saroh's writer gives it: never an expected figure, no
-- order, pair or reversal, and what it counted is where the shelf ended.
-- On a database this release reaches for the first time there are none:
-- the code that writes them ships with it.

-- Track stock turned off: every shelf with units counted to 0, from what it
-- held (tracking.ts emptyShelves).
UPDATE "StockEntry" SET "system" = 'TRACKING_OFF'
WHERE "system" IS NULL AND "kind" = 'COUNTED'
  AND "note" = 'Track stock turned off'
  AND "counted" = 0 AND "after" = 0
  AND "quantity" <> 0 AND "quantity" = -"before"
  AND "expected" IS NULL AND "orderId" IS NULL
  AND "pairId" IS NULL AND "reversesId" IS NULL;

-- The switch to per-variant stock (inventory.service switchStore): it opens
-- a shelf for every variant and counts it first, then counts the product's
-- own shelf, all in one transaction. So an entry is the switch's only when,
-- at its storefront and within seconds, a variant shelf of the same product
-- was counted with the note as its very first entry.
UPDATE "StockEntry" e SET "system" = 'PER_VARIANT'
WHERE e."system" IS NULL AND e."kind" = 'COUNTED'
  AND e."note" = 'Now counted per variant'
  AND e."counted" = e."after"
  AND e."expected" IS NULL AND e."orderId" IS NULL
  AND e."pairId" IS NULL AND e."reversesId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StockEntry" v
    WHERE v."productId" = e."productId" AND v."storeId" = e."storeId"
      AND v."variantId" IS NOT NULL AND v."kind" = 'COUNTED'
      AND v."note" = 'Now counted per variant'
      AND v."expected" IS NULL AND v."counted" = v."after"
      AND v."createdAt" BETWEEN e."createdAt" - INTERVAL '5 seconds'
                            AND e."createdAt" + INTERVAL '5 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM "StockEntry" p
        WHERE p."stockLevelId" = v."stockLevelId"
          AND (p."createdAt", p.id) < (v."createdAt", v.id)
      )
  );

-- A removed variant's stock taken back (variants.service removeIn): on the
-- product's own shelf, a change that isn't 0, and the note names a variant
-- the product no longer has — it was removed in the same transaction.
UPDATE "StockEntry" e SET "system" = 'VARIANT_REMOVED'
WHERE e."system" IS NULL AND e."kind" = 'COUNTED'
  AND e."note" LIKE 'Took back %''s stock'
  AND e."variantId" IS NULL
  AND e."quantity" <> 0 AND e."counted" = e."after"
  AND e."expected" IS NULL AND e."orderId" IS NULL
  AND e."pairId" IS NULL AND e."reversesId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProductVariant" pv
    WHERE pv."productId" = e."productId"
      AND e."note" = 'Took back ' || pv."title" || '''s stock'
  );

-- CollectionsService.get reads a collection's products ORDER BY position.
-- CreateIndex
CREATE INDEX "CollectionProduct_collectionId_position_idx" ON "CollectionProduct"("collectionId", "position");

-- The held-stock check (HeldStockWatch, at every API start, across every
-- business) reads only rows that promise something and lines that hold
-- something, a few of each, not every order line ever sold.
-- CreateIndex
CREATE INDEX "StockLevel_promising_idx" ON "StockLevel"("organizationId") WHERE (promised <> 0);

-- CreateIndex
CREATE INDEX "OrderItem_holding_idx" ON "OrderItem"("stockLevelId") WHERE ("heldQuantity" <> 0);
