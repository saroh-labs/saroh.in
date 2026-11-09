-- Stage 9 (owner, 8 Nov 2026): a month's add-on bought on a plan paid one
-- month at a time is its own order, invoiced as source ADDON. Widening the
-- check: every row the old one allowed is still allowed. Brief lock on
-- "SarohInvoice" while the check is validated; the table is small.
ALTER TABLE "SarohInvoice" DROP CONSTRAINT "SarohInvoice_source_known";
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_source_known"
  CHECK ("source" IN ('NEW', 'UPGRADE', 'SCHEDULED', 'RENEWAL', 'TOPUP', 'ADDON'));
