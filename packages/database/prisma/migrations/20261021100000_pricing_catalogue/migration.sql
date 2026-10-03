-- Pricing catalogue (plan 2026-09-29 U1). Additive for the running app:
--   * new tables for catalogue versions, the shared draft, coupons and their
--     redemptions, subscription add-ons and provider plan ids;
--   * Subscription gains a pending move and its billing cycle;
--   * EntitlementOverride gains a kind (existing rows read as 'raise', their
--     meaning today), a module and a plan, and value/expiresAt become nullable;
--   * Plan's unique key becomes (key, version, interval) so a version can hold
--     a monthly and a yearly row per plan. The old (key, version) index is
--     dropped here rather than in a later release: it cannot hold both cycles,
--     and only seed scripts ever selected by it, never the running app.
-- The tables are created empty: no catalogue content lives in a migration.

-- DropIndex
DROP INDEX "Plan_key_version_key";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'month',
ADD COLUMN     "pendingFrom" TIMESTAMP(3),
ADD COLUMN     "pendingPlanId" TEXT;

-- AlterTable
ALTER TABLE "EntitlementOverride" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'raise',
ADD COLUMN     "moduleKey" TEXT,
ADD COLUMN     "planKey" TEXT,
ALTER COLUMN "value" DROP NOT NULL,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PricingCatalogVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "catalog" JSONB NOT NULL,
    "goLiveAt" TIMESTAMP(3) NOT NULL,
    "policy" TEXT NOT NULL DEFAULT 'keep',
    "note" TEXT NOT NULL DEFAULT '',
    "changes" JSONB NOT NULL DEFAULT '[]',
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingCatalogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingCatalogDraft" (
    "id" TEXT NOT NULL DEFAULT 'shared',
    "catalog" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "baseVersion" INTEGER,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingCatalogDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "planIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "discountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAddon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingProviderPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingProviderPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingCatalogVersion_version_key" ON "PricingCatalogVersion"("version");

-- CreateIndex
CREATE INDEX "PricingCatalogVersion_goLiveAt_idx" ON "PricingCatalogVersion"("goLiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PricingCoupon_code_key" ON "PricingCoupon"("code");

-- CreateIndex
CREATE INDEX "PricingCouponRedemption_organizationId_idx" ON "PricingCouponRedemption"("organizationId");

-- CreateIndex
CREATE INDEX "PricingCouponRedemption_subscriptionId_idx" ON "PricingCouponRedemption"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingCouponRedemption_couponId_organizationId_key" ON "PricingCouponRedemption"("couponId", "organizationId");

-- CreateIndex
CREATE INDEX "SubscriptionAddon_organizationId_idx" ON "SubscriptionAddon"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionAddon_subscriptionId_addonId_key" ON "SubscriptionAddon"("subscriptionId", "addonId");

-- CreateIndex
CREATE INDEX "PricingProviderPlan_status_idx" ON "PricingProviderPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProviderPlan_planId_provider_key" ON "PricingProviderPlan"("planId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProviderPlan_provider_providerPlanId_key" ON "PricingProviderPlan"("provider", "providerPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_version_interval_key" ON "Plan"("key", "version", "interval");

-- CreateIndex
CREATE INDEX "Subscription_pendingPlanId_idx" ON "Subscription"("pendingPlanId");

-- CreateIndex
CREATE INDEX "Subscription_pendingFrom_idx" ON "Subscription"("pendingFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_id_organizationId_key" ON "Subscription"("id", "organizationId");

-- CreateIndex
CREATE INDEX "EntitlementOverride_organizationId_kind_idx" ON "EntitlementOverride"("organizationId", "kind");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCouponRedemption" ADD CONSTRAINT "PricingCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PricingCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCouponRedemption" ADD CONSTRAINT "PricingCouponRedemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCouponRedemption" ADD CONSTRAINT "PricingCouponRedemption_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAddon" ADD CONSTRAINT "SubscriptionAddon_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAddon" ADD CONSTRAINT "SubscriptionAddon_subscriptionId_organizationId_fkey" FOREIGN KEY ("subscriptionId", "organizationId") REFERENCES "Subscription"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingProviderPlan" ADD CONSTRAINT "PricingProviderPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Each override kind carries the columns it needs (KTD-6).
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_kind_shape" CHECK (
  ("kind" = 'raise'  AND "value" IS NOT NULL)
  OR ("kind" = 'limit'  AND "moduleKey" IS NOT NULL AND "value" IS NOT NULL AND "value" >= 0)
  OR ("kind" IN ('grant', 'remove') AND "moduleKey" IS NOT NULL)
  OR ("kind" = 'price'  AND "value" IS NOT NULL AND "value" >= 0)
  OR ("kind" = 'plan'   AND "planKey" IS NOT NULL)
);

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingCycle_known"
  CHECK ("billingCycle" IN ('month', 'year'));
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pending_move_whole"
  CHECK (("pendingPlanId" IS NULL) = ("pendingFrom" IS NULL));

ALTER TABLE "PricingCatalogVersion" ADD CONSTRAINT "PricingCatalogVersion_policy_known"
  CHECK ("policy" IN ('keep', 'move'));
ALTER TABLE "PricingCatalogVersion" ADD CONSTRAINT "PricingCatalogVersion_version_positive"
  CHECK ("version" >= 1);

ALTER TABLE "PricingCatalogDraft" ADD CONSTRAINT "PricingCatalogDraft_one_shared"
  CHECK ("id" = 'shared');

-- Codes are stored upper-cased, so the unique index is case-blind.
ALTER TABLE "PricingCoupon" ADD CONSTRAINT "PricingCoupon_code_upper"
  CHECK ("code" = upper("code") AND "code" <> '');
ALTER TABLE "PricingCoupon" ADD CONSTRAINT "PricingCoupon_amounts_positive"
  CHECK ("discountPaise" > 0 AND "months" >= 1 AND "maxRedemptions" >= 1);

ALTER TABLE "PricingCouponRedemption" ADD CONSTRAINT "PricingCouponRedemption_discount_nonnegative"
  CHECK ("discountPaise" >= 0);

ALTER TABLE "SubscriptionAddon" ADD CONSTRAINT "SubscriptionAddon_quantity_positive"
  CHECK ("quantity" >= 1);

ALTER TABLE "PricingProviderPlan" ADD CONSTRAINT "PricingProviderPlan_status_known"
  CHECK ("status" IN ('PENDING', 'SYNCED', 'FAILED'));

-- Row-level security (org_isolation, FORCE) on the two tables that record
-- what one business bought or redeemed. The catalogue tables are global.
ALTER TABLE "SubscriptionAddon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionAddon" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SubscriptionAddon"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PricingCouponRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingCouponRedemption" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PricingCouponRedemption"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
