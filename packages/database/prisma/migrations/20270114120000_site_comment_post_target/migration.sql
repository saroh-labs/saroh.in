-- A reviewer's note may be about a post instead of a page's section (DEC-200, U8).
-- Additive: two nullable columns, and sectionKey no longer required.

-- AlterTable
ALTER TABLE "SiteComment" ADD COLUMN     "postId" TEXT,
ADD COLUMN     "postTitle" TEXT,
ALTER COLUMN "sectionKey" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SiteComment_postId_idx" ON "SiteComment"("postId");

-- AddForeignKey
ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one target: a section, or a post. Keyed on the post's title
-- snapshot rather than "postId", because deleting the post nulls "postId"
-- (SET NULL) and the note must outlive it, as a page's note does (#277).
-- A post note has no page and no section.
ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_one_target_check" CHECK (
    ("sectionKey" IS NULL) <> ("postTitle" IS NULL)
    AND ("postId" IS NULL OR "postTitle" IS NOT NULL)
    AND ("postTitle" IS NULL OR ("pageId" IS NULL AND "pageTitle" IS NULL))
);
