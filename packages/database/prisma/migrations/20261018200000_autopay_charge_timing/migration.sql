-- The merchant chooses when autopay debits (round-2 D13B, DEC-065).
--
-- Expand only. A business-wide setting whose default keeps D13's timing for
-- every business (DAY_AFTER_RENEWAL), and a nullable per-plan override (null:
-- use the business's setting). The previous API never reads or writes
-- either column.
--
-- The one-live-invoice-per-period index now also leaves fully CREDITED
-- invoices out, as it does VOID ones: a GST-registered business can't void,
-- so an early renewal invoice dropped by a cancel or pause is credited, and
-- the renewal must still be able to invoice that period if the subscription
-- carries on. It only allows more rows than before; the previous API treats
-- a CREDITED invoice as live and never issues beside it. The rebuild holds a
-- SHARE lock on "Invoice" while it runs (writes wait).

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "autopayChargeTiming" TEXT NOT NULL DEFAULT 'DAY_AFTER_RENEWAL';

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "autopayChargeTiming" TEXT;

-- The three timings. Prisma cannot declare a CHECK, so it lives here only.
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_autopayChargeTiming_check"
    CHECK ("autopayChargeTiming" IN ('ON_RENEWAL_DATE', 'DAY_AFTER_RENEWAL', 'ON_DUE_DATE'));
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_autopayChargeTiming_check"
    CHECK ("autopayChargeTiming" IS NULL OR "autopayChargeTiming" IN ('ON_RENEWAL_DATE', 'DAY_AFTER_RENEWAL', 'ON_DUE_DATE'));

-- DropIndex
DROP INDEX "Invoice_one_live_per_period";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_one_live_per_period" ON "Invoice"("subscriptionId", "periodStart") WHERE (status <> 'VOID' AND status <> 'CREDITED');
