-- A site's look (#189).
--
-- Six curated colour choices and five spacing scalars, stored as choice KEYS
-- rather than raw hex so a palette can be retuned without rewriting every site.
-- Validated at the application boundary by `site-style.ts`.
--
-- Nullable: null means the defaults, which reproduce the current appearance
-- exactly, so this migration is a visual no-op until a merchant chooses
-- something.

ALTER TABLE "Site" ADD COLUMN "style" JSONB;
