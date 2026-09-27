-- The courier and tracking number on an order (plan B, B2b; DEC-045),
-- typed by staff on the handover to a courier or added after it. Additive:
-- two nullable text columns, so the image still serving during the deploy
-- (which names neither) keeps reading and writing orders unchanged, and
-- rolling back is deploying the previous tag. No row is rewritten: a
-- nullable column with no default is a catalogue change only.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "trackingNumber" TEXT;
