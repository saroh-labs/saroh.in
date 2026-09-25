-- The financial year is April–March for every business, as GST sets it:
-- the start-month setting (20260930210000_financial_year_start) goes.
-- A business chooses how its invoice numbers are built instead; null keeps
-- the numbers it has today.

-- AlterTable
ALTER TABLE "BusinessProfile" DROP COLUMN "financialYearStartMonth",
ADD COLUMN     "invoiceNumberFormat" JSONB;
