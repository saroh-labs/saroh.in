-- The trade a business typed when it picked Other (DEC-216, 12 Nov 2026).
--
-- Expand only: one nullable column, no rewrite, no backfill. The API keeps
-- it null unless trade is "other" and checks its length (2 to 60).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "tradeOther" TEXT;
