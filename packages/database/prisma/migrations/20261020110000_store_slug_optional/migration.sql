-- The storefront "Web address" is removed from use (DEC-069, L14): nothing
-- reads Store.slug any more and new locations are created without one.
--
-- Expand only. Existing rows keep their slug and the unique index stays
-- (NULLs never clash in a PostgreSQL unique index). The previous API still
-- writes slugs, which is harmless here. L15 drops the column and its index
-- in a later release.

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "slug" DROP NOT NULL;
