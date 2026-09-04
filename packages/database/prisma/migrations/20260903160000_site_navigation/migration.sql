-- The site menu (#206). Site-level, page IDs, resolved at publish.
ALTER TABLE "Site" ADD COLUMN "navigation" JSONB;
