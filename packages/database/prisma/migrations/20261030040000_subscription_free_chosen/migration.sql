-- The owner's own choice to end a paid plan at its period's end (DEC-100,
-- 2026-10-07): a term that ends with nothing renewed and one the owner
-- moved to Free both set "cancelAtPeriodEnd"; this tells them apart, so a
-- business that chose Free isn't asked to pay for the next term. Additive
-- only: one nullable column; the previous API ignores it.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "freeChosenAt" TIMESTAMP(3);
