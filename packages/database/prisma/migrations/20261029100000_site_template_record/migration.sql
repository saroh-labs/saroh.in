-- A site remembers the template it was made from (industry templates, KTD-7).
-- Existing sites stay NULL: which template made them was never recorded, and
-- it is not guessed.
ALTER TABLE "Site" ADD COLUMN "templateId" TEXT,
ADD COLUMN "templateStyleId" TEXT,
ADD COLUMN "templateVersion" INTEGER;
