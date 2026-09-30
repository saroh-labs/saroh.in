-- T1 (DEC-071): test releases.
--
-- A test release is a named, non-live candidate of a site. Its frozen
-- snapshot is an ordinary Publication with kind = 'TEST' (publications stay
-- append-only); its mutable state lives in "SiteTestRelease", and the links
-- that open it on its test host in "SiteTestReleaseLink". "Site" gains the
-- "Publishing needs approval" setting, and a review or a note can name a
-- release.
--
-- Additive only, with no backfill: every existing publication is LIVE by the
-- column's default, so the API before T1 keeps working while it serves. It
-- never writes a TEST row, and none exists until the new API makes one.

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "publishNeedsApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SiteComment" ADD COLUMN     "testReleaseId" TEXT;

-- AlterTable
ALTER TABLE "SiteApproval" ADD COLUMN     "testReleaseId" TEXT;

-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'LIVE',
ADD COLUMN     "sourcePublicationId" TEXT;

-- CreateTable
CREATE TABLE "SiteTestRelease" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discardedAt" TIMESTAMP(3),
    "wentLiveAt" TIMESTAMP(3),
    "livePublicationId" TEXT,
    "goLiveAt" TIMESTAMP(3),
    "goLiveZone" TEXT,
    "scheduledByUserId" TEXT,
    "scheduledOverPublicationId" TEXT,
    "scheduleOverride" BOOLEAN NOT NULL DEFAULT false,
    "goLiveJobId" TEXT,
    "lastGoLiveOutcome" TEXT,
    "lastGoLiveReason" TEXT,

    CONSTRAINT "SiteTestRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteTestReleaseLink" (
    "id" TEXT NOT NULL,
    "testReleaseId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteTestReleaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteTestRelease_publicationId_key" ON "SiteTestRelease"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTestRelease_livePublicationId_key" ON "SiteTestRelease"("livePublicationId");

-- CreateIndex
CREATE INDEX "SiteTestRelease_organizationId_idx" ON "SiteTestRelease"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTestRelease_siteId_number_key" ON "SiteTestRelease"("siteId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTestRelease_id_organizationId_key" ON "SiteTestRelease"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTestRelease_one_schedule_per_site" ON "SiteTestRelease"("siteId") WHERE ("goLiveAt" IS NOT NULL AND "wentLiveAt" IS NULL AND "discardedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "SiteTestReleaseLink_tokenHash_key" ON "SiteTestReleaseLink"("tokenHash");

-- CreateIndex
CREATE INDEX "SiteTestReleaseLink_testReleaseId_revokedAt_idx" ON "SiteTestReleaseLink"("testReleaseId", "revokedAt");

-- CreateIndex
CREATE INDEX "SiteTestReleaseLink_siteId_idx" ON "SiteTestReleaseLink"("siteId");

-- CreateIndex
CREATE INDEX "SiteTestReleaseLink_organizationId_idx" ON "SiteTestReleaseLink"("organizationId");

-- CreateIndex
CREATE INDEX "SiteComment_testReleaseId_idx" ON "SiteComment"("testReleaseId");

-- CreateIndex
CREATE INDEX "SiteApproval_testReleaseId_idx" ON "SiteApproval"("testReleaseId");

-- CreateIndex
CREATE INDEX "Publication_siteId_kind_publishedAt_idx" ON "Publication"("siteId", "kind", "publishedAt");

-- CreateIndex
CREATE INDEX "Publication_sourcePublicationId_idx" ON "Publication"("sourcePublicationId");

-- AddForeignKey
ALTER TABLE "SiteComment" ADD CONSTRAINT "SiteComment_testReleaseId_fkey" FOREIGN KEY ("testReleaseId") REFERENCES "SiteTestRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteApproval" ADD CONSTRAINT "SiteApproval_testReleaseId_fkey" FOREIGN KEY ("testReleaseId") REFERENCES "SiteTestRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_sourcePublicationId_fkey" FOREIGN KEY ("sourcePublicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestRelease" ADD CONSTRAINT "SiteTestRelease_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestRelease" ADD CONSTRAINT "SiteTestRelease_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestRelease" ADD CONSTRAINT "SiteTestRelease_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestRelease" ADD CONSTRAINT "SiteTestRelease_livePublicationId_fkey" FOREIGN KEY ("livePublicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestReleaseLink" ADD CONSTRAINT "SiteTestReleaseLink_testReleaseId_organizationId_fkey" FOREIGN KEY ("testReleaseId", "organizationId") REFERENCES "SiteTestRelease"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestReleaseLink" ADD CONSTRAINT "SiteTestReleaseLink_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteTestReleaseLink" ADD CONSTRAINT "SiteTestReleaseLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The closed sets Prisma cannot express.
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_kind_check"
    CHECK ("kind" IN ('LIVE', 'TEST'));
ALTER TABLE "SiteTestReleaseLink" ADD CONSTRAINT "SiteTestReleaseLink_purpose_check"
    CHECK ("purpose" IN ('SHARE', 'OPEN'));
ALTER TABLE "SiteTestRelease" ADD CONSTRAINT "SiteTestRelease_lastGoLiveOutcome_check"
    CHECK ("lastGoLiveOutcome" IS NULL OR "lastGoLiveOutcome" IN ('LIVE', 'NOT_LIVE'));

-- Row-level security (defence in depth, as every business-owned table).
ALTER TABLE "SiteTestRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteTestRelease" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteTestRelease"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SiteTestReleaseLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteTestReleaseLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteTestReleaseLink"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

-- Report, never change, the addresses a test host could not carry (KTD-12,
-- Q8). A test host is `test--<address>`, one DNS label of at most 63
-- characters, so an address holding `--` could be mistaken for one, and an
-- address over 57 characters has no room for the prefix. The address rules
-- themselves belong to DEC-069; any address that starts with `test--` is
-- renamed by hand with its owner.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT 'Organization.slug' AS field, "id", "slug" AS address
          FROM "Organization"
         WHERE "slug" LIKE '%--%' OR length("slug") > 57
        UNION ALL
        SELECT 'Site.subdomain', "id", "subdomain"
          FROM "Site"
         WHERE "subdomain" IS NOT NULL
           AND ("subdomain" LIKE '%--%' OR length("subdomain") > 57)
    LOOP
        RAISE NOTICE 'test releases: % "%" (id %) %', r.field, r.address, r.id,
            CASE
                WHEN lower(r.address) LIKE 'test--%' THEN 'starts with test--: rename it by hand with the owner'
                WHEN r.address LIKE '%--%' THEN 'contains --'
                ELSE 'is longer than 57 characters: no saroh.app test host'
            END;
    END LOOP;
END
$$;
