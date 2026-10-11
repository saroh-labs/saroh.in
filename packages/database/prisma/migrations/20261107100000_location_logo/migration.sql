-- A location's own logo (DEC-123): the library object beside the address
-- "Store"."logo" already holds. Null on both: the location uses the
-- business logo. Additive; "Store" keeps its policies, which read the
-- row's "organizationId" and not its columns.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "logoMediaId" TEXT;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
