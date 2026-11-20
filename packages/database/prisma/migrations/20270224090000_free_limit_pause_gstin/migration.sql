-- DEC-227 (20 Nov): a move down to Free is never refused; the business that
-- moved last while its owner was over the one-Free rule is paused instead.
ALTER TABLE "Organization" ADD COLUMN "freeLimitPausedAt" TIMESTAMP(3);

-- GSTINs are stored as letters and digits, upper-cased, so the "same payer"
-- check (offers once per person) matches however one was typed.
UPDATE "BillingProfile"
SET "gstin" = upper(regexp_replace("gstin", '[^0-9A-Za-z]', '', 'g'))
WHERE "gstin" IS NOT NULL AND "gstin" !~ '^[0-9A-Z]*$';

UPDATE "BusinessProfile" AS p
SET "taxId" = upper(regexp_replace(p."taxId", '[^0-9A-Za-z]', '', 'g'))
FROM "Organization" AS o
WHERE o."id" = p."organizationId"
  AND o."edition" = 'INDIA'
  AND p."taxId" IS NOT NULL
  AND p."taxId" !~ '^[0-9A-Z]*$';
