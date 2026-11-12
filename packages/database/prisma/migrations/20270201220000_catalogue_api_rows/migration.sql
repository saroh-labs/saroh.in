-- The public API's catalogue rows (plan 2026-11-10-001), hidden on every
-- plan, added to every catalogue version and draft that lacks them.
-- An exception to "no catalogue content in a migration": a business stays on
-- the version it joined, and staff can grant only a row its version has, so
-- a new version alone would leave every existing business ungrantable.
-- Hidden on every plan, so no business gains anything until staff grant it
-- or a later version includes it. Idempotent: a row already there is kept.
CREATE TEMP TABLE "_api_rows" ("id" TEXT, "name" TEXT, "what" TEXT);
INSERT INTO "_api_rows" VALUES
    ('api-storefront', 'Storefront API', 'Your own website reads your catalogue and takes bookings with a publishable key.'),
    ('api-secret', 'Server API', 'Your own server reads and writes your business with a secret key.'),
    ('api-keys', 'API keys', 'How many API keys the business can hold.'),
    ('webhooks', 'Webhooks', 'Saroh tells your own server when a booking, order, customer or enquiry changes.');

CREATE TEMP TABLE "_api_add" AS
SELECT v."id" AS "versionId", 'version' AS "kind",
       jsonb_agg(jsonb_build_object(
           'id', r."id", 'name', r."name", 'what', r."what",
           'group', 'usage', 'pricing', 'hidden',
           'cells', (SELECT coalesce(jsonb_object_agg(p->>'id', '{"inc":false,"off":"hidden"}'::jsonb), '{}'::jsonb)
                     FROM jsonb_array_elements(v."catalog"->'plans') p)
       )) AS "rows"
FROM "PricingCatalogVersion" v
CROSS JOIN "_api_rows" r
WHERE jsonb_typeof(v."catalog"->'modules') = 'array'
  AND jsonb_typeof(v."catalog"->'plans') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v."catalog"->'modules') m WHERE m->>'id' = r."id"
)
GROUP BY v."id";

UPDATE "PricingCatalogVersion" v
SET "catalog" = jsonb_set(v."catalog", '{modules}', (v."catalog"->'modules') || a."rows")
FROM "_api_add" a
WHERE a."versionId" = v."id";

-- The shared draft too, so the next published version keeps them.
UPDATE "PricingCatalogDraft" d
SET "catalog" = jsonb_set(d."catalog", '{modules}', (d."catalog"->'modules') || (
    SELECT jsonb_agg(jsonb_build_object(
        'id', r."id", 'name', r."name", 'what', r."what",
        'group', 'usage', 'pricing', 'hidden',
        'cells', (SELECT coalesce(jsonb_object_agg(p->>'id', '{"inc":false,"off":"hidden"}'::jsonb), '{}'::jsonb)
                  FROM jsonb_array_elements(d."catalog"->'plans') p)))
    FROM "_api_rows" r
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d."catalog"->'modules') m WHERE m->>'id' = r."id")))
WHERE jsonb_typeof(d."catalog"->'modules') = 'array'
  AND jsonb_typeof(d."catalog"->'plans') = 'array'
  AND EXISTS (
    SELECT 1 FROM "_api_rows" r
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d."catalog"->'modules') m WHERE m->>'id' = r."id"));

DROP TABLE "_api_add";
DROP TABLE "_api_rows";
