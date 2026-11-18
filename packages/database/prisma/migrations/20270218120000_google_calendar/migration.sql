-- Google Calendar sync and Meet links for bookings (#1047, #1048).
--
-- 1. Four tables, each the business's, under the org_isolation policy: a
--    person's Google connection (one per person per business, its refresh
--    token sealed), the calendars they chose (one to write to), the event
--    Saroh made for each booking, and the busy times read from Google.
-- 2. `Service.meetingLink`: MANUAL (the typed link, as today) or
--    GOOGLE_MEET (a link of its own per booking). `Booking.meetingUrl`:
--    that booking's own link.
-- 3. `calendar:connect-own`: a stored role that can change bookings
--    (`booking:write`) gains it, so "Calendar only" and the roles a
--    business made can connect their own Google Calendar; a role that
--    can't take bookings doesn't. Never the Reviewer's. Data only,
--    idempotent: a role that already holds it is left as it is.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "meetingLink" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "meetingUrl" TEXT;

-- CreateTable
CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "tokenCiphertext" TEXT,
    "tokenIv" TEXT,
    "tokenAuthTag" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "lapsedAt" TIMESTAMP(3),
    "busyRefreshedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "writeTo" BOOLEAN NOT NULL DEFAULT false,
    "checkBusy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleCalendarLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "meetUrl" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarBusy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarBusy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_membershipId_key" ON "GoogleCalendarConnection"("membershipId");

-- CreateIndex
CREATE INDEX "GoogleCalendarConnection_organizationId_idx" ON "GoogleCalendarConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_organizationId_membershipId_key" ON "GoogleCalendarConnection"("organizationId", "membershipId");

-- CreateIndex
CREATE INDEX "GoogleCalendarLink_organizationId_idx" ON "GoogleCalendarLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarLink_connectionId_calendarId_key" ON "GoogleCalendarLink"("connectionId", "calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarLink_one_write" ON "GoogleCalendarLink"("connectionId") WHERE ("writeTo");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarEvent_bookingId_key" ON "GoogleCalendarEvent"("bookingId");

-- CreateIndex
CREATE INDEX "GoogleCalendarEvent_organizationId_idx" ON "GoogleCalendarEvent"("organizationId");

-- CreateIndex
CREATE INDEX "GoogleCalendarEvent_connectionId_idx" ON "GoogleCalendarEvent"("connectionId");

-- CreateIndex
CREATE INDEX "GoogleCalendarBusy_organizationId_idx" ON "GoogleCalendarBusy"("organizationId");

-- CreateIndex
CREATE INDEX "GoogleCalendarBusy_connectionId_idx" ON "GoogleCalendarBusy"("connectionId");

-- CreateIndex
CREATE INDEX "GoogleCalendarBusy_staffId_startAt_idx" ON "GoogleCalendarBusy"("staffId", "startAt");

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarLink" ADD CONSTRAINT "GoogleCalendarLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarLink" ADD CONSTRAINT "GoogleCalendarLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleCalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarEvent" ADD CONSTRAINT "GoogleCalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarEvent" ADD CONSTRAINT "GoogleCalendarEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarEvent" ADD CONSTRAINT "GoogleCalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleCalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarBusy" ADD CONSTRAINT "GoogleCalendarBusy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarBusy" ADD CONSTRAINT "GoogleCalendarBusy_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleCalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarBusy" ADD CONSTRAINT "GoogleCalendarBusy_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECKs: the values the code writes, and nothing else.
ALTER TABLE "Service" ADD CONSTRAINT "Service_meetingLink_check"
  CHECK ("meetingLink" IN ('MANUAL', 'GOOGLE_MEET'));
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_status_check"
  CHECK ("status" IN ('CONNECTED', 'LAPSED'));
ALTER TABLE "GoogleCalendarBusy" ADD CONSTRAINT "GoogleCalendarBusy_span_check"
  CHECK ("endAt" > "startAt");

-- Row-level security: each table is the business's.
ALTER TABLE "GoogleCalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "GoogleCalendarConnection"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "GoogleCalendarLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "GoogleCalendarLink"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "GoogleCalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "GoogleCalendarEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "GoogleCalendarBusy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarBusy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "GoogleCalendarBusy"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

-- `calendar:connect-own` for every stored role that can change bookings.
UPDATE "OrganizationRole"
SET "actions" = array_append("actions", 'calendar:connect-own'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" <> 'REVIEWER'
  AND 'booking:write' = ANY("actions")
  AND NOT ('calendar:connect-own' = ANY("actions"));
