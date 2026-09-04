-- A section's stable identity across saves (#193 groundwork).
--
-- Saving a draft deletes every section on the page and recreates them, so
-- `Section.id` changes on every save and cannot be pointed at by anything that
-- has to survive an edit. `key` is minted once by the editor and carried
-- forward, so a reviewer's comment can stay attached to its section.
--
-- Backfill: existing rows adopt their current id as their key. It is already
-- unique and stable from this point on, and it means no section starts life
-- without an identity.
ALTER TABLE "Section" ADD COLUMN "key" TEXT;
UPDATE "Section" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "Section" ALTER COLUMN "key" SET NOT NULL;

CREATE UNIQUE INDEX "Section_pageVersionId_key_key" ON "Section"("pageVersionId", "key");
