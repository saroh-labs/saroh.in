-- Who changed what in a draft (change units, website area U7): a stamp on
-- each section, carried by its key across saves, and a map on the site for
-- the parts of a draft with no row of their own. Additive only, no backfill:
-- changes made before this read as "Earlier changes".

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "lastEditedAt" TIMESTAMP(3),
ADD COLUMN     "lastEditedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "draftEditors" JSONB;
