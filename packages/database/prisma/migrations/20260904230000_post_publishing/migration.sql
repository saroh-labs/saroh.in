-- Posts publish like pages do (#232, ADR-004 §3).
--
-- A post's publication is its own immutable row, path-scoped, with a live
-- pointer on the post that mirrors Site.currentPublicationId. Publishing one
-- post therefore never republishes the site's pages, and restoring an old site
-- publication never unpublishes this week's writing.

-- Where this site's posts live: /<postsPrefix>/<slug>, index at /<postsPrefix>.
-- Nullable, meaning "the default"; not defaulted in the column, so changing the
-- default later cannot silently move every site's posts.
ALTER TABLE "Site" ADD COLUMN "postsPrefix" TEXT;

-- Which post a publication is for. Null on a site publication.
ALTER TABLE "Publication" ADD COLUMN "postId" TEXT;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Publication_postId_idx" ON "Publication"("postId");

-- What the public is served for this post, or null when it is not live.
ALTER TABLE "Post" ADD COLUMN "currentPublicationId" TEXT;
CREATE UNIQUE INDEX "Post_currentPublicationId_key" ON "Post"("currentPublicationId");
ALTER TABLE "Post" ADD CONSTRAINT "Post_currentPublicationId_fkey"
    FOREIGN KEY ("currentPublicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
