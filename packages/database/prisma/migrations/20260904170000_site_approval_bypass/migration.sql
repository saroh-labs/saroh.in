-- A bypass names the publication it was recorded for (#199).
ALTER TABLE "SiteApproval" ADD COLUMN "publicationId" TEXT;
ALTER TABLE "SiteApproval" ADD CONSTRAINT "SiteApproval_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SiteApproval_publicationId_idx" ON "SiteApproval"("publicationId");
