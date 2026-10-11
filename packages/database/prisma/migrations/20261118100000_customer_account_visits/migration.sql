-- When a customer last opened their account's Home on a business's site,
-- and the visit before it (DEC-142): Home says what changed since the
-- earlier one. Two nullable columns on "CustomerAccount", additive: every
-- account before them has visited "never", and the previous image never
-- reads them. "CustomerAccount" keeps its policies (they read the row's
-- organization, not these columns).

-- AlterTable
ALTER TABLE "CustomerAccount" ADD COLUMN     "lastVisitAt" TIMESTAMP(3),
ADD COLUMN     "previousVisitAt" TIMESTAMP(3);
