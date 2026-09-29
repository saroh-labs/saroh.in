-- Join a plan online from the site's Prices page (round-2 G20). A signed-in
-- customer's join starts as a DRAFT invoice (source SUBSCRIPTION, no number)
-- carrying the plan and its terms as shown when they started paying. The
-- payment's webhook numbers it and starts the subscription from those
-- terms; a draft nobody paid is voided after 24 hours, so it never takes a
-- number (DEC-023) and nobody is put on a plan they didn't pay for. This is
-- A11's rule for an online pack, followed for a plan.
--
-- Additive: one nullable column the previous API image never reads, and a
-- partial index for the sweep. No new table, so no RLS change: Invoice
-- keeps its policy. A staff-issued SUBSCRIPTION invoice is always issued
-- with a number, so the index holds only online joins.
--
-- Rollback: the previous image leaves SUBSCRIPTION drafts alone. A payment
-- for one would reach its invoice-success path as an unknown draft and be
-- recorded as needing a refund, so roll back only after checking
-- `SELECT count(*) FROM "Invoice" WHERE status = 'DRAFT' AND source = 'SUBSCRIPTION'`
-- is 0 (or wait out the 24 hours).

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "planTerms" JSONB;

-- CreateIndex
CREATE INDEX "Invoice_open_plan_joins_idx" ON "Invoice"("createdAt") WHERE (status = 'DRAFT' AND source = 'SUBSCRIPTION');
