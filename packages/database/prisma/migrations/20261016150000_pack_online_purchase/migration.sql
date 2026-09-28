-- Buy a class pack online (round-2 A11, R12). A signed-in customer's
-- purchase starts as a DRAFT invoice (source PACK, no number) carrying the
-- pack and its terms as shown when they started paying. The payment's
-- webhook numbers it and makes the PackPurchase from those terms; a draft
-- nobody paid is voided after 24 hours, so it never takes a number
-- (DEC-023).
--
-- Additive: one nullable column the previous API image never reads, and a
-- partial index for the sweep. No new table, so no RLS change: Invoice
-- keeps its policy.
--
-- Rollback: the previous image leaves PACK drafts alone. A payment for one
-- would reach its invoice-success path as an unknown draft and be recorded
-- as needing a refund, so roll back only after checking
-- `SELECT count(*) FROM "Invoice" WHERE status = 'DRAFT' AND source = 'PACK'`
-- is 0 (or wait out the 24 hours).

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "packTerms" JSONB;

-- CreateIndex
CREATE INDEX "Invoice_open_pack_drafts_idx" ON "Invoice"("createdAt") WHERE (status = 'DRAFT' AND source = 'PACK');
