-- D9 (plan 2026-09-26-004): everything done to a subscription, append-only,
-- with who did it: subscribe, pause, resume, cancel, a plan change, a skip,
-- a retry and each renewal. No backfill: a subscription made before this
-- deploy says "Earlier changes weren't recorded".

-- The composite key an event points at, so an event can't name another
-- business's subscription. `id` is already unique, so this cannot fail.
CREATE UNIQUE INDEX "CustomerSubscription_id_organizationId_key" ON "CustomerSubscription"("id", "organizationId");

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "customerAccountId" TEXT,
    "invoiceId" TEXT,
    "note" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionEvent_organizationId_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("organizationId", "subscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_organizationId_fkey" FOREIGN KEY ("subscriptionId", "organizationId") REFERENCES "CustomerSubscription"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, as every business-owned table (PRODUCT_STRATEGY §25).
ALTER TABLE "SubscriptionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SubscriptionEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
