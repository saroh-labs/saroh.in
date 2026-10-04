-- Insights' hourly rollup chain (DEC-075): `analytics.rollup` queues an
-- `analytics.aggregate` for every business and day that received events
-- since its last run. Additive: an index for that question, and one
-- waiting run of the chain at a time, like the renewal chain (ADR-007).
-- The image still serving during the deploy reads neither.

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_analytics_rollup" ON "Job"("type") WHERE (type = 'analytics.rollup' AND status = 'PENDING');

-- CreateIndex
CREATE INDEX "AnalyticsEvent_receivedAt_idx" ON "AnalyticsEvent"("receivedAt");
