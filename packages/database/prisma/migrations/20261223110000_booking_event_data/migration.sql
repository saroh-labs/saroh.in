-- A booking's money lines in its history (#1137): a refund's amount, id and
-- outcome on REFUNDED and REFUND_FAILED. The table's RLS policy covers it.
ALTER TABLE "BookingEvent" ADD COLUMN "data" JSONB;
