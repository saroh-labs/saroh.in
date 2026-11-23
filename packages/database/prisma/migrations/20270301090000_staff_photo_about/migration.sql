-- A team member's own photo and a few words about them (23 Nov 2026).
-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN "photoMediaId" TEXT,
ADD COLUMN "about" TEXT;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_photoMediaId_fkey" FOREIGN KEY ("photoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
