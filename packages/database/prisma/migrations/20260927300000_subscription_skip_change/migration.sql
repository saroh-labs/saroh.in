-- Subscriptions: a collection schedule, skipping one collection, and a plan
-- change booked for the next renewal (plan 2026-09-23-003, U7).

-- AlterTable
ALTER TABLE "CustomerSubscription" ADD COLUMN     "collectionNote" TEXT,
ADD COLUMN     "collectionWeekday" INTEGER,
ADD COLUMN     "pendingPlanId" TEXT;

-- CreateTable
CREATE TABLE "SubscriptionSkip" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionSkip_organizationId_idx" ON "SubscriptionSkip"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionSkip_subscriptionId_date_key" ON "SubscriptionSkip"("subscriptionId", "date");

-- CreateIndex
CREATE INDEX "CustomerSubscription_pendingPlanId_idx" ON "CustomerSubscription"("pendingPlanId");

-- AddForeignKey
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSkip" ADD CONSTRAINT "SubscriptionSkip_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSkip" ADD CONSTRAINT "SubscriptionSkip_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An ISO weekday, 1 (Monday) to 7 (Sunday), or none.
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_collectionWeekday_check"
  CHECK ("collectionWeekday" IS NULL OR "collectionWeekday" BETWEEN 1 AND 7);

-- Row-level security: SubscriptionSkip carries its own organizationId, so it
-- uses the direct org_isolation policy (the Discount shape).
ALTER TABLE "SubscriptionSkip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionSkip" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SubscriptionSkip"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
