-- Who referred a business (DEC-156): the business whose referral code its
-- owner arrived with, and when that was recorded. Written once, as the
-- business is made. A waitlist entry keeps the same fact until its owner
-- signs up. Additive only: three nullable columns with no default, an
-- index and a foreign key on rows that are all null, so nothing is
-- backfilled. The previous API image never reads or writes them.
-- Row-level security on both tables is unchanged.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "referredAt" TIMESTAMP(3),
ADD COLUMN     "referredByOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "WaitlistSignup" ADD COLUMN     "referredByOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "Organization_referredByOrganizationId_idx" ON "Organization"("referredByOrganizationId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_referredByOrganizationId_fkey" FOREIGN KEY ("referredByOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A business never refers itself. Prisma cannot declare a CHECK, so it
-- lives here only.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_not_self_referred"
    CHECK ("referredByOrganizationId" IS NULL OR "referredByOrganizationId" <> "id");
