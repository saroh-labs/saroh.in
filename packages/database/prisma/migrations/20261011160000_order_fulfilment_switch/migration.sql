-- Fulfilment types, release 2 of 3: the switch (B2c, DEC-045).
-- docs/architecture/ORDER_FULFILMENT_ROLLOUT.md is the ordered checklist.
--
-- Every order takes its type's own name: COLLECT becomes PICKUP and
-- DELIVERY becomes LOCAL_DELIVERY. Nothing changes meaning, and the stage is
-- left alone: a former delivery already HANDED_TO_COURIER stays there and
-- moves on to DELIVERED by the legacy move (orders/fulfilment.ts).
--
-- Needs release 1 (B2a) live first: the image serving while this runs, and
-- the tag a rollback lands on, read PICKUP and LOCAL_DELIVERY. That image
-- may still write COLLECT or DELIVERY until the new one serves; release 3
-- (B2d) re-runs this backfill for them before it drops the old values.
--
-- One UPDATE: a row lock on every order still holding a legacy word (a new
-- tuple each; no table lock, and no index on the column), so an order edit
-- or kitchen move on the same row waits for the commit. The default change
-- is a catalogue change under a brief ACCESS EXCLUSIVE lock on "Order", with
-- no rewrite. "updatedAt" is left as it was: the order didn't change, only
-- the word for how it leaves.

UPDATE "Order"
SET "fulfilment" = CASE "fulfilment"
        WHEN 'COLLECT' THEN 'PICKUP'::"OrderFulfilment"
        ELSE 'LOCAL_DELIVERY'::"OrderFulfilment"
    END
WHERE "fulfilment" IN ('COLLECT', 'DELIVERY');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "fulfilment" SET DEFAULT 'PICKUP';
