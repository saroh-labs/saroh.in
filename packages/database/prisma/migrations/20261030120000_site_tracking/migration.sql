-- DEC-108 (#892): a site's verification codes and the merchant's own trackers.
--
-- Three new tables, additive only, no backfill. Only public ids are stored:
-- the API refuses anything else (`@saroh/block-contract`, site-tracking.ts),
-- and the CHECKs below hold the same line in the database: a fixed list of
-- services and tools, and ids made only of letters, digits, '-' and '_'.

-- CreateTable
CREATE TABLE "SiteVerification" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteTracker" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "region" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteTrackingSettings" (
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "privacyUrl" TEXT,
    "switchedOffAt" TIMESTAMP(3),
    "switchedOffByStaffId" TEXT,
    "switchedOffReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteTrackingSettings_pkey" PRIMARY KEY ("siteId")
);

-- CreateIndex
CREATE INDEX "SiteVerification_organizationId_idx" ON "SiteVerification"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVerification_siteId_service_key" ON "SiteVerification"("siteId", "service");

-- CreateIndex
CREATE INDEX "SiteTracker_organizationId_idx" ON "SiteTracker"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTracker_siteId_kind_key" ON "SiteTracker"("siteId", "kind");

-- CreateIndex
CREATE INDEX "SiteTrackingSettings_organizationId_idx" ON "SiteTrackingSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTrackingSettings_siteId_organizationId_key" ON "SiteTrackingSettings"("siteId", "organizationId");

-- AddForeignKey
ALTER TABLE "SiteVerification" ADD CONSTRAINT "SiteVerification_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVerification" ADD CONSTRAINT "SiteVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTracker" ADD CONSTRAINT "SiteTracker_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTracker" ADD CONSTRAINT "SiteTracker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTrackingSettings" ADD CONSTRAINT "SiteTrackingSettings_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTrackingSettings" ADD CONSTRAINT "SiteTrackingSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only the services and tools Saroh writes a loader for; only id-shaped
-- values (no markup, no quotes, no URLs), so nothing stored can run.
ALTER TABLE "SiteVerification" ADD CONSTRAINT "SiteVerification_service_check"
  CHECK ("service" IN ('google', 'bing', 'meta', 'pinterest'));
ALTER TABLE "SiteVerification" ADD CONSTRAINT "SiteVerification_code_check"
  CHECK ("code" ~ '^[A-Za-z0-9_-]{1,100}$');
ALTER TABLE "SiteTracker" ADD CONSTRAINT "SiteTracker_kind_check"
  CHECK ("kind" IN ('ga4', 'google-ads', 'meta-pixel', 'posthog', 'clarity', 'plausible', 'umami'));
ALTER TABLE "SiteTracker" ADD CONSTRAINT "SiteTracker_trackerId_check"
  CHECK ("trackerId" ~ '^[A-Za-z0-9_-]{1,100}$');
ALTER TABLE "SiteTracker" ADD CONSTRAINT "SiteTracker_region_check"
  CHECK ("region" IS NULL OR "region" IN ('us', 'eu'));

-- Row-level security (#53).
ALTER TABLE "SiteVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteVerification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteVerification"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SiteTracker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteTracker" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteTracker"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SiteTrackingSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteTrackingSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteTrackingSettings"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
