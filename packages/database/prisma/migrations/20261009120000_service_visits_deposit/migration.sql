-- Service fields for the Service Editor and the booking page (round 2, E1).
-- Additive with defaults, so every existing service reads as today: one
-- visit, nothing taken at booking, shown on the booking page. A booking's
-- own place (EITHER services) is nullable; null means "as the service says".
-- `Service.locationType` is a String, so EITHER needs no change here.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "visits" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "depositMode" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "showOnBookingPage" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "locationType" TEXT;

-- Prisma cannot declare a CHECK, and does not read one as drift. The API
-- refuses these first with a sentence; the database refuses anything else.
ALTER TABLE "Service"
    ADD CONSTRAINT "Service_visits_range"
    CHECK ("visits" BETWEEN 1 AND 12);

ALTER TABLE "Service"
    ADD CONSTRAINT "Service_depositMode_known"
    CHECK ("depositMode" IN ('NONE', 'PERCENT_25', 'PERCENT_50', 'FULL'));

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_locationType_known"
    CHECK ("locationType" IS NULL OR "locationType" IN ('IN_PERSON', 'ONLINE'));
