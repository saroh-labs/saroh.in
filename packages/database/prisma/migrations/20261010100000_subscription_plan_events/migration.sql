-- D2 (plan 2026-09-26-004): every change to a plan, append-only, with who
-- made it and each changed field's value before and after. No backfill: a
-- plan made before this deploy has no history before it.

-- The composite key an event points at, so an event can't name another
-- business's plan. `id` is already unique, so this cannot fail.
CREATE UNIQUE INDEX "SubscriptionPlan_id_organizationId_key" ON "SubscriptionPlan"("id", "organizationId");

-- CreateTable
CREATE TABLE "SubscriptionPlanEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPlanEvent_organizationId_planId_createdAt_idx" ON "SubscriptionPlanEvent"("organizationId", "planId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPlanEvent" ADD CONSTRAINT "SubscriptionPlanEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanEvent" ADD CONSTRAINT "SubscriptionPlanEvent_planId_organizationId_fkey" FOREIGN KEY ("planId", "organizationId") REFERENCES "SubscriptionPlan"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, as every business-owned table (PRODUCT_STRATEGY §25).
ALTER TABLE "SubscriptionPlanEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionPlanEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SubscriptionPlanEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
