-- Saroh billing (pricing catalogue U15): checkout, plan changes, renewals.
--   * Subscription remembers when the last provider event it applied
--     happened, so a late delivery can't undo a newer one;
--   * BillingCheckout records each attempt to move a business onto a paid
--     plan, completed by the provider's webhook;
--   * one waiting run of the plan-move sweep (billing.moves.apply).
-- Expand-only: a new nullable column, a new table and a new partial index.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "providerEventAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BillingCheckout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "provider" TEXT NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "providerPlanId" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "pricePaise" INTEGER NOT NULL,
    "chargeNowPaise" INTEGER NOT NULL DEFAULT 0,
    "chargeNowGstPaise" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingCheckout_organizationId_idx" ON "BillingCheckout"("organizationId");

-- CreateIndex
CREATE INDEX "BillingCheckout_planId_idx" ON "BillingCheckout"("planId");

-- CreateIndex
CREATE INDEX "BillingCheckout_status_expiresAt_idx" ON "BillingCheckout"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckout_provider_providerSubscriptionId_key" ON "BillingCheckout"("provider", "providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckout_one_live_per_org" ON "BillingCheckout"("organizationId", "status") WHERE (status = 'OPEN' OR status = 'SCHEDULED');

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_billing_moves_apply" ON "Job"("type") WHERE (type = 'billing.moves.apply' AND status = 'PENDING');

-- AddForeignKey
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- What a checkout may hold.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_cycle_known"
  CHECK ("cycle" IN ('month', 'year'));
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_kind_known"
  CHECK ("kind" IN ('NEW', 'UPGRADE', 'SCHEDULED'));
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_status_known"
  CHECK ("status" IN ('OPEN', 'SCHEDULED', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_amounts_whole"
  CHECK ("pricePaise" > 0 AND "chargeNowPaise" >= 0 AND "chargeNowGstPaise" >= 0);
-- Only an upgrade charges a difference now.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_charge_now_upgrade"
  CHECK ("kind" = 'UPGRADE' OR ("chargeNowPaise" = 0 AND "chargeNowGstPaise" = 0));
-- A new plan starts at authorisation; the others on a date.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_start_shape"
  CHECK (("kind" = 'NEW') = ("startAt" IS NULL));
-- Only a SCHEDULED checkout waits as SCHEDULED.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_scheduled_kind"
  CHECK ("status" <> 'SCHEDULED' OR "kind" = 'SCHEDULED');
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_completed_at"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

-- Row-level security (org_isolation, FORCE): a checkout is one business's.
ALTER TABLE "BillingCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingCheckout" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BillingCheckout"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
