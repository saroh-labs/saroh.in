-- Who can book a service (DEC-170, Q5 of 19 Oct): "Customers" is
-- `showOnBookingPage`; "Your team" is this. Every service the team books
-- today stays bookable by them.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "bookableByTeam" BOOLEAN NOT NULL DEFAULT true;
