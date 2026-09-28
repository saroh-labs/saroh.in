-- A customer's postal address on their contact (round 2, C8; R10): line 1,
-- line 2, city, state, PIN and country, edited on Customer Detail's sheet.
-- Additive and nullable, nothing backfilled: no contact has an address
-- today, and orders keep the delivery address they were placed with.

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "country" TEXT;
