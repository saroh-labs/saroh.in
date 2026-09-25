-- Listings and stock per storefront (#510, ADR-010): the copy of the old
-- rows into the tables 20261002100000_catalogue_listings_stock_levels made.
-- Data only, in its own transaction, so the schema change's ACCESS EXCLUSIVE
-- locks on "Product" and "OrderItem" are released before it starts: this
-- takes row locks only — on the order lines it links, for as long as it runs
-- (about 7.5 s on 200,000 lines). The migrations after it read what it copies
-- (the opening stock count, what fulfilled lines sold, which products track
-- stock), so it stays a migration, not a step after the deploy.
--
-- Inventory and VariantInventory are copied here and no longer written; they
-- are dropped in a later deploy. The same copy is the TypeScript backfill
-- (packages/database/src/backfill/listings-stock-levels.ts): run after this
-- migration it finds nothing left to do, and it repairs what open lines hold
-- (held-stock.ts). Every statement skips what exists already.
-- Forward-only: the rollback is the snapshot taken before the deploy.

-- Every product is listed at the storefront it was made at, with all its
-- variants.
INSERT INTO "ProductListing" ("id", "organizationId", "storeId", "productId", "createdAt")
SELECT 'pl' || replace(gen_random_uuid()::text, '-', ''), p."organizationId", p."storeId", p."id", p."createdAt"
FROM "Product" p
WHERE p."storeId" IS NOT NULL
ON CONFLICT ("storeId", "productId") DO NOTHING;

INSERT INTO "ProductListingVariant" ("id", "organizationId", "listingId", "productId", "variantId")
SELECT 'plv' || replace(gen_random_uuid()::text, '-', ''), l."organizationId", l."id", l."productId", v."id"
FROM "ProductListing" l
JOIN "ProductVariant" v ON v."productId" = l."productId"
ON CONFLICT ("listingId", "variantId") DO NOTHING;

-- One StockLevel per Inventory row (the product counted as a whole, or what
-- lines without a variant still hold once it counts per variant) and per
-- VariantInventory row, at the product's storefront, with its numbers.
INSERT INTO "StockLevel" ("id", "organizationId", "storeId", "productId", "variantId", "onHand", "promised", "lowStockAlert", "updatedAt")
SELECT 'sl' || replace(gen_random_uuid()::text, '-', ''), p."organizationId", p."storeId", p."id", NULL,
       i."quantity", i."reserved", i."lowStockAlert", i."updatedAt"
FROM "Inventory" i
JOIN "Product" p ON p."id" = i."productId"
WHERE p."storeId" IS NOT NULL
ON CONFLICT ("storeId", "productId") WHERE "variantId" IS NULL DO NOTHING;

INSERT INTO "StockLevel" ("id", "organizationId", "storeId", "productId", "variantId", "onHand", "promised", "lowStockAlert", "updatedAt")
SELECT 'sl' || replace(gen_random_uuid()::text, '-', ''), p."organizationId", p."storeId", p."id", vi."variantId",
       vi."quantity", vi."reserved", vi."lowStockAlert", vi."updatedAt"
FROM "VariantInventory" vi
JOIN "Product" p ON p."id" = vi."productId"
WHERE p."storeId" IS NOT NULL
ON CONFLICT ("storeId", "variantId") WHERE "variantId" IS NOT NULL DO NOTHING;

-- Every line of an open or fulfilled order that holds (or held) stock names
-- its row at the order's storefront: the one it recorded, or — for a line
-- from before rows were recorded, on a product that counts — the old guess
-- (its variant's row if it has one, else the product's). An open line holds
-- its quantity; a fulfilled one holds nothing but keeps the row, so a later
-- return can put units back on the same shelf.
WITH line AS (
  SELECT oi."id", oi."quantity", oi."stockRow", o."status",
         vrow."id" AS "variantRow", prow."id" AS "productRow"
  FROM "OrderItem" oi
  JOIN "Order" o ON o."id" = oi."orderId"
  LEFT JOIN "StockLevel" vrow
    ON vrow."storeId" = o."storeId" AND vrow."variantId" = oi."variantId"
  LEFT JOIN "StockLevel" prow
    ON prow."storeId" = o."storeId" AND prow."productId" = oi."productId" AND prow."variantId" IS NULL
  WHERE o."status" IN ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED')
    AND oi."stockLevelId" IS NULL
    AND (oi."stockRow" IS NULL OR oi."stockRow" <> 'NONE')
), chosen AS (
  SELECT "id", "quantity", "status",
         CASE
           WHEN "stockRow" = 'VARIANT' THEN "variantRow"
           WHEN "stockRow" = 'PRODUCT' THEN "productRow"
           ELSE COALESCE("variantRow", "productRow")
         END AS "row",
         CASE
           WHEN "stockRow" IS NOT NULL THEN "stockRow"
           WHEN "variantRow" IS NOT NULL THEN 'VARIANT'::"StockRow"
           WHEN "productRow" IS NOT NULL THEN 'PRODUCT'::"StockRow"
         END AS "kind"
  FROM line
)
UPDATE "OrderItem" oi
SET "stockLevelId" = c."row",
    "stockRow" = c."kind",
    "heldQuantity" = CASE WHEN c."status" IN ('PENDING', 'PROCESSING') THEN c."quantity" ELSE 0 END
FROM chosen c
WHERE oi."id" = c."id" AND c."row" IS NOT NULL;
