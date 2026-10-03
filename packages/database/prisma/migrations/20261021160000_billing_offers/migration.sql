-- Trials, coupons and add-on charges (pricing catalogue U16).
--   * BillingCheckout gains the TRIAL kind (on the plan once authorised, its
--     first charge at `startAt`, the trial's end) and the coupon it was
--     quoted with: `discountPaise` off each of the first `discountCharges`
--     charges, before GST;
--   * SubscriptionAddonCharge: an add-on owed for one period, put on the
--     provider subscription's next charge and invoiced with it.
-- Expand-only: new columns with defaults, a new table, a replaced CHECK that
-- only admits one more value.

-- AlterTable
ALTER TABLE "BillingCheckout" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountCharges" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SubscriptionAddonCharge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPaise" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "chargeAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "providerChargeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAddonCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionAddonCharge_organizationId_idx" ON "SubscriptionAddonCharge"("organizationId");

-- CreateIndex
CREATE INDEX "SubscriptionAddonCharge_subscriptionId_status_idx" ON "SubscriptionAddonCharge"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionAddonCharge_provider_providerSubscriptionId_sta_idx" ON "SubscriptionAddonCharge"("provider", "providerSubscriptionId", "status");

-- CreateIndex
CREATE INDEX "BillingCheckout_couponId_idx" ON "BillingCheckout"("couponId");

-- AddForeignKey
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_subscriptionId_organizationId_fkey" FOREIGN KEY ("subscriptionId", "organizationId") REFERENCES "Subscription"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PricingCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A trial is a kind of its own. `BillingCheckout_start_shape` already gives
-- it a start (only NEW starts at authorisation), and
-- `BillingCheckout_charge_now_upgrade` keeps it from charging anything now.
ALTER TABLE "BillingCheckout" DROP CONSTRAINT "BillingCheckout_kind_known";
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_kind_known"
  CHECK ("kind" IN ('NEW', 'UPGRADE', 'SCHEDULED', 'TRIAL'));
-- A coupon's discount: whole paise, never more than the plan's price, and
-- present exactly when a coupon is.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_discount_shape"
  CHECK ("discountPaise" >= 0 AND "discountCharges" >= 0
         AND "discountPaise" <= "pricePaise"
         AND ("couponId" IS NULL) = ("discountCharges" = 0)
         AND ("discountCharges" = 0) = ("discountPaise" = 0));
-- Only a checkout that starts a plan carries one.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_discount_kind"
  CHECK ("couponId" IS NULL OR "kind" IN ('NEW', 'TRIAL'));

-- What an add-on charge may hold.
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_status_known"
  CHECK ("status" IN ('QUEUED', 'SENT', 'INVOICED', 'DROPPED'));
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_amounts_whole"
  CHECK ("quantity" >= 1 AND "unitPaise" >= 0);
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_period_order"
  CHECK ("periodStart" < "periodEnd");
-- Sent and invoiced rows name the provider's item; invoiced ones the invoice.
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_sent_shape"
  CHECK ("status" NOT IN ('SENT', 'INVOICED') OR "providerChargeId" IS NOT NULL);
ALTER TABLE "SubscriptionAddonCharge" ADD CONSTRAINT "SubscriptionAddonCharge_invoiced_shape"
  CHECK (("status" = 'INVOICED') = ("invoiceId" IS NOT NULL));

-- Row-level security (org_isolation, FORCE): a charge is one business's.
ALTER TABLE "SubscriptionAddonCharge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionAddonCharge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SubscriptionAddonCharge"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
