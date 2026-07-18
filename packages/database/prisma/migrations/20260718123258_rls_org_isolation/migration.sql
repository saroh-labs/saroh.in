-- S1-011: PostgreSQL row-level-security tenant isolation (defense in depth).
--
-- Each org-scoped table gets RLS that filters rows by the transaction-local
-- GUC `app.current_organization_id`, set via withOrgContext() (set_config(...,
-- is_local => true)). FORCE is required because the app connects as the table
-- owner (owners otherwise bypass RLS).
--
-- TRANSITION SAFETY (dark rollout): every policy is PERMISSIVE WHEN THE GUC IS
-- UNSET — `current_setting('app.current_organization_id', true) IS NULL OR ...`.
-- Nothing in the app sets the GUC yet, so all current queries are unaffected.
-- Enforcement begins only once request handling runs queries inside
-- withOrgContext(). At that point cross-tenant rows are invisible at the DB.
--
-- Store-scoped child tables (Product, Order, Cart, Customer, Inventory, Post,
-- ...) reach their org through Store; their RLS is a follow-up that joins to
-- Store and is layered on after this org-direct set is validated.

-- Reusable predicate is inlined per table (Postgres has no shared policy expr).

-- Store (organizationId may be NULL during the S1-006 transition; a NULL-org
-- store is hidden when a context is set, visible when unset).
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Store"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Membership"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Project"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "Team"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BusinessProfile"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AuditEvent"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "FeatureFlagOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlagOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "FeatureFlagOverride"
  USING (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (current_setting('app.current_organization_id', true) IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
