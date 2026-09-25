-- 15 photos and 3 videos per product (#517). Additive: every existing row is
-- a photo, with no duration and no poster.

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'photo',
ADD COLUMN     "posterMediaId" TEXT,
ADD COLUMN     "posterUrl" TEXT;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_posterMediaId_fkey" FOREIGN KEY ("posterMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
