-- #859: a verified domain is registered with the merchant-sites host
-- (Cloudflare for SaaS custom hostnames). Additive only: four nullable
-- columns, no backfill. Rows verified before this have no hosting id until
-- their next check registers them.

-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "hostingCheckedAt" TIMESTAMP(3),
ADD COLUMN     "hostingError" TEXT,
ADD COLUMN     "hostingId" TEXT,
ADD COLUMN     "hostingStatus" TEXT;
