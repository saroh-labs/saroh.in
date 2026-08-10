-- Blocker B2: join-based RLS for tenant CHILD tables that reach their
-- Organization through a parent (no own organizationId).
--
-- GUARDED (2026-08-10), same reason as 20260719170956: timestamped before the
-- migrations creating several of these tables and their parents, so it could
-- not replay on a fresh database. Skipped tables are applied by
-- 20260719210000_rls_backfill_org_isolation.

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "StoreOwner" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "StoreOwner" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "StoreOwner"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "StoreOwner"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreOwner"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreOwner"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "StoreMembers" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "StoreMembers" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "StoreMembers"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "StoreMembers"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreMembers"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreMembers"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "StoreInvitation" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "StoreInvitation" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "StoreInvitation"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "StoreInvitation"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreInvitation"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreInvitation"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "StorePaymentConfig" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "StorePaymentConfig" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "StorePaymentConfig"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "StorePaymentConfig"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StorePaymentConfig"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StorePaymentConfig"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Transaction"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Transaction"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Transaction"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Transaction"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Refund"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Refund"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Refund"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Refund"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "Post" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Post"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Post"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Post"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "Post"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "PostCategory" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "PostCategory" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "PostCategory"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "PostCategory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "PostCategory"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "PostCategory"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "IntegrationSecret" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "IntegrationSecret" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "IntegrationSecret"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "IntegrationSecret"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "IntegrationSecret"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "IntegrationSecret"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "StoreSettings" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "StoreSettings" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "StoreSettings"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "StoreSettings"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreSettings"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreSettings"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "StoreFeatures" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "StoreFeatures" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "StoreFeatures"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "StoreFeatures"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreFeatures"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "StoreFeatures"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "CustomDomain" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "CustomDomain" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "CustomDomain"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "CustomDomain"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "CustomDomain"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "CustomDomain"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "AuditLog"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "AuditLog"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "AuditLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "AuditLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "SecretAccessLog" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "SecretAccessLog" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "SecretAccessLog"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "SecretAccessLog"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "SecretAccessLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "SecretAccessLog"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "ProductVariant"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "ProductVariant"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductVariant"."productId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductVariant"."productId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "OrderItem"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "OrderItem"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Order" p WHERE p."id" = "OrderItem"."orderId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Order" p WHERE p."id" = "OrderItem"."orderId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;

DO $mig$
BEGIN
    EXECUTE $stmt$ALTER TABLE "Comment" ENABLE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$ALTER TABLE "Comment" FORCE ROW LEVEL SECURITY$stmt$;
    EXECUTE $stmt$DROP POLICY IF EXISTS "org_isolation" ON "Comment"$stmt$;
    EXECUTE $stmt$CREATE POLICY "org_isolation" ON "Comment"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Post" po JOIN "Store" s ON s."id" = po."storeId"
                    WHERE po."id" = "Comment"."postId"
                    AND s."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Post" po JOIN "Store" s ON s."id" = po."storeId"
                    WHERE po."id" = "Comment"."postId"
                    AND s."organizationId" = current_setting('app.current_organization_id', true)))$stmt$;
EXCEPTION
    -- The table (or the column its policy references) does not exist
    -- yet on a fresh database; a later migration creates it and the
    -- rls_backfill migration applies this policy then.
    WHEN undefined_table OR undefined_column THEN NULL;
END $mig$;
