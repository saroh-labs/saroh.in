-- An order placed signed in on the business's site names the customer's
-- account (round 2, A7; ADR-011), as a booking does (A9). The account's
-- Orders tab reads it beside the contact's identity links, and "This isn't
-- them" moves what the account made. Nullable and additive: every order
-- before it and every order staff take has none. The previous API image
-- never reads or writes it.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Order_customerAccountId_createdAt_idx" ON "Order"("customerAccountId", "createdAt");

-- AddForeignKey
--
-- A single-column foreign key, as Booking's (20261011140000): the
-- column-list SET NULL needs PostgreSQL 15, and "Order"."organizationId" is
-- nullable anyway. Tenant safety rests on RLS and on the account only ever
-- being the signed-in one of the site's own business.
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
