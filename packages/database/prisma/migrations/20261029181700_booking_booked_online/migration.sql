-- Where a booking came from (DEC-095): Free's monthly bookings cap counts
-- only bookings customers make on the business's site, never one the team
-- makes in the workspace.
ALTER TABLE "Booking" ADD COLUMN "bookedOnline" BOOLEAN NOT NULL DEFAULT false;

-- Bookings already made: the booker made it themselves when its first
-- history event names nobody on the team, or when a site account made it.
-- A team member removed since leaves their BOOKED event with no actor too,
-- so a few old desk bookings may read as online; that only ever counts one
-- more towards this month's cap, as every booking counted before.
UPDATE "Booking" b
SET "bookedOnline" = true
WHERE b."customerAccountId" IS NOT NULL
   OR EXISTS (
        SELECT 1
        FROM "BookingEvent" e
        WHERE e."bookingId" = b."id"
          AND e."type" = 'BOOKED'
          AND e."actorUserId" IS NULL
   );
