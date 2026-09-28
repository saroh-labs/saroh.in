-- The business's refund policy for a booking cancelled in time (round 2,
-- E30; DEC-058): refund what the customer paid online automatically, or
-- don't. Additive with a default of true, which is what E8 shipped, so a
-- business that never sets it (with or without a rules row) keeps today's
-- behaviour.

-- AlterTable
ALTER TABLE "BookingRules" ADD COLUMN     "refundInTimeCancels" BOOLEAN NOT NULL DEFAULT true;
