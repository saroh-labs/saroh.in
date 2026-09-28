-- Fulfilment types, release 3 of 3: the contract (B2d, DEC-045).
-- docs/architecture/ORDER_FULFILMENT_ROLLOUT.md is the ordered checklist.
--
-- Drops the legacy words COLLECT and DELIVERY from "OrderFulfilment". Needs
-- release 2 (B2c) live first: the image serving while this runs, and the
-- tag a rollback lands on, write only the six types, so nothing it writes
-- is a value this removes.
--
-- One transaction, so it either all happens or nothing does:
--   1. Lock the three tables that hold the type, in the order the cast takes
--      them, so no order is written in a legacy word between the backfill
--      and the cast.
--   2. Re-run release 2's backfill for stragglers: an order the release-1
--      image wrote or edited while B2c deployed (or after a rollback to it).
--      The two arrays get the same treatment, although only the new names
--      were ever stored in them (B2a's backfill, B12, B17).
--   3. Refuse, loudly, if any legacy word survives.
--   4. Build the type without them, cast the three columns to it, swap the
--      names and drop the old type (what `prisma migrate diff` writes).
--
-- The cast rewrites "Order" (and its indexes) under ACCESS EXCLUSIVE: every
-- read and write of an order waits until it commits. "StoreSettings" and
-- "Product" are rewritten the same way. The rollout checklist records how
-- long it took on a production-sized copy. "updatedAt" is left alone: the
-- order didn't change, only the word for how it leaves.

BEGIN;

LOCK TABLE "Order", "StoreSettings", "Product" IN ACCESS EXCLUSIVE MODE;

-- 2 · The straggler backfill (release 2's UPDATE, again).
UPDATE "Order"
SET "fulfilment" = CASE "fulfilment"
        WHEN 'COLLECT' THEN 'PICKUP'::"OrderFulfilment"
        ELSE 'LOCAL_DELIVERY'::"OrderFulfilment"
    END
WHERE "fulfilment" IN ('COLLECT', 'DELIVERY');

-- Each array keeps its values once each, in the type's order (PICKUP,
-- LOCAL_DELIVERY, SHIPPING, DIGITAL): the table order readers expect.
UPDATE "StoreSettings"
SET "fulfilmentTypes" = ARRAY(
        SELECT DISTINCT CASE t
                WHEN 'COLLECT' THEN 'PICKUP'::"OrderFulfilment"
                WHEN 'DELIVERY' THEN 'LOCAL_DELIVERY'::"OrderFulfilment"
                ELSE t
            END AS v
        FROM unnest("fulfilmentTypes") AS t
        ORDER BY v
    )
WHERE "fulfilmentTypes" && ARRAY['COLLECT', 'DELIVERY']::"OrderFulfilment"[];

UPDATE "Product"
SET "fulfilmentTypes" = ARRAY(
        SELECT DISTINCT CASE t
                WHEN 'COLLECT' THEN 'PICKUP'::"OrderFulfilment"
                WHEN 'DELIVERY' THEN 'LOCAL_DELIVERY'::"OrderFulfilment"
                ELSE t
            END AS v
        FROM unnest("fulfilmentTypes") AS t
        ORDER BY v
    )
WHERE "fulfilmentTypes" && ARRAY['COLLECT', 'DELIVERY']::"OrderFulfilment"[];

-- 3 · Nothing may still hold a legacy word. The cast below would fail on one
-- too, but with a message that names neither the row nor what to do.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "fulfilment" IN ('COLLECT', 'DELIVERY'))
     OR EXISTS (SELECT 1 FROM "StoreSettings" WHERE "fulfilmentTypes" && ARRAY['COLLECT', 'DELIVERY']::"OrderFulfilment"[])
     OR EXISTS (SELECT 1 FROM "Product" WHERE "fulfilmentTypes" && ARRAY['COLLECT', 'DELIVERY']::"OrderFulfilment"[])
  THEN
    RAISE EXCEPTION 'An order, storefront or product still holds COLLECT or DELIVERY after the backfill. Nothing was changed. See ORDER_FULFILMENT_ROLLOUT.md, release 3.';
  END IF;
END
$guard$;

-- 4 · AlterEnum
CREATE TYPE "OrderFulfilment_new" AS ENUM ('PICKUP', 'LOCAL_DELIVERY', 'SHIPPING', 'DIGITAL', 'APPOINTMENT_IN_PERSON', 'APPOINTMENT_ONLINE');
ALTER TABLE "Product" ALTER COLUMN "fulfilmentTypes" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "fulfilment" DROP DEFAULT;
ALTER TABLE "StoreSettings" ALTER COLUMN "fulfilmentTypes" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "fulfilmentTypes" TYPE "OrderFulfilment_new"[] USING ("fulfilmentTypes"::text::"OrderFulfilment_new"[]);
ALTER TABLE "Order" ALTER COLUMN "fulfilment" TYPE "OrderFulfilment_new" USING ("fulfilment"::text::"OrderFulfilment_new");
ALTER TABLE "StoreSettings" ALTER COLUMN "fulfilmentTypes" TYPE "OrderFulfilment_new"[] USING ("fulfilmentTypes"::text::"OrderFulfilment_new"[]);
ALTER TYPE "OrderFulfilment" RENAME TO "OrderFulfilment_old";
ALTER TYPE "OrderFulfilment_new" RENAME TO "OrderFulfilment";
DROP TYPE "OrderFulfilment_old";
ALTER TABLE "Product" ALTER COLUMN "fulfilmentTypes" SET DEFAULT ARRAY[]::"OrderFulfilment"[];
ALTER TABLE "Order" ALTER COLUMN "fulfilment" SET DEFAULT 'PICKUP';
ALTER TABLE "StoreSettings" ALTER COLUMN "fulfilmentTypes" SET DEFAULT ARRAY[]::"OrderFulfilment"[];

COMMIT;
