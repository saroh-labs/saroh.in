-- Fulfilment types, release 1 of 3 (B2a, DEC-045): which physical ways a
-- storefront's orders leave. A file after 20261009130000 because it stores
-- the values that migration added.
--
-- Additive: the previous image never selects the column. Only PICKUP,
-- LOCAL_DELIVERY and SHIPPING are ever stored here; Digital and the
-- appointment types follow the product (B12).
--
-- ADD COLUMN with a constant default is a catalogue change (no rewrite)
-- under a brief ACCESS EXCLUSIVE lock on "StoreSettings"; the backfill then
-- takes row locks on every storefront's settings row, one UPDATE.

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "fulfilmentTypes" "OrderFulfilment"[] DEFAULT ARRAY[]::"OrderFulfilment"[];

-- Backfill: PICKUP where collection is on, LOCAL_DELIVERY where the
-- storefront has ever taken a DELIVERY order, SHIPPING where shipping is on.
-- Always in that order, which is the order the API keeps it in.
UPDATE "StoreSettings" s
SET "fulfilmentTypes" = ARRAY(
    SELECT t::"OrderFulfilment"
    FROM (
        SELECT 1 AS pos, 'PICKUP' AS t WHERE s."collectionEnabled"
        UNION ALL
        SELECT 2, 'LOCAL_DELIVERY'
        WHERE EXISTS (
            SELECT 1 FROM "Order" o
            WHERE o."storeId" = s."storeId" AND o.fulfilment = 'DELIVERY'
        )
        UNION ALL
        SELECT 3, 'SHIPPING' WHERE s."shippingEnabled"
    ) offered
    ORDER BY pos
);
