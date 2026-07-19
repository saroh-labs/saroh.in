-- B5: finish the S1-006 cutover — Store.organizationId becomes NOT NULL.
-- The Stage 1 idempotent backfill (S1-002) already mapped every Store to an
-- Organization, so SET NOT NULL is safe here; in any environment where a Store
-- still lacks an org this migration FAILS LOUDLY (the correct signal to finish
-- that env's backfill first, per the S0-004 runbook). The FK moves to
-- ON DELETE RESTRICT so an Organization with Stores can no longer be deleted out
-- from under them.

-- DropForeignKey
ALTER TABLE "Store" DROP CONSTRAINT "Store_organizationId_fkey";

-- AlterTable
ALTER TABLE "Store" ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

