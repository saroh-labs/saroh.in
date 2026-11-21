-- Limits and load (21 Nov 2026 review, 04 W3 and W6). Indexes only.
-- The newest approval verdict per change unit, read for the units at hand.
-- CreateIndex
CREATE INDEX "SiteChangeApproval_organizationId_siteId_unitKey_createdAt_idx" ON "SiteChangeApproval"("organizationId", "siteId", "unitKey", "createdAt");

-- When each kind first counted by page, for a page's results.
-- CreateIndex
CREATE INDEX "AnalyticsDailyAggregate_organizationId_siteId_type_dimensio_idx" ON "AnalyticsDailyAggregate"("organizationId", "siteId", "type", "dimension", "date");
