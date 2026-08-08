-- Blocker B2: join-based RLS for tenant CHILD tables that reach their
-- Organization through a parent (no own organizationId). The deferred
-- store-child follow-up from S1-011. Dark-rollout safe: permissive when the GUC
-- is unset/'' (NULLIF(...) IS NULL), else visible only if the org-bearing
-- ancestor is in the context org. `unset OR EXISTS(...)` keeps NULL/orphan-FK
-- rows visible when unset. FORCE RLS; the current owner role bypasses.
--
-- NOTE: StoreApiKey is defined in schema.prisma but has no table in the DB, so
-- it is intentionally omitted here; add its policy when/if that table is created.

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
