-- The links a business makes in Saroh to share its site (DEC-181, #1099).
-- Only these labels are counted as a visit's label on Insights; any other
-- `ref` counts under its group with no label. One new table, additive only,
-- no backfill: the image still serving during the deploy reads none of it.

-- CreateTable
CREATE TABLE "SiteLink" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SiteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteLink_organizationId_siteId_idx" ON "SiteLink"("organizationId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteLink_siteId_label_live_key" ON "SiteLink"("siteId", "label") WHERE ("archivedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "SiteLink" ADD CONSTRAINT "SiteLink_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLink" ADD CONSTRAINT "SiteLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The label's shape, held in the database too (`analytics/visit-source.ts`
-- checks the rest: no record id, no more than six digits): lower-case
-- letters, digits and hyphens, 1 to 32 long, a letter or digit at each end.
-- A name is what the team reads, 1 to 80 characters.
ALTER TABLE "SiteLink" ADD CONSTRAINT "SiteLink_label_check"
  CHECK ("label" ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$' AND "label" !~ '[0-9]{6,}');
ALTER TABLE "SiteLink" ADD CONSTRAINT "SiteLink_name_check"
  CHECK (char_length("name") BETWEEN 1 AND 80);

-- Row-level security (#53).
ALTER TABLE "SiteLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SiteLink"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
