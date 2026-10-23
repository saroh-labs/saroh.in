-- Each person's own booking rules, and the business's approval switch
-- (DEC-170, #1038). A person's timing rules (notice needed, how far ahead,
-- gap between bookings, cancelling) fall back to the business's when null;
-- the business gains "Gap between bookings" (none) and "Members' rule
-- changes need approval" (on — every existing row takes the default, and a
-- business with no row reads as on). A Member's change waits as a request.
-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "bookAheadDays" INTEGER,
ADD COLUMN     "freeCancelHours" INTEGER,
ADD COLUMN     "gapMinutes" INTEGER,
ADD COLUMN     "latestBookingMinutes" INTEGER;

-- AlterTable
ALTER TABLE "BookingRules" ADD COLUMN     "gapMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "memberRuleChangesNeedApproval" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "StaffRuleRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "reason" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRuleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRuleRequest_organizationId_status_idx" ON "StaffRuleRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "StaffRuleRequest_staffId_createdAt_idx" ON "StaffRuleRequest"("staffId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRuleRequest_one_waiting" ON "StaffRuleRequest"("staffId") WHERE (status = 'WAITING');

-- AddForeignKey
ALTER TABLE "StaffRuleRequest" ADD CONSTRAINT "StaffRuleRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRuleRequest" ADD CONSTRAINT "StaffRuleRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The person's rules keep to the business rules' own ranges (the DTOs').
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_booking_rules_check"
    CHECK (("bookAheadDays" IS NULL OR "bookAheadDays" BETWEEN 1 AND 365)
           AND ("latestBookingMinutes" IS NULL OR "latestBookingMinutes" BETWEEN 0 AND 10080)
           AND ("freeCancelHours" IS NULL OR "freeCancelHours" BETWEEN 0 AND 720)
           AND ("gapMinutes" IS NULL OR "gapMinutes" BETWEEN 0 AND 240));
ALTER TABLE "BookingRules" ADD CONSTRAINT "BookingRules_gap_check"
    CHECK ("gapMinutes" BETWEEN 0 AND 240);

ALTER TABLE "StaffRuleRequest" ADD CONSTRAINT "StaffRuleRequest_status_check"
    CHECK ("status" IN ('WAITING', 'APPROVED', 'TURNED_DOWN', 'WITHDRAWN'));
-- Decided once: an outcome names who and when; a waiting one neither.
ALTER TABLE "StaffRuleRequest" ADD CONSTRAINT "StaffRuleRequest_decided_check"
    CHECK ((("status" = 'WAITING') = ("decidedAt" IS NULL))
           AND (("decidedAt" IS NULL) = ("decidedByUserId" IS NULL))
           AND ("reason" IS NULL OR ("status" = 'TURNED_DOWN' AND length(btrim("reason")) > 0)));

-- Row-level security, as its neighbours (StaffMember, BookingRules).
ALTER TABLE "StaffRuleRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffRuleRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StaffRuleRequest";
CREATE POLICY "org_isolation" ON "StaffRuleRequest"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
