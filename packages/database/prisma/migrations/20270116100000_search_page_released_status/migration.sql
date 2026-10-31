-- Publish, then deploy (R13, owner 31 Oct): `status` becomes what staff
-- staged, and `releasedStatus` what the last Deploy changes sent to the
-- site. Every existing page starts released as it is now, so the public
-- list the site builds from is the same before and after.

-- AlterTable
ALTER TABLE "SearchPage" ADD COLUMN     "deployedAt" TIMESTAMP(3),
ADD COLUMN     "deployedByUserId" TEXT,
ADD COLUMN     "releasedStatus" "SearchPageStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill
UPDATE "SearchPage" SET "releasedStatus" = "status";
