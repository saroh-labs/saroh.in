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
-- Composite with the organization, so a booking can only name an account of
-- its own business. SET NULL on the account column ONLY (PostgreSQL 15+):
-- a plain SET NULL would also null "organizationId", which is required, and
-- deleting a contact (which takes its account with it) would fail. Prisma
-- reads either form as SetNull, so the datamodel and this agree.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerAccountId_organizationId_fkey" FOREIGN KEY ("customerAccountId", "organizationId") REFERENCES "CustomerAccount"("id", "organizationId") ON DELETE SET NULL ("customerAccountId") ON UPDATE CASCADE;
