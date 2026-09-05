-- What has happened to a Booking, in order (#121).
--
-- Append-only. A merchant can now move a booking, and a reschedule that
-- overwrote `Booking.startAt` in place would destroy the only record of the
-- time the customer originally agreed to. `Booking.snapshot` holds the FIRST
-- slot and is immutable, so it cannot show the ones in between either.
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "fromStartAt" TIMESTAMP(3),
    "toStartAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");
CREATE INDEX "BookingEvent_organizationId_idx" ON "BookingEvent"("organizationId");

ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull, not Cascade: removing a member must not erase the record of what
-- they did to a customer's booking.
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Isolated on its own organizationId, like Booking itself.
ALTER TABLE "BookingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BookingEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
