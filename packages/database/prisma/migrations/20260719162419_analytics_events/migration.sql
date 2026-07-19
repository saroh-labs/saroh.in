-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "properties" JSONB NOT NULL,
    "consent" TEXT NOT NULL DEFAULT 'anonymous',
    "visitorHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyAggregate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT '',
    "dimensionValue" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "uniqueCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDailyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_organizationId_type_occurredAt_idx" ON "AnalyticsEvent"("organizationId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_organizationId_siteId_occurredAt_idx" ON "AnalyticsEvent"("organizationId", "siteId", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_expiresAt_idx" ON "AnalyticsEvent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_organizationId_dedupeKey_key" ON "AnalyticsEvent"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AnalyticsDailyAggregate_organizationId_type_date_idx" ON "AnalyticsDailyAggregate"("organizationId", "type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyAggregate_organizationId_siteId_date_type_dim_key" ON "AnalyticsDailyAggregate"("organizationId", "siteId", "date", "type", "dimension", "dimensionValue");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDailyAggregate" ADD CONSTRAINT "AnalyticsDailyAggregate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

