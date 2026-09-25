-- A business's logo: a library object, and the address it is served from.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "logoMediaId" TEXT,
ADD COLUMN     "logoUrl" TEXT;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
