-- Fulfilment types, release 1 of 3: the expand (B2a, DEC-045).
-- docs/architecture/ORDER_FULFILMENT_ROLLOUT.md is the ordered checklist.
--
-- Adds the six fulfilment types beside COLLECT and DELIVERY, and the two new
-- kitchen stages. No row changes: this release still writes only COLLECT,
-- DELIVERY and today's stages, so the image serving while this runs, and the
-- previous tag after a rollback, never meet a value their Prisma client
-- can't read.
--
-- The values only, in a file of their own: Postgres can't use an enum value
-- in the transaction that adds it, so anything that stores one (the
-- storefront backfill) is the next migration. ADD VALUE takes a brief
-- exclusive lock on the type's catalogue row and rewrites no table.

ALTER TYPE "OrderFulfilment" ADD VALUE IF NOT EXISTS 'PICKUP';
ALTER TYPE "OrderFulfilment" ADD VALUE IF NOT EXISTS 'LOCAL_DELIVERY';
ALTER TYPE "OrderFulfilment" ADD VALUE IF NOT EXISTS 'SHIPPING';
ALTER TYPE "OrderFulfilment" ADD VALUE IF NOT EXISTS 'DIGITAL';
ALTER TYPE "OrderFulfilment" ADD VALUE IF NOT EXISTS 'APPOINTMENT_IN_PERSON';
ALTER TYPE "OrderFulfilment" ADD VALUE IF NOT EXISTS 'APPOINTMENT_ONLINE';

ALTER TYPE "OrderStage" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStage" ADD VALUE IF NOT EXISTS 'SENT';
