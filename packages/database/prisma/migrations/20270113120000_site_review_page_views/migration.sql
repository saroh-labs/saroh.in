-- Which pages a reviewer has opened, for "You've read 3 of 4 pages" (DEC-200, U9).
-- CreateTable
CREATE TABLE "SiteReviewPageView" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteReviewPageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteReviewPageView_pageId_idx" ON "SiteReviewPageView"("pageId");

-- CreateIndex
CREATE INDEX "SiteReviewPageView_userId_idx" ON "SiteReviewPageView"("userId");

-- CreateIndex
CREATE INDEX "SiteReviewPageView_organizationId_idx" ON "SiteReviewPageView"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteReviewPageView_siteId_userId_pageId_key" ON "SiteReviewPageView"("siteId", "userId", "pageId");

-- AddForeignKey
ALTER TABLE "SiteReviewPageView" ADD CONSTRAINT "SiteReviewPageView_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReviewPageView" ADD CONSTRAINT "SiteReviewPageView_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReviewPageView" ADD CONSTRAINT "SiteReviewPageView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReviewPageView" ADD CONSTRAINT "SiteReviewPageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "SiteReviewPageView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteReviewPageView" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SiteReviewPageView";
CREATE POLICY "org_isolation" ON "SiteReviewPageView"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
