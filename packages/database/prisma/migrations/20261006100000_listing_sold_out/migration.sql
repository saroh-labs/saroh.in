-- Sold out by hand (#515, amends DEC-032). An untracked product has no count,
-- so a storefront can mark it Sold out on its listing; it refuses new shop and
-- staff orders there until marked available again. Additive and forward-only.

-- AlterTable
ALTER TABLE "ProductListing" ADD COLUMN     "soldOutAt" TIMESTAMP(3),
ADD COLUMN     "soldOutByUserId" TEXT;
