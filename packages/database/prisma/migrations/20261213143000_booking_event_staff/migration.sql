-- Change who a booking is with (#1157): a REASSIGNED line in a booking's
-- history names who it was with (`fromStaffId`, null when it had nobody)
-- and who it is with now (`toStaffId`). Both SetNull, so a person removed
-- leaves the line readable. The table's RLS policy already covers the new
-- columns. Additive only: every line written before reads as it did.

-- AlterTable
ALTER TABLE "BookingEvent" ADD COLUMN     "fromStaffId" TEXT,
ADD COLUMN     "toStaffId" TEXT;

-- CreateIndex
CREATE INDEX "BookingEvent_fromStaffId_idx" ON "BookingEvent"("fromStaffId");

-- CreateIndex
CREATE INDEX "BookingEvent_toStaffId_idx" ON "BookingEvent"("toStaffId");

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_fromStaffId_fkey" FOREIGN KEY ("fromStaffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_toStaffId_fkey" FOREIGN KEY ("toStaffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
