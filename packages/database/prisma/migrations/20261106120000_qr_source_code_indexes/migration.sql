-- The QR list counts the bookings and orders each code brought in, by
-- `sourceCode` (a `QrCode.id`). Almost every booking and order has none, so
-- each index holds only the rows that name a code.
--
-- Additive only: two indexes, no column, no backfill, row-level security
-- untouched. The image still serving during the deploy reads neither.

-- CreateIndex
CREATE INDEX "Booking_sourceCode_idx" ON "Booking"("sourceCode") WHERE ("sourceCode" IS NOT NULL);

-- CreateIndex
CREATE INDEX "Order_sourceCode_idx" ON "Order"("sourceCode") WHERE ("sourceCode" IS NOT NULL);
