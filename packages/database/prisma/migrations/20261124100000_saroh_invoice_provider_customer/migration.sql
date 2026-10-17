-- Saroh's invoice keeps the business's provider customer id beside the
-- payment's (17 Oct 2026). Nullable, no backfill: older invoices keep null.
ALTER TABLE "SarohInvoice" ADD COLUMN "providerCustomerId" TEXT;
