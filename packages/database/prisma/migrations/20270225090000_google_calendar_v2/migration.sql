-- Google Calendar v2 (DEC-233).
--
-- 1. A person may connect several Google accounts in a business (as many
--    as the plan's `googleAccountsPerPerson` allows): one row per Google
--    account, unique per membership and address, instead of one per
--    membership.
-- 2. Disconnecting keeps the row as DISCONNECTED (no token) with its event
--    records, so the same account connected again picks its events back up.
-- 3. Who may join a Meet without knocking: the business's default, a
--    service's, a booking's; and on each event what Saroh asked for and
--    what Google applied. A booking may choose its own link (GOOGLE_MEET,
--    or MANUAL with a pasted `meetingUrl`).
-- 4. An event left on an account Saroh no longer reaches says when the
--    booking changed after it (`outOfDateAt`), so the screen can say so.

-- DropIndex
DROP INDEX "GoogleCalendarConnection_membershipId_key";

-- DropIndex
DROP INDEX "GoogleCalendarConnection_organizationId_membershipId_key";

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "meetAccess" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "meetAccess" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "meetAccess" TEXT,
ADD COLUMN     "meetingLink" TEXT;

-- AlterTable
ALTER TABLE "GoogleCalendarEvent" ADD COLUMN     "meetAccess" TEXT,
ADD COLUMN     "meetAccessAsked" TEXT,
ADD COLUMN     "outOfDateAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_membershipId_googleEmail_key" ON "GoogleCalendarConnection"("membershipId", "googleEmail");

-- CHECKs: the values the code writes, and nothing else.
ALTER TABLE "GoogleCalendarConnection" DROP CONSTRAINT "GoogleCalendarConnection_status_check";
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_status_check"
  CHECK ("status" IN ('CONNECTED', 'LAPSED', 'DISCONNECTED'));
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_meetAccess_check"
  CHECK ("meetAccess" IS NULL OR "meetAccess" IN ('RESTRICTED', 'TRUSTED', 'OPEN'));
ALTER TABLE "Service" ADD CONSTRAINT "Service_meetAccess_check"
  CHECK ("meetAccess" IS NULL OR "meetAccess" IN ('RESTRICTED', 'TRUSTED', 'OPEN'));
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_meetAccess_check"
  CHECK ("meetAccess" IS NULL OR "meetAccess" IN ('RESTRICTED', 'TRUSTED', 'OPEN'));
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_meetingLink_check"
  CHECK ("meetingLink" IS NULL OR "meetingLink" IN ('MANUAL', 'GOOGLE_MEET'));
ALTER TABLE "GoogleCalendarEvent" ADD CONSTRAINT "GoogleCalendarEvent_meetAccess_check"
  CHECK (("meetAccess" IS NULL OR "meetAccess" IN ('RESTRICTED', 'TRUSTED', 'OPEN'))
     AND ("meetAccessAsked" IS NULL OR "meetAccessAsked" IN ('RESTRICTED', 'TRUSTED', 'OPEN')));
