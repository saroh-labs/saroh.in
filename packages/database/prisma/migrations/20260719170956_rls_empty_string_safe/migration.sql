-- Blocker B1 fix: make the org_isolation RLS predicate EMPTY-STRING-safe.
--
-- Under connection pooling, once any transaction sets the custom GUC, a later
-- transaction on the same backend sees '' rather than NULL, so an `IS NULL`
-- test no longer matches and the policy denies everything. NULLIF(...,'')
-- restores the permissive-when-unset behaviour.
--
-- GUARDED (2026-08-10). This migration is timestamped before the migrations
-- that create many of its 48 tables, so it could not replay on a fresh
-- database. Each table's statements now run inside a block that swallows
-- undefined_table/undefined_column; whatever is skipped is applied by
-- 20260719210000_rls_backfill_org_isolation once every table exists.
-- Semantics on an existing database are unchanged.

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Store"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Store"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Membership"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Membership"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Project"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Project"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Team"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Team"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "BusinessProfile"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "BusinessProfile"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AuditEvent"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AuditEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "FeatureFlagOverride"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "FeatureFlagOverride"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Media"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Media"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Product"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Product"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Category"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Category"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Inventory"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Inventory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Customer"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Customer"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Cart"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Cart"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Order"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Order"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "FeatureFlagAudit"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "FeatureFlagAudit"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Site"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Site"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Page"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Page"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "PageVersion"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "PageVersion"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Section"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Section"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Publication"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Publication"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Domain"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Domain"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Contact"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Contact"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Form"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Form"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Submission"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Submission"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Pipeline"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Pipeline"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Stage"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Stage"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Lead"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Lead"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Activity"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Activity"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Job"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Job"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Notification"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Notification"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Service"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Service"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AvailabilityRule"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AvailabilityRule"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Booking"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Booking"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "MerchantPaymentProvider"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "MerchantPaymentProvider"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "PaymentIntent"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "PaymentIntent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "PaymentAttempt"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "PaymentAttempt"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "PaymentRefund"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "PaymentRefund"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "WebhookEvent"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "WebhookEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "CommunicationProvider"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "CommunicationProvider"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Message"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Message"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Delivery"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Delivery"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Consent"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Consent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AutomationRule"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AutomationRule"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AutomationRun"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AutomationRun"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AnalyticsEvent"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AnalyticsEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AnalyticsDailyAggregate"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AnalyticsDailyAggregate"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Subscription"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Subscription"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "BillingWebhookEvent"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "BillingWebhookEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;
