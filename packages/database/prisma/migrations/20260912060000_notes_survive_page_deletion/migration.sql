-- A note outlives the page it was left on (#277).
--
-- `SiteComment.pageId` cascaded from Page, so deleting a page deleted every
-- note anyone had left on it. The Review tab has always carried a group headed
-- "On a page that no longer exists" and it could never render: the rows were
-- already gone. A note is a record of what a person said about the work, and
-- deleting a page is not a decision to erase that.
ALTER TABLE "SiteComment" DROP CONSTRAINT "SiteComment_pageId_fkey";
ALTER TABLE "SiteComment" ALTER COLUMN "pageId" DROP NOT NULL;
ALTER TABLE "SiteComment"
    ADD CONSTRAINT "SiteComment_pageId_fkey" FOREIGN KEY ("pageId")
        REFERENCES "Page" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Where the note was, once the page itself is gone. Written when the note is
-- created; the live page title wins while the page exists, so this is only ever
-- read for an orphan. Null for notes written before this column existed — they
-- read as "a page that no longer exists" with no name, which is what we know.
ALTER TABLE "SiteComment" ADD COLUMN "pageTitle" TEXT;
