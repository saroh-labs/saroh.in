-- UX-043: "Ask for changes" says what needs changing. A short reason is
-- kept on the CHANGES_REQUESTED row; null on every other outcome and on
-- change requests made before this.

-- AlterTable
ALTER TABLE "SiteApproval" ADD COLUMN     "reason" TEXT;
