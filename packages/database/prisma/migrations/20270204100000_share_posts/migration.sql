-- A business's own posts for Create post (#1378, plan 2026-11-12-003 U6).
--
-- One new table, additive only, no backfill. The image still serving
-- during the deploy reads none of it.

-- CreateTable
CREATE TABLE "SharePost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "headline" TEXT,
    "mediaId" TEXT,
    "style" TEXT NOT NULL DEFAULT 'photo',
    "size" TEXT NOT NULL DEFAULT 'post',
    "caption" TEXT NOT NULL DEFAULT '',
    "linkPath" TEXT NOT NULL DEFAULT '/',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharePost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharePost_organizationId_createdAt_idx" ON "SharePost"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- What the API writes (`share-posts/dto.ts`), held in the database too:
-- the renderer's styles and sizes, the merchant's words within their caps,
-- and a link that is a path on the business's own site, never a host.
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_style_check"
  CHECK ("style" IN ('photo', 'price', 'offer', 'simple'));
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_size_check"
  CHECK ("size" IN ('post', 'square', 'story'));
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_headline_check"
  CHECK ("headline" IS NULL OR char_length("headline") <= 90);
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_caption_check"
  CHECK (char_length("caption") <= 2200);
ALTER TABLE "SharePost" ADD CONSTRAINT "SharePost_linkPath_check"
  CHECK ("linkPath" ~ '^/' AND "linkPath" !~ '^//' AND char_length("linkPath") <= 512);

-- Row-level security (#53).
ALTER TABLE "SharePost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SharePost" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SharePost"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
