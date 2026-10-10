-- A site's icon (DEC-121): a library object, and the address it is served
-- from, as the business logo is kept. Two nullable columns on a table that
-- already has its org_isolation policy, so no policy changes here.

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "iconMediaId" TEXT,
ADD COLUMN     "iconUrl" TEXT;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_iconMediaId_fkey" FOREIGN KEY ("iconMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
