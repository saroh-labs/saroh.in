-- An issued invoice prints the seller as it was at issue (DEC-082): the
-- business's name, legal name and contact email are frozen on the invoice
-- like its GSTIN, state and address already are, so renaming the business
-- never changes an old invoice, its PDF or a customer's link.
--
-- Additive (expand only): three nullable columns the previous API image
-- never reads or writes.
--
-- Backfill: every invoice that is not a draft takes the values its paper
-- printed until now, read live from settings — `Organization.name`,
-- `BusinessProfile.legalName` and `BusinessProfile.contactEmail`. A draft
-- stays null: it prints today's settings until it is issued. `updatedAt`
-- is left alone; nothing a person did changed.
--
-- Rollback: the previous image ignores the columns and goes on reading the
-- live settings.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sellerEmail" TEXT,
ADD COLUMN     "sellerLegalName" TEXT,
ADD COLUMN     "sellerName" TEXT;

-- Backfill issued paper from today's settings.
UPDATE "Invoice" AS i
SET "sellerName"      = o."name",
    "sellerLegalName" = bp."legalName",
    "sellerEmail"     = bp."contactEmail"
FROM "Organization" AS o
LEFT JOIN "BusinessProfile" AS bp ON bp."organizationId" = o."id"
WHERE o."id" = i."organizationId"
  AND i."status" <> 'DRAFT';
