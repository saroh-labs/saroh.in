-- Where a customer set up autopay (round-2 D12): the pay link, the site's
-- Prices page or their account, and the site account that did, so the
-- subscription's log can say who and from where. Additive only: two
-- nullable columns on a table that already carries row-level security
-- (20261016110000_payment_mandates). The previous API never reads them.

-- AlterTable
ALTER TABLE "PaymentMandate" ADD COLUMN     "setupAccountId" TEXT,
ADD COLUMN     "setupSource" TEXT;
