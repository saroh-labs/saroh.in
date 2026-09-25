-- The booking page's pay-now hold (U19, ADR-008).
-- A PENDING booking holds its place until "holdExpiresAt"; the sweep job
-- (booking.release-holds) cancels holds whose time ran out. Existing bookings
-- are untouched: the column is null on every one of them. No new table, so no
-- new row-level-security policy.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_booking_release_holds" ON "Job"("type") WHERE (type = 'booking.release-holds' AND status = 'PENDING');

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");
