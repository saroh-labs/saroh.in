-- The bare domain of a `www.` connection (DEC-140, 12 Oct): for
-- `www.example.com`, where `example.com` stood when it was last looked at
-- (FORWARDS, FORWARDS_HTTP_ONLY, POINTS_HERE or NOT_FORWARDING) and when.
-- Both nullable: null on any other hostname, and until the first check.
-- Additive, and the table's row-level security is unchanged.

-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "bareStatus" TEXT,
ADD COLUMN     "bareCheckedAt" TIMESTAMP(3);
