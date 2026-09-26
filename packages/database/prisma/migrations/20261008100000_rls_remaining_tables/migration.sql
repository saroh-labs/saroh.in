-- Row-level security for the business-owned tables that never had it (#53).
--
-- B1/B2 covered the tables that existed in July; every table added since then
-- carried its own policy except these. Same predicate as every other policy:
-- permissive when app.current_organization_id is unset or '' (jobs, public
-- routes, the admin console — none of which run inside an org context), and
-- otherwise the row's organization must be the one in the GUC. FORCEd so the
-- table owner is held to it too.
--
-- Checked before adding each one: no request that runs inside an
-- organization context (OrganizationGuard -> OrgRlsInterceptor) reads or
-- writes another organization's rows in these tables. The admin console's
-- routes carry no organization context, and invitation accept and preview-link
-- reads are token lookups on routes without one.
--
-- Nullable organizationId (AdminAuditEvent, IdempotencyRecord): a row with no
-- organization is visible and writable only with no org context, which is the
-- only place such rows are written today (the admin console).

-- Tables with their own organizationId.

ALTER TABLE "SiteReviewer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteReviewer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SiteReviewer";
CREATE POLICY "org_isolation" ON "SiteReviewer"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "OrganizationInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationInvitation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "OrganizationInvitation";
CREATE POLICY "org_isolation" ON "OrganizationInvitation"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AdminAccessSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAccessSession" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AdminAccessSession";
CREATE POLICY "org_isolation" ON "AdminAccessSession"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AdminAuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAuditEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AdminAuditEvent";
CREATE POLICY "org_isolation" ON "AdminAuditEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AdminOrganizationNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminOrganizationNote" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AdminOrganizationNote";
CREATE POLICY "org_isolation" ON "AdminOrganizationNote"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "OrganizationModule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationModule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "OrganizationModule";
CREATE POLICY "org_isolation" ON "OrganizationModule"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "ProjectModule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectModule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ProjectModule";
CREATE POLICY "org_isolation" ON "ProjectModule"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CustomerIdentityLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerIdentityLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CustomerIdentityLink";
CREATE POLICY "org_isolation" ON "CustomerIdentityLink"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SavedView";
CREATE POLICY "org_isolation" ON "SavedView"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SiteComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteComment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SiteComment";
CREATE POLICY "org_isolation" ON "SiteComment"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SiteApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteApproval" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SiteApproval";
CREATE POLICY "org_isolation" ON "SiteApproval"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SitePreviewLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SitePreviewLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SitePreviewLink";
CREATE POLICY "org_isolation" ON "SitePreviewLink"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "IdempotencyRecord";
CREATE POLICY "org_isolation" ON "IdempotencyRecord"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

-- Child tables with no organizationId of their own: they reach it through
-- their parent, the B2 shape.

ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ApiKey";
CREATE POLICY "org_isolation" ON "ApiKey"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "ApiKey"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Store" p WHERE p."id" = "ApiKey"."storeId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "TeamMember";
CREATE POLICY "org_isolation" ON "TeamMember"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Team" p WHERE p."id" = "TeamMember"."teamId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Team" p WHERE p."id" = "TeamMember"."teamId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));

ALTER TABLE "ProjectAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectAccess" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "ProjectAccess";
CREATE POLICY "org_isolation" ON "ProjectAccess"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = "ProjectAccess"."projectId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = "ProjectAccess"."projectId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));
