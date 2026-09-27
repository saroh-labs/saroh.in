-- A booking made signed in on the business's site names the customer's
-- account (round 2, A9; ADR-011). Nullable and additive: every booking before
-- it, every booking staff make and every booking from the anonymous route
-- (which keeps serving for this release) has none. The previous API image
-- never reads or writes it.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "customerAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_customerAccountId_startAt_idx" ON "Booking"("customerAccountId", "startAt");

-- AddForeignKey
--
-- A single-column foreign key, so it runs on PostgreSQL 14: the column-list
-- form `ON DELETE SET NULL ("customerAccountId")` needs 15 or later, and a
-- plain SET NULL on a composite key would also null the required
-- "organizationId" (deleting a contact, which takes its account with it,
-- would then fail). Tenant safety does not rest on this key: RLS on both
-- tables, and the account is only ever the signed-in one of the site's own
-- business (bookings/reservation.ts).
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
