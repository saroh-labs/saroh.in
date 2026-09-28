-- C9 (#586, DEC-042): a merged contact is kept as a tombstone that points
-- at the survivor, so a late webhook, job or sign-in carrying its id lands
-- on the survivor. Additive: both columns are nullable and nothing is
-- backfilled (no contact has been merged before this).

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "Contact_organizationId_mergedIntoId_idx" ON "Contact"("organizationId", "mergedIntoId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_mergedIntoId_organizationId_fkey" FOREIGN KEY ("mergedIntoId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
