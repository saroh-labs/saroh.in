-- The booking page's "Anything we should know?" (round 2, E7): what the
-- booker wrote, kept on the booking as a sensitive note until staff turn it
-- into Needs attention (C12). Nullable and additive: every booking before it,
-- and every booking whose booker left it empty, has none.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "intakeNote" TEXT;

-- Prisma cannot declare a CHECK, and does not read one as drift. The API
-- refuses a longer note first with a sentence; the database refuses anything
-- else.
ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_intakeNote_length"
    CHECK ("intakeNote" IS NULL OR char_length("intakeNote") <= 1000);
