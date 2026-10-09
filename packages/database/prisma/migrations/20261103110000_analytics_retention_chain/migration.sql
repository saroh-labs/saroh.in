-- The daily analytics retention sweep (#799): `analytics.retention` deletes
-- `AnalyticsEvent` rows past their `expiresAt` and never an aggregate.
-- Additive: one waiting run of the chain at a time, like the renewal chain
-- (ADR-007). The image still serving during the deploy reads nothing new.

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_analytics_retention" ON "Job"("type") WHERE (type = 'analytics.retention' AND status = 'PENDING');
