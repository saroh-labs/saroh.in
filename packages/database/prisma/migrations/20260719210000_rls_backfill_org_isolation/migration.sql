-- Backfill RLS for tables skipped by the guarded RLS migrations.
--
-- Three RLS migrations (20260718123258, 20260719170435, 20260719170956,
-- 20260719171244) are timestamped BEFORE the migrations that create many of
-- the tables they target. They now skip what does not exist, which is what
-- makes a fresh database possible -- but leaves those tables without row
-- isolation. This runs last, when every table exists, and applies the FINAL
-- policy definition to all of them.
--
--   fresh database    -> applies whatever the guarded migrations skipped
--   existing database -> re-applies the same definitions (no-op in effect)
--
-- The policy bodies below are taken verbatim from the LAST migration to define
-- each table's policy: the NULLIF empty-string-safe form from 20260719170956
-- for tables with their own organizationId, and the join form from
-- 20260719171244 for child tables. Applying the older non-NULLIF body from
-- 20260719170435 here would REGRESS the B1 pooling fix.
--
-- Deliberately NOT guarded. By this point every table must exist, so a missing
-- one is a real defect and should stop the deploy rather than silently leave a
-- tenant-scoped table without row isolation.

-- ---- tables scoped by own organizationId ------------------------------
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Store";
CREATE POLICY "org_isolation" ON "Store"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Membership";
CREATE POLICY "org_isolation" ON "Membership"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Project";
CREATE POLICY "org_isolation" ON "Project"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Team";
CREATE POLICY "org_isolation" ON "Team"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessProfile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "BusinessProfile";
CREATE POLICY "org_isolation" ON "BusinessProfile"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AuditEvent";
CREATE POLICY "org_isolation" ON "AuditEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "FeatureFlagOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlagOverride" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "FeatureFlagOverride";
CREATE POLICY "org_isolation" ON "FeatureFlagOverride"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Media" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Media";
CREATE POLICY "org_isolation" ON "Media"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Product";
CREATE POLICY "org_isolation" ON "Product"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Category";
CREATE POLICY "org_isolation" ON "Category"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Inventory";
CREATE POLICY "org_isolation" ON "Inventory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Customer";
CREATE POLICY "org_isolation" ON "Customer"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Cart";
CREATE POLICY "org_isolation" ON "Cart"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Order";
CREATE POLICY "org_isolation" ON "Order"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "FeatureFlagAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlagAudit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "FeatureFlagAudit";
CREATE POLICY "org_isolation" ON "FeatureFlagAudit"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Site" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Site";
CREATE POLICY "org_isolation" ON "Site"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Page" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Page";
CREATE POLICY "org_isolation" ON "Page"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PageVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PageVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PageVersion";
CREATE POLICY "org_isolation" ON "PageVersion"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Section" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Section";
CREATE POLICY "org_isolation" ON "Section"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Publication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Publication" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Publication";
CREATE POLICY "org_isolation" ON "Publication"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Domain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Domain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Domain";
CREATE POLICY "org_isolation" ON "Domain"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Contact";
CREATE POLICY "org_isolation" ON "Contact"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Form" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Form";
CREATE POLICY "org_isolation" ON "Form"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Submission";
CREATE POLICY "org_isolation" ON "Submission"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pipeline" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Pipeline";
CREATE POLICY "org_isolation" ON "Pipeline"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Stage";
CREATE POLICY "org_isolation" ON "Stage"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Lead";
CREATE POLICY "org_isolation" ON "Lead"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Activity";
CREATE POLICY "org_isolation" ON "Activity"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Job";
CREATE POLICY "org_isolation" ON "Job"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Notification";
CREATE POLICY "org_isolation" ON "Notification"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Service";
CREATE POLICY "org_isolation" ON "Service"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AvailabilityRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AvailabilityRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AvailabilityRule";
CREATE POLICY "org_isolation" ON "AvailabilityRule"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Booking";
CREATE POLICY "org_isolation" ON "Booking"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "MerchantPaymentProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MerchantPaymentProvider" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MerchantPaymentProvider";
CREATE POLICY "org_isolation" ON "MerchantPaymentProvider"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentIntent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PaymentIntent";
CREATE POLICY "org_isolation" ON "PaymentIntent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAttempt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PaymentAttempt";
CREATE POLICY "org_isolation" ON "PaymentAttempt"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentRefund" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PaymentRefund";
CREATE POLICY "org_isolation" ON "PaymentRefund"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "WebhookEvent";
CREATE POLICY "org_isolation" ON "WebhookEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CommunicationProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationProvider" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CommunicationProvider";
CREATE POLICY "org_isolation" ON "CommunicationProvider"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Message";
CREATE POLICY "org_isolation" ON "Message"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Delivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Delivery";
CREATE POLICY "org_isolation" ON "Delivery"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Consent";
CREATE POLICY "org_isolation" ON "Consent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AutomationRule";
CREATE POLICY "org_isolation" ON "AutomationRule"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AutomationRun";
CREATE POLICY "org_isolation" ON "AutomationRun"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AnalyticsEvent";
CREATE POLICY "org_isolation" ON "AnalyticsEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AnalyticsDailyAggregate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsDailyAggregate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AnalyticsDailyAggregate";
CREATE POLICY "org_isolation" ON "AnalyticsDailyAggregate"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Subscription";
CREATE POLICY "org_isolation" ON "Subscription"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "BillingWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingWebhookEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "BillingWebhookEvent";
CREATE POLICY "org_isolation" ON "BillingWebhookEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

