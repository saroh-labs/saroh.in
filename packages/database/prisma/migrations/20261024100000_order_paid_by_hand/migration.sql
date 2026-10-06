-- What an order was paid outside Saroh is kept on the order (audit, 6 Oct
-- 2026): cash, UPI or a card machine at the counter, a payment marked by
-- hand, and a difference after an edit recorded as paid. Until now an order
-- paid at the counter had no amount behind it, so an edit asked for its
-- whole new total instead of the difference, and a difference could only be
-- settled online.
--
-- Additive (expand only): one column with a default the previous API image
-- never reads or writes. No backfill: 0 on an order paid by hand with no
-- online payment reads as its total, as it did (`orders/hand-payments.ts`),
-- and the first edit or payment after this writes the real amount.
--
-- Rollback: the previous image ignores the column.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidByHand" DECIMAL(12,2) NOT NULL DEFAULT 0;
