-- Row-level security for ProductFieldCategory, missed in
-- 20260924100000_catalogue_extras. It has no organizationId of its own and
-- reaches its organization through the field (the DiscountCategory shape).

ALTER TABLE "ProductFieldCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductFieldCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ProductFieldCategory"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "ProductField" p WHERE p."id" = "ProductFieldCategory"."fieldId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR EXISTS (SELECT 1 FROM "ProductField" p WHERE p."id" = "ProductFieldCategory"."fieldId"
                    AND p."organizationId" = current_setting('app.current_organization_id', true)));