-- ---- tables scoped by via parent join ------------------------------
ALTER TABLE "StoreOwner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreOwner" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StoreOwner";
CREATE POLICY "org_isolation" ON "StoreOwner"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreOwner"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreOwner"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "StoreMembers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreMembers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StoreMembers";
CREATE POLICY "org_isolation" ON "StoreMembers"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreMembers"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreMembers"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "StoreInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreInvitation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StoreInvitation";
CREATE POLICY "org_isolation" ON "StoreInvitation"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreInvitation"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreInvitation"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "StorePaymentConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorePaymentConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StorePaymentConfig";
CREATE POLICY "org_isolation" ON "StorePaymentConfig"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StorePaymentConfig"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StorePaymentConfig"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Transaction";
CREATE POLICY "org_isolation" ON "Transaction"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Transaction"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Transaction"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Refund";
CREATE POLICY "org_isolation" ON "Refund"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Refund"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Refund"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Post" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Post";
CREATE POLICY "org_isolation" ON "Post"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Post"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Post"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "PostCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PostCategory";
CREATE POLICY "org_isolation" ON "PostCategory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "PostCategory"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "PostCategory"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "IntegrationSecret" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationSecret" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "IntegrationSecret";
CREATE POLICY "org_isolation" ON "IntegrationSecret"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "IntegrationSecret"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "IntegrationSecret"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "StoreSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreSettings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StoreSettings";
CREATE POLICY "org_isolation" ON "StoreSettings"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreSettings"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreSettings"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "StoreFeatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreFeatures" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StoreFeatures";
CREATE POLICY "org_isolation" ON "StoreFeatures"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreFeatures"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreFeatures"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "CustomDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomDomain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CustomDomain";
CREATE POLICY "org_isolation" ON "CustomDomain"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "CustomDomain"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "CustomDomain"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AuditLog";
CREATE POLICY "org_isolation" ON "AuditLog"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "AuditLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "AuditLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "SecretAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecretAccessLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SecretAccessLog";
CREATE POLICY "org_isolation" ON "SecretAccessLog"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "SecretAccessLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "SecretAccessLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ProductVariant";
CREATE POLICY "org_isolation" ON "ProductVariant"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductVariant"."productId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductVariant"."productId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "OrderItem";
CREATE POLICY "org_isolation" ON "OrderItem"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Order" p WHERE p."id" = "OrderItem"."orderId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Order" p WHERE p."id" = "OrderItem"."orderId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Comment";
CREATE POLICY "org_isolation" ON "Comment"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Post" po JOIN "Store" s ON s."id" = po."storeId"
                    WHERE po."id" = "Comment"."postId"
                    AND s."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Post" po JOIN "Store" s ON s."id" = po."storeId"
                    WHERE po."id" = "Comment"."postId"
                    AND s."organizationId" = current_setting('app.current_organization_id', true)));
