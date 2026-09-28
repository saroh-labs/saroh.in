-- C15 (DEC-055): each storefront chooses how a customer who pays with an
-- email another store customer's contact already holds is linked. Additive:
-- one nullable column, nothing backfilled. Null is "leave it for staff",
-- which is what every existing storefront does today.

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "linkSameEmailSince" TIMESTAMP(3);
