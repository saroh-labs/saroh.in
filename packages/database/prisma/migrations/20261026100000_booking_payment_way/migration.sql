-- How people pay when they book (DEC-088, #821, #822): online, at the
-- desk, or both. Additive with a default of BOTH, which is what every
-- business had before, so a business that never sets it (with or without
-- a rules row) keeps today's booking page.

-- AlterTable
ALTER TABLE "BookingRules" ADD COLUMN     "bookingPayment" TEXT NOT NULL DEFAULT 'BOTH';

-- Only the three ways the API writes.
ALTER TABLE "BookingRules"
    ADD CONSTRAINT "BookingRules_bookingPayment_known"
    CHECK ("bookingPayment" IN ('ONLINE', 'DESK', 'BOTH'));
