-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "postalCode" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sellerAddress" TEXT;

