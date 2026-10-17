-- Who Saroh bills, in full (17 Oct 2026): Saroh's invoice to a business
-- carries the buyer's email and, when there is one, its phone; a checkout
-- keeps an email or phone given there because the business had none.
-- Additive only: three nullable columns with no default, so nothing is
-- backfilled (invoices already written keep what they say). The previous
-- API image never reads or writes them. Row-level security on both tables
-- is unchanged.

-- AlterTable
ALTER TABLE "BillingCheckout" ADD COLUMN     "billToEmail" TEXT,
ADD COLUMN     "billToPhone" TEXT;

-- AlterTable
ALTER TABLE "SarohInvoice" ADD COLUMN     "billToPhone" TEXT;
