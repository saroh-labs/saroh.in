-- Posts in the redesigned editor (U17a): search fields and the cover's
-- description, Publish post › Later, old links that forward, revisions for
-- History and Compare, and the words a reviewer's note is pinned to.
-- Additive only, no backfill: every column is nullable or has a default, so
-- the image still serving during the deploy reads none of it.
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "imageAlt" TEXT,
ADD COLUMN     "oldSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledByUserId" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shareImageUrl" TEXT;

-- AlterTable
ALTER TABLE "SiteComment" ADD COLUMN     "quote" TEXT;

-- CreateTable
CREATE TABLE "PostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "image" TEXT,
    "imageAlt" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "shareImageUrl" TEXT,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT,
    "authorId" TEXT,
    "savedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostRevision_postId_createdAt_idx" ON "PostRevision"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PostRevision_organizationId_idx" ON "PostRevision"("organizationId");

-- AddForeignKey
ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_savedByUserId_fkey" FOREIGN KEY ("savedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (#53).
ALTER TABLE "PostRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PostRevision"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
