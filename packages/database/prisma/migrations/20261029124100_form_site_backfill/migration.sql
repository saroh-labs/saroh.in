-- Give every enquiry form saved without a site the site it belongs to
-- (UX-002). The site editor created forms with "siteId" NULL, so a site's
-- Forms tab never listed them and their entries page answered 404. The
-- editor now names the site on every save; this binds the forms it left
-- behind.
--
-- Data only, and only ever fills a NULL: no form already on a site moves,
-- nothing is deleted, no column changes. Two passes, the precise one first:
--
-- 1. A form an editor section points at ("content"->>'formId'), when the
--    sections pointing at it are all on ONE site of the same business.
-- 2. What is still unbound in a business with exactly one site (a form
--    whose section was since removed, so its entries stay reachable).
--
-- A form on a business with several sites and no section left pointing at
-- it stays NULL: there is no telling which site it was made on.
--
-- Rollback: none needed; the previous API image reads "siteId" the same way.

-- 1. Bound by the section that holds it.
WITH refs AS (
    SELECT f."id" AS form_id,
           MIN(p."siteId") AS site_id,
           COUNT(DISTINCT p."siteId") AS sites
    FROM "Form" f
    JOIN "Section" s
      ON s."organizationId" = f."organizationId"
     AND s."type" = 'enquiry'
     AND s."content"->>'formId' = f."id"
    JOIN "PageVersion" v ON v."id" = s."pageVersionId"
    JOIN "Page" p ON p."id" = v."pageId"
    JOIN "Site" st
      ON st."id" = p."siteId"
     AND st."organizationId" = f."organizationId"
    WHERE f."siteId" IS NULL
    GROUP BY f."id"
)
UPDATE "Form" f
SET "siteId" = refs.site_id
FROM refs
WHERE f."id" = refs.form_id
  AND refs.sites = 1
  AND f."siteId" IS NULL;

-- 2. The only site a business has.
UPDATE "Form" f
SET "siteId" = only_site.site_id
FROM (
    SELECT "organizationId", MIN("id") AS site_id
    FROM "Site"
    WHERE "deletedAt" IS NULL
    GROUP BY "organizationId"
    HAVING COUNT(*) = 1
) only_site
WHERE f."siteId" IS NULL
  AND f."organizationId" = only_site."organizationId";
