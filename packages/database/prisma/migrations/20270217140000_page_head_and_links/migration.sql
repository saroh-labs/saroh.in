-- A page's own Google title, Google text, share image and "Show on Google"
-- (KTD-7), who last changed its settings, and old page links that forward
-- (KTD-3). Additive only, no backfill: every column is nullable or has a
-- default, so the image still serving during the deploy reads none of it.

-- CreateEnum
CREATE TYPE "SiteRedirectSource" AS ENUM ('AUTO', 'OWN');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "noindex" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "settingsEditedAt" TIMESTAMP(3),
ADD COLUMN     "settingsEditedByUserId" TEXT,
ADD COLUMN     "shareImageMediaId" TEXT,
ADD COLUMN     "shareImageUrl" TEXT;

-- CreateTable
CREATE TABLE "SiteRedirect" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "source" "SiteRedirectSource" NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "SiteRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteRedirect_organizationId_siteId_idx" ON "SiteRedirect"("organizationId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteRedirect_siteId_fromPath_live_key" ON "SiteRedirect"("siteId", "fromPath") WHERE ("removedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_shareImageMediaId_fkey" FOREIGN KEY ("shareImageMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRedirect" ADD CONSTRAINT "SiteRedirect_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRedirect" ADD CONSTRAINT "SiteRedirect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (#53).
ALTER TABLE "SiteRedirect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteRedirect" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteRedirect"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
