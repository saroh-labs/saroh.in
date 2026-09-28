-- A booking's free-cancel deadline, fixed when it is made (round 2, E8;
-- DEC-051): its start less the business's free-cancel hours at that moment.
-- No move, by staff or by the customer, changes it, so moving a booking a
-- week out can't turn a late cancel into a free refund. Nullable and
-- additive: bookings made before it, and bookings made while the business
-- had no free-cancel rule, keep null and are judged by their start, as
-- before.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "freeCancelUntil" TIMESTAMP(3);
