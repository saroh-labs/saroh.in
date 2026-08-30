-- Search and social metadata for a Site (#188).
--
-- Site-level, not per-page: they describe the site rather than any one page.
-- All nullable — a site that has never set them renders them as absent, never
-- as an empty title or a broken image.
--
-- They are read into the Publication snapshot at publish time (the public
-- renderer reads only that), so changing one counts as an unpublished change.

ALTER TABLE "Site" ADD COLUMN "seoTitle"       TEXT;
ALTER TABLE "Site" ADD COLUMN "seoDescription" TEXT;
ALTER TABLE "Site" ADD COLUMN "socialImageUrl" TEXT;
