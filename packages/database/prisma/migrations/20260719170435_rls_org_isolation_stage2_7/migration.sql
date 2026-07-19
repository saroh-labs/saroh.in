-- Blocker B1 (extends S1-011): PostgreSQL row-level-security tenant isolation for
-- every Stage 2-7 org-owned table (defense in depth, DEC-007).
--
-- Same shape as 20260718123258_rls_org_isolation: each table with a
-- denormalized `organizationId` gets ENABLE + FORCE RLS and one permissive
-- `org_isolation` policy filtering by the transaction-local GUC
-- `app.current_organization_id` (set via withOrgContext / set_config(is_local)).
-- FORCE is required because the app connects as the table owner.
--
-- DARK-ROLLOUT SAFE: every policy is permissive WHEN THE GUC IS UNSET
-- (`current_setting(..., true) IS NULL OR ...`), so nothing changes for queries
-- that don't run inside withOrgContext(). Enforcement begins only once a
-- request/job sets the GUC AND the app connects as a non-BYPASSRLS role.
--
-- Child tables that reach org via a parent and have NO own organizationId
-- (ProductVariant, OrderItem, Post, Comment, ...) are covered by a separate
-- join-based migration.

ALTER TABLE "Media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Media" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Media";
CREATE POLICY "org_isolation" ON "Media"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Product";
CREATE POLICY "org_isolation" ON "Product"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Category";
CREATE POLICY "org_isolation" ON "Category"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Inventory";
CREATE POLICY "org_isolation" ON "Inventory"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Customer";
CREATE POLICY "org_isolation" ON "Customer"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Cart";
CREATE POLICY "org_isolation" ON "Cart"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Order";
CREATE POLICY "org_isolation" ON "Order"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "FeatureFlagAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlagAudit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "FeatureFlagAudit";
CREATE POLICY "org_isolation" ON "FeatureFlagAudit"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Site" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Site";
CREATE POLICY "org_isolation" ON "Site"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Page" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Page";
CREATE POLICY "org_isolation" ON "Page"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PageVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PageVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PageVersion";
CREATE POLICY "org_isolation" ON "PageVersion"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Section" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Section";
CREATE POLICY "org_isolation" ON "Section"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Publication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Publication" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Publication";
CREATE POLICY "org_isolation" ON "Publication"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Domain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Domain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Domain";
CREATE POLICY "org_isolation" ON "Domain"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Contact";
CREATE POLICY "org_isolation" ON "Contact"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Form" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Form";
CREATE POLICY "org_isolation" ON "Form"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Submission";
CREATE POLICY "org_isolation" ON "Submission"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pipeline" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Pipeline";
CREATE POLICY "org_isolation" ON "Pipeline"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Stage";
CREATE POLICY "org_isolation" ON "Stage"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Lead";
CREATE POLICY "org_isolation" ON "Lead"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Activity";
CREATE POLICY "org_isolation" ON "Activity"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Job";
CREATE POLICY "org_isolation" ON "Job"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Notification";
CREATE POLICY "org_isolation" ON "Notification"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Service";
CREATE POLICY "org_isolation" ON "Service"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AvailabilityRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AvailabilityRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AvailabilityRule";
CREATE POLICY "org_isolation" ON "AvailabilityRule"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Booking";
CREATE POLICY "org_isolation" ON "Booking"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "MerchantPaymentProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MerchantPaymentProvider" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MerchantPaymentProvider";
CREATE POLICY "org_isolation" ON "MerchantPaymentProvider"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentIntent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PaymentIntent";
CREATE POLICY "org_isolation" ON "PaymentIntent"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAttempt" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PaymentAttempt";
CREATE POLICY "org_isolation" ON "PaymentAttempt"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PaymentRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentRefund" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PaymentRefund";
CREATE POLICY "org_isolation" ON "PaymentRefund"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "WebhookEvent";
CREATE POLICY "org_isolation" ON "WebhookEvent"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CommunicationProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommunicationProvider" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CommunicationProvider";
CREATE POLICY "org_isolation" ON "CommunicationProvider"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Message";
CREATE POLICY "org_isolation" ON "Message"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Delivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Delivery";
CREATE POLICY "org_isolation" ON "Delivery"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Consent";
CREATE POLICY "org_isolation" ON "Consent"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AutomationRule";
CREATE POLICY "org_isolation" ON "AutomationRule"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AutomationRun";
CREATE POLICY "org_isolation" ON "AutomationRun"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AnalyticsEvent";
CREATE POLICY "org_isolation" ON "AnalyticsEvent"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AnalyticsDailyAggregate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsDailyAggregate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AnalyticsDailyAggregate";
CREATE POLICY "org_isolation" ON "AnalyticsDailyAggregate"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Subscription";
CREATE POLICY "org_isolation" ON "Subscription"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "BillingWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingWebhookEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "BillingWebhookEvent";
CREATE POLICY "org_isolation" ON "BillingWebhookEvent"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
