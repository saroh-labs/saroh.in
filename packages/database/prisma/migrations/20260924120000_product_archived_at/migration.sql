-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3);


-- Products already archived: the last change is the best record of when.
UPDATE "Product" SET "archivedAt" = "updatedAt" WHERE "status" = 'ARCHIVED';
