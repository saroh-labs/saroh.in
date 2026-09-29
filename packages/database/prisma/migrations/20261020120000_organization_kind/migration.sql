-- What is being set up (DEC-070, K1): a business, just me, or a site for my
-- work. It changes Saroh's words and defaults only.
--
-- Expand only. A constant default needs no table rewrite on PostgreSQL 11+,
-- and it makes every existing business BUSINESS, so there is no backfill.
-- The previous API never reads or writes the column, and the previous app
-- never sends `kind`, which the new API stores as BUSINESS.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'BUSINESS';

-- The three kinds. Prisma cannot declare a CHECK, so it lives here only.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_kind_check"
    CHECK ("kind" IN ('BUSINESS', 'SOLO', 'WORK'));
