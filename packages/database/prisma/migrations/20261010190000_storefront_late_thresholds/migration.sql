-- When a storefront's orders count as late (plan B, B17; default 16,
-- DEC-045): one threshold per physical way its orders leave, in minutes from
-- when the order was placed, and when its one-time notice on Orders was
-- dismissed.
--
-- Additive: three integer columns with constant defaults (the defaults the
-- API applied to every storefront before this release: 2 h, 24 h, 48 h) and
-- one nullable timestamp. ADD COLUMN with a constant default is a catalogue
-- change, no table rewrite, under a brief ACCESS EXCLUSIVE lock on
-- "StoreSettings". The image still serving during the deploy never selects
-- them, and rolling back is deploying the previous tag. A storefront with no
-- settings row reads the same defaults in the API.

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "lateRuleNoticeDismissedAt" TIMESTAMP(3),
ADD COLUMN     "localDeliveryLateAfterMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "pickupLateAfterMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "shippingLateAfterMinutes" INTEGER NOT NULL DEFAULT 2880;
