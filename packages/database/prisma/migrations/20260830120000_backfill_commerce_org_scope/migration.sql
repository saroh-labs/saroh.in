-- Backfill `organizationId` on the commerce tables (#173).
--
-- `20260719184929_commerce_org_scope` added a NULLABLE `organizationId` to six
-- commerce tables and backfilled them once. The application write paths were
-- never updated to stamp it, so every Order, Customer, Product, Category and
-- Inventory row created since that migration has `organizationId = NULL`.
--
-- A NULL there is not a cosmetic gap. It is invisible to
-- `WHERE "organizationId" = $1` (SQL three-valued logic), and the
-- `org_isolation` RLS policy added by `20260719210000_rls_backfill_org_isolation`
-- uses that same predicate — so once RLS enforcement is enabled the row vanishes
-- from the tenant that owns it.
--
-- The write paths are fixed in the same change; this repairs the rows already
-- written. `Store.organizationId` is NOT NULL as of `20260719172643`, so the
-- store is a total source of truth.
--
-- Idempotent by construction (`IS NULL` guard), so replaying it is safe and it
-- is a no-op on a fresh database.

UPDATE "Product"   c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL;
UPDATE "Category"  c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL;
UPDATE "Inventory" c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL;
UPDATE "Customer"  c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL;
UPDATE "Cart"      c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL;
UPDATE "Order"     c SET "organizationId" = s."organizationId" FROM "Store" s WHERE c."storeId" = s.id AND c."organizationId" IS NULL;
