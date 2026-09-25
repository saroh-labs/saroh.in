-- The month a business's financial year starts (4: April, which every
-- existing business keeps).

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "financialYearStartMonth" INTEGER NOT NULL DEFAULT 4;
