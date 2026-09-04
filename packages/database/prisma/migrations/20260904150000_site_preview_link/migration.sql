-- A link that shows a site's draft to whoever holds it (#198).
CREATE TABLE "SitePreviewLink" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePreviewLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SitePreviewLink_token_key" ON "SitePreviewLink"("token");
CREATE INDEX "SitePreviewLink_siteId_revokedAt_idx" ON "SitePreviewLink"("siteId", "revokedAt");
CREATE INDEX "SitePreviewLink_organizationId_idx" ON "SitePreviewLink"("organizationId");

ALTER TABLE "SitePreviewLink" ADD CONSTRAINT "SitePreviewLink_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SitePreviewLink" ADD CONSTRAINT "SitePreviewLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SitePreviewLink" ADD CONSTRAINT "SitePreviewLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
