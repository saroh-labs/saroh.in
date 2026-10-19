-- Free cancelling follows the business's refund policy, for everyone
-- (DEC-170, owner 20 Oct 2026): a person no longer has their own
-- free-cancel window, and a request still waiting closes as "Replaced by a
-- newer change" when the person's rules change directly or approval is
-- switched off.
--
-- The person's column is dropped, not kept: it shipped with
-- 20261203100000_staff_booking_rules days before and was never on
-- production, nothing reads it any more, and keeping it would leave a value
-- that looks like a rule and isn't one. Bookings already made keep the
-- deadline they were made with (`Booking.freeCancelUntil`); new ones take
-- the business's.

-- 1. Clear what any person had, so it is the business's from here on.
UPDATE "StaffMember" SET "freeCancelHours" = NULL WHERE "freeCancelHours" IS NOT NULL;

-- 2. A request still waiting stops asking for it. One that asked for
--    nothing else has nothing left to decide: it closes as replaced, by
--    the person who asked (no one else made the change).
UPDATE "StaffRuleRequest"
SET "changes" = "changes" - 'freeCancelHours'
WHERE "status" = 'WAITING' AND "changes" ? 'freeCancelHours';

-- 3. REPLACED, a status of its own (before the close below uses it).
ALTER TABLE "StaffRuleRequest" DROP CONSTRAINT "StaffRuleRequest_status_check";
ALTER TABLE "StaffRuleRequest" ADD CONSTRAINT "StaffRuleRequest_status_check"
    CHECK ("status" IN ('WAITING', 'APPROVED', 'TURNED_DOWN', 'WITHDRAWN', 'REPLACED'));

UPDATE "StaffRuleRequest"
SET "status" = 'REPLACED',
    "decidedAt" = CURRENT_TIMESTAMP,
    "decidedByUserId" = "requestedByUserId",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'WAITING' AND "changes" = '{}'::jsonb;

-- 4. Drop the column. Its range CHECK names it, so it goes first and comes
--    back with the other three ranges, as they were.
ALTER TABLE "StaffMember" DROP CONSTRAINT "StaffMember_booking_rules_check";
ALTER TABLE "StaffMember" DROP COLUMN "freeCancelHours";
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_booking_rules_check"
    CHECK (("bookAheadDays" IS NULL OR "bookAheadDays" BETWEEN 1 AND 365)
           AND ("latestBookingMinutes" IS NULL OR "latestBookingMinutes" BETWEEN 0 AND 10080)
           AND ("gapMinutes" IS NULL OR "gapMinutes" BETWEEN 0 AND 240));
