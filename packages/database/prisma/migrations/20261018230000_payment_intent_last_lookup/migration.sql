-- Confirm a payment without its webhook (round-2 P1). A sweep asks the
-- provider about intents still open some minutes after they were made, so a
-- capture whose webhook never arrived is settled all the same. It stamps
-- when it last asked, and asks an intent again only after a pause that grows
-- with the intent's age.
--
-- Expand only: one nullable column and one index on a table that already
-- carries row-level security (20260719190006_payments), and a partial
-- unique index on Job for the new sweep's chain. The previous API never
-- writes or reads the column and never enqueues the sweep.

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "lastLookupAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "PaymentIntent"("status", "createdAt");

-- The sweep reschedules itself (payments.confirm-pending): one waiting run
-- at a time, as the hold release's chain (20260929100000_booking_hold).
CREATE UNIQUE INDEX "Job_one_pending_payments_confirm_pending" ON "Job"("type") WHERE (type = 'payments.confirm-pending' AND status = 'PENDING');
