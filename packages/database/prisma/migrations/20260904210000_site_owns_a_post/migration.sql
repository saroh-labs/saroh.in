-- A Site owns a Post (ADR-004, #209).
--
-- Posts and their categories hung off a Store, so a business with a website and
-- no shop could not write at all. They move to the Site they are published on.
-- Additive first, then narrowing, so a row is never left without an owner.

-- 1. The new owner, nullable while we backfill.
ALTER TABLE "Post" ADD COLUMN "siteId" TEXT;
ALTER TABLE "PostCategory" ADD COLUMN "siteId" TEXT;

-- 2. Backfill: store → its organization → that organization's OLDEST site.
UPDATE "Post" p
SET "siteId" = (
    SELECT s.id FROM "Site" s
    JOIN "Store" st ON st."organizationId" = s."organizationId"
    WHERE st.id = p."storeId" AND s."deletedAt" IS NULL
    ORDER BY s."createdAt" ASC
    LIMIT 1
);
UPDATE "PostCategory" c
SET "siteId" = (
    SELECT s.id FROM "Site" s
    JOIN "Store" st ON st."organizationId" = s."organizationId"
    WHERE st.id = c."storeId" AND s."deletedAt" IS NULL
    ORDER BY s."createdAt" ASC
    LIMIT 1
);

-- 3. Stop rather than guess. A post whose organization has no site cannot be
--    given an owner; dropping it or leaving the column half-filled would both
--    be worse than making a human look. Create a site (or delete the posts) and
--    run again.
DO $$
DECLARE orphans INT;
BEGIN
    SELECT count(*) INTO orphans FROM "Post" WHERE "siteId" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION
            'ADR-004: % post(s) belong to an organization with no site. Create a site for those organizations, or delete the posts, then re-run this migration.', orphans;
    END IF;
    SELECT count(*) INTO orphans FROM "PostCategory" WHERE "siteId" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION
            'ADR-004: % post categor(y/ies) belong to an organization with no site. Create a site for those organizations, or delete them, then re-run this migration.', orphans;
    END IF;
END $$;

-- 4. Slugs were unique per store and are now unique per site: two stores in one
--    organization that each had "/hello" would collide. Say so rather than
--    silently dropping one.
DO $$
DECLARE dupes INT;
BEGIN
    SELECT count(*) INTO dupes FROM (
        SELECT "siteId", slug FROM "Post" GROUP BY "siteId", slug HAVING count(*) > 1
    ) d;
    IF dupes > 0 THEN
        RAISE EXCEPTION
            'ADR-004: % post slug(s) would collide on their new site. Rename the duplicates, then re-run this migration.', dupes;
    END IF;
    SELECT count(*) INTO dupes FROM (
        SELECT "siteId", slug FROM "PostCategory" GROUP BY "siteId", slug HAVING count(*) > 1
    ) d;
    IF dupes > 0 THEN
        RAISE EXCEPTION
            'ADR-004: % post category slug(s) would collide on their new site. Rename the duplicates, then re-run this migration.', dupes;
    END IF;
END $$;

-- 5. The author becomes the User who wrote it, not their StoreMembers row —
--    under site ownership that indirection buys nothing, and a store OWNER was
--    never a member, so owner-written posts had no author at all.
UPDATE "Post" p
SET "authorId" = (SELECT m."userId" FROM "StoreMembers" m WHERE m.id = p."authorId")
WHERE p."authorId" IS NOT NULL;

ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_authorId_fkey";
-- A user who is deleted leaves their writing behind, unattributed.
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Narrow: the new owner is required, the old one is gone.
ALTER TABLE "Post" ALTER COLUMN "siteId" SET NOT NULL;
ALTER TABLE "PostCategory" ALTER COLUMN "siteId" SET NOT NULL;

DROP INDEX IF EXISTS "Post_storeId_slug_key";
DROP INDEX IF EXISTS "Post_storeId_idx";
DROP INDEX IF EXISTS "PostCategory_storeId_slug_key";
DROP INDEX IF EXISTS "PostCategory_storeId_idx";

-- The org-isolation policies read `storeId`, so they must come down before the
-- column does and go back up reading the new owner. Posts are isolated through
-- their Site, exactly as Page is.
DROP POLICY IF EXISTS "org_isolation" ON "Post";
DROP POLICY IF EXISTS "org_isolation" ON "PostCategory";
-- Comment's policy reaches an organization THROUGH Post.storeId, so it depends
-- on the column too and has to come down with the others.
DROP POLICY IF EXISTS "org_isolation" ON "Comment";

ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_storeId_fkey";
ALTER TABLE "PostCategory" DROP CONSTRAINT IF EXISTS "PostCategory_storeId_fkey";
ALTER TABLE "Post" DROP COLUMN "storeId";
ALTER TABLE "PostCategory" DROP COLUMN "storeId";

ALTER TABLE "Post" ADD CONSTRAINT "Post_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostCategory" ADD CONSTRAINT "PostCategory_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Post_siteId_slug_key" ON "Post"("siteId", slug);
CREATE INDEX "Post_siteId_idx" ON "Post"("siteId");
CREATE UNIQUE INDEX "PostCategory_siteId_slug_key" ON "PostCategory"("siteId", slug);
CREATE INDEX "PostCategory_siteId_idx" ON "PostCategory"("siteId");

-- Isolation restored against the Site's organization.
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Post" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Post"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Site" s
                    WHERE s.id = "Post"."siteId"
                      AND s."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Site" s
                    WHERE s.id = "Post"."siteId"
                      AND s."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "PostCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PostCategory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Site" s
                    WHERE s.id = "PostCategory"."siteId"
                      AND s."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Site" s
                    WHERE s.id = "PostCategory"."siteId"
                      AND s."organizationId" = current_setting('app.current_organization_id', true)));

-- A comment is isolated through its post's site, the same hop it always made,
-- one link further along.
ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Comment"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Post" po
                    JOIN "Site" s ON s.id = po."siteId"
                    WHERE po.id = "Comment"."postId"
                      AND s."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Post" po
                    JOIN "Site" s ON s.id = po."siteId"
                    WHERE po.id = "Comment"."postId"
                      AND s."organizationId" = current_setting('app.current_organization_id', true)));
