-- Review: notes pinned to sections, and one approval (#193).
--
-- Scope is deliberately small: notes and one approval. No assignment, no
-- states, no rounds.
--
-- `sectionKey` is NOT a foreign key to Section. Section rows are deleted and
-- recreated on every draft save, so a foreign key would either block the save
-- or cascade the note away with the row it happened to be attached to. The key
-- is carried across saves by the editor instead, and a note whose section has
-- genuinely been deleted stays in the table and is surfaced as orphaned.
CREATE TABLE "SiteComment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteComment_siteId_resolvedAt_idx" ON "SiteComment"("siteId", "resolvedAt");
CREATE INDEX "SiteComment_pageId_sectionKey_idx" ON "SiteComment"("pageId", "sectionKey");
CREATE INDEX "SiteComment_organizationId_idx" ON "SiteComment"("organizationId");

ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One approval per act, appended never updated, so "approved, then changes
-- requested, then approved again" reads as history rather than a flipped flag.
CREATE TABLE "SiteApproval" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteApproval_siteId_createdAt_idx" ON "SiteApproval"("siteId", "createdAt");
CREATE INDEX "SiteApproval_organizationId_idx" ON "SiteApproval"("organizationId");

ALTER TABLE "SiteApproval" ADD CONSTRAINT "SiteApproval_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteApproval" ADD CONSTRAINT "SiteApproval_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteApproval" ADD CONSTRAINT "SiteApproval_byUserId_fkey"
    FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
